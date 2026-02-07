from datetime import datetime, timezone

from google.cloud.firestore_v1 import GeoPoint

from .config import init_firebase
from .models import JournalEntryCreate, JournalEntryUpdate

COLLECTION = "journal_entries"


def _db():
    return init_firebase()


def _entry_to_firestore(entry: JournalEntryCreate) -> dict:
    """Convert a Pydantic model to a Firestore-compatible dict."""
    return {
        "userId": entry.userId,
        "speciesName": entry.speciesName,
        "scientificName": entry.scientificName,
        "confidenceScore": entry.confidenceScore,
        "imageUrl": entry.imageUrl,
        "location": GeoPoint(entry.location.latitude, entry.location.longitude),
        "capturedAt": entry.capturedAt,
        "syncedAt": datetime.now(timezone.utc),
        "notes": entry.notes,
        "tags": entry.tags,
        "behaviorObserved": entry.behaviorObserved,
        "quantity": entry.quantity,
        "habitatType": entry.habitatType,
    }


def _doc_to_response(doc) -> dict:
    """Convert a Firestore document to a response dict."""
    data = doc.to_dict()
    loc = data.get("location")
    return {
        "id": doc.id,
        "userId": data["userId"],
        "speciesName": data["speciesName"],
        "scientificName": data["scientificName"],
        "confidenceScore": data["confidenceScore"],
        "imageUrl": data["imageUrl"],
        "location": {
            "latitude": loc.latitude if loc else 0,
            "longitude": loc.longitude if loc else 0,
        },
        "capturedAt": data["capturedAt"],
        "syncedAt": data["syncedAt"],
        "notes": data.get("notes", ""),
        "tags": data.get("tags", []),
        "behaviorObserved": data.get("behaviorObserved", ""),
        "quantity": data.get("quantity", 1),
        "habitatType": data.get("habitatType", ""),
    }


# ── CREATE ─────────────────────────────────────────────────────────────

def create_entry(entry: JournalEntryCreate, auth_uid: str) -> dict:
    """Create a new journal entry. Enforces userId == auth_uid."""
    if entry.userId != auth_uid:
        raise PermissionError("userId does not match authenticated user.")

    doc_ref = _db().collection(COLLECTION).document()
    doc_data = _entry_to_firestore(entry)
    doc_ref.set(doc_data)

    # Increment user's entryCount
    user_ref = _db().collection("users").document(auth_uid)
    user_ref.update({"entryCount": _firestore_increment(1), "lastSync": datetime.now(timezone.utc)})

    return {**doc_data, "id": doc_ref.id, "location": {
        "latitude": entry.location.latitude,
        "longitude": entry.location.longitude,
    }}


# ── READ ───────────────────────────────────────────────────────────────

def get_entry(entry_id: str, auth_uid: str) -> dict | None:
    """Get a single entry by ID. Enforces ownership."""
    doc = _db().collection(COLLECTION).document(entry_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    if data["userId"] != auth_uid:
        raise PermissionError("Access denied.")
    return _doc_to_response(doc)


def list_entries(auth_uid: str, limit: int = 50, offset: int = 0) -> list[dict]:
    """List all journal entries for a user, newest first."""
    query = (
        _db()
        .collection(COLLECTION)
        .where("userId", "==", auth_uid)
        .order_by("capturedAt", direction="DESCENDING")
        .limit(limit)
        .offset(offset)
    )
    return [_doc_to_response(doc) for doc in query.stream()]


# ── UPDATE ─────────────────────────────────────────────────────────────

def update_entry(entry_id: str, updates: JournalEntryUpdate, auth_uid: str) -> dict | None:
    """Partial update of a journal entry. Enforces ownership."""
    doc_ref = _db().collection(COLLECTION).document(entry_id)
    doc = doc_ref.get()
    if not doc.exists:
        return None
    if doc.to_dict()["userId"] != auth_uid:
        raise PermissionError("Access denied.")

    update_data = {}
    for field, value in updates.model_dump(exclude_none=True).items():
        if field == "location" and value is not None:
            update_data["location"] = GeoPoint(value["latitude"], value["longitude"])
        else:
            update_data[field] = value

    update_data["syncedAt"] = datetime.now(timezone.utc)
    doc_ref.update(update_data)

    return _doc_to_response(doc_ref.get())


# ── DELETE ─────────────────────────────────────────────────────────────

def delete_entry(entry_id: str, auth_uid: str) -> bool:
    """Delete a journal entry. Enforces ownership."""
    doc_ref = _db().collection(COLLECTION).document(entry_id)
    doc = doc_ref.get()
    if not doc.exists:
        return False
    if doc.to_dict()["userId"] != auth_uid:
        raise PermissionError("Access denied.")

    doc_ref.delete()

    # Decrement user's entryCount
    user_ref = _db().collection("users").document(auth_uid)
    user_ref.update({"entryCount": _firestore_increment(-1)})

    return True


# ── Batch Sync (offline-first support) ─────────────────────────────────

def batch_sync_entries(entries: list[JournalEntryCreate], auth_uid: str) -> list[dict]:
    """
    Sync multiple pending entries from mobile client.
    Prevents duplicates by checking capturedAt + userId.
    """
    db = _db()
    results = []

    for entry in entries:
        if entry.userId != auth_uid:
            continue

        # Duplicate check: same user + same capturedAt timestamp
        existing = (
            db.collection(COLLECTION)
            .where("userId", "==", auth_uid)
            .where("capturedAt", "==", entry.capturedAt)
            .limit(1)
            .stream()
        )
        if any(True for _ in existing):
            continue

        doc_ref = db.collection(COLLECTION).document()
        doc_data = _entry_to_firestore(entry)
        doc_ref.set(doc_data)
        results.append({**doc_data, "id": doc_ref.id, "location": {
            "latitude": entry.location.latitude,
            "longitude": entry.location.longitude,
        }})

    if results:
        user_ref = db.collection("users").document(auth_uid)
        user_ref.update({
            "entryCount": _firestore_increment(len(results)),
            "lastSync": datetime.now(timezone.utc),
        })

    return results


# ── Helpers ────────────────────────────────────────────────────────────

def _firestore_increment(value: int):
    from google.cloud.firestore_v1 import transforms
    return transforms.Increment(value)
