"""
Creature Archive API — FastAPI Backend

Auth flow (Firebase Auth + FastAPI):
─────────────────────────────────────
1. MOBILE: User signs up via Firebase Auth SDK → createUserWithEmailAndPassword()
   This creates the Firebase Auth record and returns a uid + ID token.

2. MOBILE: Immediately POST /auth/signup with the ID token in Authorization header.
   The backend verifies the token, extracts the uid, and creates the Firestore
   user profile document (users/{uid}).

3. MOBILE: For all subsequent requests, the mobile app calls user.getIdToken()
   and sends it as "Bearer <token>" in the Authorization header.

4. BACKEND: Every protected route calls _verify_token(authorization) which
   decodes the Firebase ID token and returns the uid. Routes then scope all
   Firestore queries to that uid.

5. TOKEN REFRESH: Firebase ID tokens expire after 1 hour. The mobile SDK
   auto-refreshes them. The backend just verifies whatever token it receives.
"""

import random
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

from .config import init_firebase, get_storage_bucket
from .crud import (
    batch_sync_entries,
    create_entry,
    delete_entry,
    get_entry,
    list_entries,
    update_entry,
)
from .sync_service import perform_two_way_sync
from .ml_service import (
    get_all_species,
    get_species_by_name,
    get_species_count,
    is_model_loaded,
    validate_prediction,
)
from .models import (
    ForgotPasswordInitRequest,
    ForgotPasswordInitResponse,
    ForgotPasswordResetRequest,
    ForgotPasswordVerifyRequest,
    ForgotPasswordVerifyResponse,
    HealthCheckResponse,
    ImageUploadResponse,
    JournalEntryCreate,
    JournalEntryResponse,
    JournalEntryUpdate,
    ProfileImageUploadResponse,
    ProfileUpdateRequest,
    SignupRequest,
    TwoWaySyncRequest,
    TwoWaySyncResponse,
    UserProfileResponse,
)

app = FastAPI(title="Creature Archive API", version="1.0.0")


# ── Auth helper ────────────────────────────────────────────────────────

def _verify_token(authorization: str) -> str:
    """
    Verify Firebase ID token from the Authorization header.
    Returns the authenticated user's UID.

    Mobile usage:
        val token = Firebase.auth.currentUser!!.getIdToken(false).await().token
        val response = api.someEndpoint(headers = mapOf("Authorization" to "Bearer $token"))
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split("Bearer ")[1]
    try:
        # Ensure Firebase Admin SDK is initialized before verifying
        init_firebase()
        from firebase_admin import auth
        decoded = auth.verify_id_token(token)
        return decoded["uid"]
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[AUTH] Token verification failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=401, detail="Invalid or expired token.")


# ── Auth / Signup ─────────────────────────────────────────────────────

@app.post("/auth/signup", response_model=UserProfileResponse, tags=["auth"])
def signup(
    body: SignupRequest,
    authorization: str = Header(...),
):
    """
    Create the Firestore user profile after Firebase Auth signup.

    Mobile flow:
        1. FirebaseAuth.createUserWithEmailAndPassword(email, password)
        2. val idToken = auth.currentUser.getIdToken(true).await().token
        3. POST /auth/signup  { "email": "...", "firstName": "...", "lastName": "...", ... }
           Authorization: Bearer <idToken>

    The backend verifies the token, extracts the uid, and writes the
    users/{uid} document in Firestore.
    """
    uid = _verify_token(authorization)

    db = init_firebase()
    user_ref = db.collection("users").document(uid)

    # Prevent duplicate profiles
    if user_ref.get().exists:
        raise HTTPException(status_code=409, detail="User profile already exists.")

    now = datetime.now(timezone.utc)
    user_doc = {
        "uid": uid,
        "email": body.email,
        "firstName": body.firstName,
        "lastName": body.lastName,
        "institution": body.institution,
        "currentRole": body.currentRole,
        "entryCount": 0,
        "createdAt": now,
        "lastSync": None,
        # Normalized verification fields for forgot-password challenge
        "_v_first_name": body.firstName.strip().lower(),
        "_v_last_name": body.lastName.strip().lower(),
        "_v_current_role": body.currentRole.strip().lower(),
        "_v_institution": body.institution.strip().lower(),
    }
    user_ref.set(user_doc)

    return UserProfileResponse(**user_doc)


@app.get("/auth/me", response_model=UserProfileResponse, tags=["auth"])
def get_current_user(
    authorization: str = Header(...),
):
    """
    Return the authenticated user's Firestore profile.

    Mobile usage:
        GET /auth/me
        Authorization: Bearer <idToken>

    Use this on app launch to fetch the user profile and confirm auth is valid.
    """
    uid = _verify_token(authorization)

    db = init_firebase()
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="User profile not found. Call POST /auth/signup first.")

    data = doc.to_dict()
    return UserProfileResponse(
        uid=uid,
        email=data["email"],
        firstName=data["firstName"],
        lastName=data["lastName"],
        institution=data.get("institution", ""),
        currentRole=data.get("currentRole", ""),
        entryCount=data.get("entryCount", 0),
        createdAt=data["createdAt"],
        lastSync=data.get("lastSync"),
        profileImage=data.get("profileImage"),
    )


@app.patch("/auth/me", response_model=UserProfileResponse, tags=["auth"])
def update_profile(
    body: ProfileUpdateRequest,
    authorization: str = Header(...),
):
    """
    Update the authenticated user's Firestore profile.

    Mobile usage:
        PATCH /auth/me
        Authorization: Bearer <idToken>
        Body: { "firstName": "...", "institution": "..." }  (only changed fields)
    """
    uid = _verify_token(authorization)

    db = init_firebase()
    user_ref = db.collection("users").document(uid)

    doc = user_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="User profile not found.")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")

    # Keep normalized verification fields in sync
    _field_to_verification = {
        "firstName": "_v_first_name",
        "lastName": "_v_last_name",
        "currentRole": "_v_current_role",
        "institution": "_v_institution",
    }
    for field, v_field in _field_to_verification.items():
        if field in updates and isinstance(updates[field], str):
            updates[v_field] = updates[field].strip().lower()

    updates["lastSync"] = datetime.now(timezone.utc)
    user_ref.update(updates)

    data = user_ref.get().to_dict()
    return UserProfileResponse(
        uid=uid,
        email=data["email"],
        firstName=data["firstName"],
        lastName=data["lastName"],
        institution=data.get("institution", ""),
        currentRole=data.get("currentRole", ""),
        entryCount=data.get("entryCount", 0),
        createdAt=data["createdAt"],
        lastSync=data.get("lastSync"),
        profileImage=data.get("profileImage"),
    )


@app.delete("/auth/me", tags=["auth"])
def delete_account(
    authorization: str = Header(...),
):
    """
    Delete the user's Firestore profile and Firebase Auth account.

    Mobile usage:
        DELETE /auth/me
        Authorization: Bearer <idToken>
    """
    uid = _verify_token(authorization)

    db = init_firebase()

    # Delete all user's journal entries
    entries = db.collection("journal_entries").where("userId", "==", uid).stream()
    for entry_doc in entries:
        entry_doc.reference.delete()

    # Delete user profile
    db.collection("users").document(uid).delete()

    # Delete the Firebase Auth account
    from firebase_admin import auth
    try:
        auth.delete_user(uid)
    except Exception:
        pass  # Auth record may already be gone

    return {"detail": "Account and all data deleted."}


# ── Forgot Password (Unauthenticated) ────────────────────────────────

# In-memory session store for password reset flow
# In production, consider using Redis or Firestore for persistence across restarts
_reset_sessions: dict[str, dict] = {}

# Verification field mapping: DB key → display label
_VERIFICATION_FIELDS = {
    "_v_first_name": "First Name",
    "_v_last_name": "Last Name",
    "_v_current_role": "Current Role",
    "_v_institution": "School or Company",
}

# Reverse mapping: display label → DB key
_LABEL_TO_FIELD = {v: k for k, v in _VERIFICATION_FIELDS.items()}


def _cleanup_stale_sessions():
    """Remove sessions older than 30 minutes."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    expired = [k for k, v in _reset_sessions.items() if v["created_at"] < cutoff]
    for k in expired:
        del _reset_sessions[k]


def _ensure_verification_fields(user_ref, data: dict) -> dict:
    """
    If user signed up before verification fields existed,
    compute and store them from existing profile fields.
    """
    updates = {}
    field_map = {
        "_v_first_name": "firstName",
        "_v_last_name": "lastName",
        "_v_current_role": "currentRole",
        "_v_institution": "institution",
    }
    for v_field, source_field in field_map.items():
        if v_field not in data:
            value = data.get(source_field, "")
            updates[v_field] = value.strip().lower() if isinstance(value, str) else ""

    if updates:
        user_ref.update(updates)
        data.update(updates)

    return data


@app.post(
    "/auth/forgot-password/initiate",
    response_model=ForgotPasswordInitResponse,
    tags=["auth"],
)
def forgot_password_initiate(body: ForgotPasswordInitRequest):
    """
    Step 1: Start the forgot-password flow.
    Looks up the email, picks 2 random challenge fields.
    Returns the same response structure whether or not email exists
    (to avoid leaking email existence).
    """
    _cleanup_stale_sessions()

    db = init_firebase()
    email = body.email.strip().lower()

    # Query Firestore for user by email
    users_query = db.collection("users").where("email", "==", email).limit(1).get()
    user_doc = None
    user_data = None
    user_ref = None

    for doc in users_query:
        user_doc = doc
        user_data = doc.to_dict()
        user_ref = doc.reference
        break

    session_token = str(uuid.uuid4())

    if user_data is None:
        # Email not found — return dummy response (don't reveal email doesn't exist)
        dummy_fields = random.sample(list(_VERIFICATION_FIELDS.values()), 2)
        # Store a dummy session that will always fail verification
        _reset_sessions[session_token] = {
            "uid": None,
            "fields": {},
            "field_labels": dummy_fields,
            "attempts": 0,
            "locked_until": None,
            "created_at": datetime.now(timezone.utc),
            "reset_token": None,
        }
        return ForgotPasswordInitResponse(
            session_token=session_token,
            challenge_fields=dummy_fields,
        )

    # Ensure verification fields exist (backfill for older accounts)
    user_data = _ensure_verification_fields(user_ref, user_data)

    # Randomly pick 2 of the 4 verification fields
    all_v_fields = list(_VERIFICATION_FIELDS.keys())
    chosen_keys = random.sample(all_v_fields, 2)
    chosen_labels = [_VERIFICATION_FIELDS[k] for k in chosen_keys]

    # Store session
    _reset_sessions[session_token] = {
        "uid": user_data["uid"],
        "fields": {_VERIFICATION_FIELDS[k]: user_data.get(k, "") for k in chosen_keys},
        "field_labels": chosen_labels,
        "attempts": 0,
        "locked_until": None,
        "created_at": datetime.now(timezone.utc),
        "reset_token": None,
    }

    return ForgotPasswordInitResponse(
        session_token=session_token,
        challenge_fields=chosen_labels,
    )


@app.post(
    "/auth/forgot-password/verify",
    response_model=ForgotPasswordVerifyResponse,
    tags=["auth"],
)
def forgot_password_verify(body: ForgotPasswordVerifyRequest):
    """
    Step 2: Verify the user's answers to the 2 challenge questions.
    Returns a reset token on success.
    Max 3 attempts, then locked for 5 minutes.
    """
    _cleanup_stale_sessions()

    session = _reset_sessions.get(body.session_token)
    if not session:
        raise HTTPException(status_code=400, detail="Invalid or expired session.")

    # Check session expiry (15 minutes)
    if datetime.now(timezone.utc) - session["created_at"] > timedelta(minutes=15):
        del _reset_sessions[body.session_token]
        raise HTTPException(status_code=400, detail="Session expired. Please start over.")

    # Check if locked out
    if session["locked_until"] and datetime.now(timezone.utc) < session["locked_until"]:
        remaining = (session["locked_until"] - datetime.now(timezone.utc)).seconds // 60 + 1
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Please try again in {remaining} minute(s).",
        )

    # If this is a dummy session (email didn't exist), always fail
    if session["uid"] is None:
        session["attempts"] += 1
        if session["attempts"] >= 3:
            session["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=5)
        raise HTTPException(status_code=400, detail="Verification failed. Please try again.")

    # Normalize and compare answers
    stored_fields = session["fields"]
    all_match = True
    for label, stored_value in stored_fields.items():
        user_answer = body.answers.get(label, "").strip().lower()
        if user_answer != stored_value:
            all_match = False
            break

    if not all_match:
        session["attempts"] += 1
        if session["attempts"] >= 3:
            session["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=5)
        raise HTTPException(status_code=400, detail="Verification failed. Please try again.")

    # Success — generate reset token
    reset_token = str(uuid.uuid4())
    session["reset_token"] = reset_token
    session["reset_token_created"] = datetime.now(timezone.utc)

    return ForgotPasswordVerifyResponse(reset_token=reset_token)


@app.post("/auth/forgot-password/reset", tags=["auth"])
def forgot_password_reset(body: ForgotPasswordResetRequest):
    """
    Step 3: Reset the password using the reset token.
    Uses Firebase Admin SDK to update the user's password directly.
    """
    _cleanup_stale_sessions()

    # Find the session that owns this reset token
    target_session_key = None
    target_session = None
    for key, session in _reset_sessions.items():
        if session.get("reset_token") == body.reset_token:
            target_session_key = key
            target_session = session
            break

    if not target_session or not target_session.get("uid"):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    # Check reset token expiry (10 minutes)
    token_created = target_session.get("reset_token_created")
    if not token_created or datetime.now(timezone.utc) - token_created > timedelta(minutes=10):
        del _reset_sessions[target_session_key]
        raise HTTPException(status_code=400, detail="Reset token expired. Please start over.")

    # Update password via Firebase Admin SDK
    from firebase_admin import auth

    try:
        auth.update_user(target_session["uid"], password=body.new_password)
    except Exception as e:
        print(f"[AUTH] Password reset failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset password. Please try again.")

    # Clean up session
    del _reset_sessions[target_session_key]

    return {"detail": "Password reset successful. You can now sign in with your new password."}


# ── Health ─────────────────────────────────────────────────────────────

@app.get("/", tags=["health"])
def root():
    return {"message": "Creature Archive API is running"}


@app.get("/health", response_model=HealthCheckResponse, tags=["health"])
def health_check():
    return HealthCheckResponse(
        status="healthy",
        model_loaded=is_model_loaded(),
        species_count=get_species_count(),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# ── Journal Entries CRUD ───────────────────────────────────────────────

@app.post("/entries", response_model=JournalEntryResponse, tags=["entries"])
def create_journal_entry(
    entry: JournalEntryCreate,
    authorization: str = Header(...),
):
    """Create a new journal entry."""
    uid = _verify_token(authorization)
    try:
        result = create_entry(entry, uid)
        return JournalEntryResponse(**result)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.get("/entries", response_model=list[JournalEntryResponse], tags=["entries"])
def list_journal_entries(
    limit: int = 50,
    offset: int = 0,
    authorization: str = Header(...),
):
    """List all journal entries for the authenticated user."""
    uid = _verify_token(authorization)
    results = list_entries(uid, limit=limit, offset=offset)
    return [JournalEntryResponse(**r) for r in results]


# ── Batch Sync (offline-first) — registered before {entry_id} routes ──

@app.post("/entries/sync", response_model=list[JournalEntryResponse], tags=["sync"])
def sync_pending_entries(
    entries: list[JournalEntryCreate],
    authorization: str = Header(...),
):
    """
    Batch sync pending entries from the mobile client.
    Skips duplicates based on userId + capturedAt.

    DEPRECATED: Use POST /entries/two-way-sync instead for full bidirectional sync.
    """
    uid = _verify_token(authorization)
    results = batch_sync_entries(entries, uid)
    return [JournalEntryResponse(**r) for r in results]


@app.post("/entries/two-way-sync", response_model=TwoWaySyncResponse, tags=["sync"])
def two_way_sync(
    request: TwoWaySyncRequest,
    authorization: str = Header(...),
):
    """
    Two-way synchronization between mobile client and cloud.

    This endpoint handles the complete sync flow:
    1. Receives all local entries from the client
    2. Fetches all cloud entries for the user
    3. Performs conflict resolution based on lastUpdated timestamps
    4. Updates/creates/deletes entries in Firestore as needed
    5. Returns merged result for client to update local storage

    Mobile usage:
        POST /entries/two-way-sync
        Authorization: Bearer <idToken>
        Body: {
            "localEntries": [...],
            "lastSyncTime": 1234567890000  // optional
        }

    The response contains:
        - mergedEntries: All entries after merge (client should replace local storage)
        - uploaded: Count of entries uploaded to cloud
        - downloaded: Count of entries downloaded from cloud
        - deleted: Count of entries deleted from cloud
        - conflicts: Count of conflicts resolved (cloud was newer)
        - errors: Any error messages
        - syncTimestamp: Server timestamp to use as lastSyncTime in next sync
    """
    uid = _verify_token(authorization)
    try:
        return perform_two_way_sync(request, uid)
    except Exception as e:
        # Never return HTTP 500 for sync — always return structured response
        return TwoWaySyncResponse(
            success=False,
            mergedEntries=[],
            uploaded=0,
            downloaded=0,
            deleted=0,
            conflicts=0,
            errors=[f"Unexpected sync error: {str(e)}"],
            syncTimestamp=int(datetime.now(timezone.utc).timestamp() * 1000),
            syncDeferred=True,
        )


# ── Single Entry operations ────────────────────────────────────────────

@app.get("/entries/{entry_id}", response_model=JournalEntryResponse, tags=["entries"])
def get_journal_entry(
    entry_id: str,
    authorization: str = Header(...),
):
    """Get a single journal entry by ID."""
    uid = _verify_token(authorization)
    try:
        result = get_entry(entry_id, uid)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return JournalEntryResponse(**result)


@app.patch("/entries/{entry_id}", response_model=JournalEntryResponse, tags=["entries"])
def update_journal_entry(
    entry_id: str,
    updates: JournalEntryUpdate,
    authorization: str = Header(...),
):
    """Partially update a journal entry."""
    uid = _verify_token(authorization)
    try:
        result = update_entry(entry_id, updates, uid)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return JournalEntryResponse(**result)


@app.delete("/entries/{entry_id}", tags=["entries"])
def delete_journal_entry(
    entry_id: str,
    authorization: str = Header(...),
):
    """Delete a journal entry."""
    uid = _verify_token(authorization)
    try:
        deleted = delete_entry(entry_id, uid)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return {"detail": "Entry deleted."}


# ── Image Upload (Backend-Controlled Firebase Storage) ─────────────────

@app.post("/entries/upload-image", response_model=ImageUploadResponse, tags=["images"])
def upload_entry_image(
    image: UploadFile = File(...),
    localId: str = Form(...),
    authorization: str = Header(...),
):
    """
    Upload a journal entry image to Firebase Storage via the backend.
    Frontend must NOT upload directly to Firebase Storage.

    Mobile usage:
        POST /entries/upload-image
        Authorization: Bearer <idToken>
        Content-Type: multipart/form-data
        Body: image (file), localId (string)

    Returns:
        imageUrl: Firebase Storage download URL
        storagePath: Firebase Storage path
        localId: The localId passed in
    """
    uid = _verify_token(authorization)

    try:
        bucket = get_storage_bucket()
        storage_path = f"users/{uid}/journals/{localId}/species.jpg"

        # Generate a download token for the Firebase Storage URL
        download_token = str(uuid.uuid4())

        blob = bucket.blob(storage_path)
        blob.metadata = {"firebaseStorageDownloadTokens": download_token}

        # Read file content to bytes (handles stream position issues)
        file_content = image.file.read()
        blob.upload_from_string(
            file_content,
            content_type=image.content_type or "image/jpeg",
        )

        # Construct Firebase Storage download URL with token
        encoded_path = quote(storage_path, safe="")
        image_url = (
            f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}"
            f"/o/{encoded_path}?alt=media&token={download_token}"
        )

        return ImageUploadResponse(
            imageUrl=image_url,
            storagePath=storage_path,
            localId=localId,
        )
    except Exception as e:
        print(f"[UPLOAD] Entry image upload failed: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Image upload failed: {str(e)}",
        )


@app.post("/auth/upload-profile-image", response_model=ProfileImageUploadResponse, tags=["images"])
def upload_profile_image(
    image: UploadFile = File(...),
    authorization: str = Header(...),
):
    """
    Upload a profile image to Firebase Storage via the backend.
    Frontend must NOT upload directly to Firebase Storage.

    Mobile usage:
        POST /auth/upload-profile-image
        Authorization: Bearer <idToken>
        Content-Type: multipart/form-data
        Body: image (file)

    Returns:
        imageUrl: Firebase Storage download URL
        storagePath: Firebase Storage path
    """
    uid = _verify_token(authorization)

    try:
        bucket = get_storage_bucket()
        storage_path = f"users/{uid}/profile/profile.jpg"

        # Generate a download token for the Firebase Storage URL
        download_token = str(uuid.uuid4())

        blob = bucket.blob(storage_path)
        blob.metadata = {"firebaseStorageDownloadTokens": download_token}

        # Read file content to bytes (handles stream position issues)
        file_content = image.file.read()
        blob.upload_from_string(
            file_content,
            content_type=image.content_type or "image/jpeg",
        )

        # Construct Firebase Storage download URL with token
        encoded_path = quote(storage_path, safe="")
        image_url = (
            f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}"
            f"/o/{encoded_path}?alt=media&token={download_token}"
        )

        # Update user profile in Firestore with the image URL
        db = init_firebase()
        user_ref = db.collection("users").document(uid)
        if user_ref.get().exists:
            user_ref.update({"profileImage": image_url})

        return ProfileImageUploadResponse(
            imageUrl=image_url,
            storagePath=storage_path,
        )
    except Exception as e:
        print(f"[UPLOAD] Profile image upload failed: {type(e).__name__}: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Profile image upload failed: {str(e)}",
        )


# ── Species Lookup & Validation ────────────────────────────────────────

@app.get("/species", tags=["species"])
def list_all_species():
    """Return all 101 species with scientific names and descriptions."""
    return get_all_species()


@app.get("/species/{common_name}", tags=["species"])
def get_species_info(common_name: str):
    """Look up a species by common name."""
    species = get_species_by_name(common_name)
    if species is None:
        raise HTTPException(status_code=404, detail=f"Species '{common_name}' not found.")
    return species


@app.post("/species/validate", tags=["species"])
def validate_species_prediction(
    species_name: str,
    confidence_score: float,
    authorization: str = Header(...),
):
    """
    Post-sync validation: map a mobile prediction (common name + confidence)
    to the canonical scientific name and description from species_data.json.
    """
    _verify_token(authorization)
    return validate_prediction(species_name, confidence_score)
