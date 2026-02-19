"""
Auth service — business logic for authentication and user management.

Handles: signup, profile CRUD, account deletion, forgot-password flow.
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

from app.core.exceptions import (
    AppException,
    BadRequestException,
    ConflictException,
    NotFoundException,
    TooManyRequestsException,
)
from .repository import UserRepository
from .schemas import (
    ForgotPasswordInitResponse,
    ForgotPasswordVerifyResponse,
    ProfileUpdateRequest,
    SignupRequest,
    UserProfileResponse,
)

logger = logging.getLogger("creature_archive.auth.service")

# Verification field mapping for forgot-password challenge
_VERIFICATION_FIELDS = {
    "_v_first_name": "First Name",
    "_v_last_name": "Last Name",
    "_v_current_role": "Current Role",
    "_v_institution": "School or Company",
}
_LABEL_TO_FIELD = {v: k for k, v in _VERIFICATION_FIELDS.items()}


class PasswordResetSessionStore:
    """
    In-memory session store for password reset flow.

    NOTE: Not persistent across server restarts.
    For production, replace with Redis or Firestore-backed storage.
    The interface is isolated so swapping backends is straightforward.
    """

    def __init__(self):
        self._sessions: dict[str, dict] = {}

    def cleanup_stale(self, max_age_minutes: int = 30) -> None:
        """Remove sessions older than max_age_minutes."""
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
        expired = [k for k, v in self._sessions.items() if v["created_at"] < cutoff]
        for k in expired:
            del self._sessions[k]

    def create(self, token: str, session_data: dict) -> None:
        self._sessions[token] = session_data

    def get(self, token: str) -> dict | None:
        return self._sessions.get(token)

    def delete(self, token: str) -> None:
        self._sessions.pop(token, None)

    def find_by_reset_token(self, reset_token: str) -> tuple[str | None, dict | None]:
        """Find session by its reset token. Returns (session_key, session_data)."""
        for key, session in self._sessions.items():
            if session.get("reset_token") == reset_token:
                return (key, session)
        return (None, None)


# Module-level singleton — survives for the lifetime of the process
_reset_store = PasswordResetSessionStore()


class AuthService:
    def __init__(self, db):
        self._repo = UserRepository(db)
        self._reset_store = _reset_store

    # ── Profile Operations ────────────────────────────────────────────

    def signup(self, uid: str, body: SignupRequest) -> UserProfileResponse:
        """Create Firestore user profile after Firebase Auth signup."""
        if self._repo.exists(uid):
            raise ConflictException("User profile already exists.")

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
        self._repo.create(uid, user_doc)
        return UserProfileResponse(**user_doc)

    def get_profile(self, uid: str) -> UserProfileResponse:
        """Get the authenticated user's profile."""
        data = self._repo.get_by_uid(uid)
        if data is None:
            raise NotFoundException("User profile")

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

    def update_profile(
        self, uid: str, body: ProfileUpdateRequest
    ) -> UserProfileResponse:
        """Update user profile fields."""
        existing = self._repo.get_by_uid(uid)
        if existing is None:
            raise NotFoundException("User profile")

        updates = {k: v for k, v in body.model_dump().items() if v is not None}
        if not updates:
            raise BadRequestException("No fields to update.")

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
        self._repo.update(uid, updates)

        # Re-fetch for consistency
        return self.get_profile(uid)

    def delete_account(self, uid: str) -> None:
        """Delete user profile, all entries, and Firebase Auth account."""
        # Delete all user's journal entries
        self._repo.delete_user_entries(uid)

        # Delete user profile document
        self._repo.delete(uid)

        # Delete the Firebase Auth account
        from firebase_admin import auth

        try:
            auth.delete_user(uid)
        except Exception:
            pass  # Auth record may already be gone

    # ── Forgot Password ──────────────────────────────────────────────

    def forgot_password_initiate(self, email: str) -> ForgotPasswordInitResponse:
        """
        Step 1: Start the forgot-password flow.
        Looks up the email, picks 2 random challenge fields.
        Returns the same response structure whether or not email exists
        (to avoid leaking email existence).
        """
        self._reset_store.cleanup_stale()

        email = email.strip().lower()
        result = self._repo.find_by_email(email)

        session_token = str(uuid.uuid4())

        if result is None:
            # Email not found — return dummy response (don't reveal email doesn't exist)
            dummy_fields = random.sample(list(_VERIFICATION_FIELDS.values()), 2)
            self._reset_store.create(
                session_token,
                {
                    "uid": None,
                    "fields": {},
                    "field_labels": dummy_fields,
                    "attempts": 0,
                    "locked_until": None,
                    "created_at": datetime.now(timezone.utc),
                    "reset_token": None,
                },
            )
            return ForgotPasswordInitResponse(
                session_token=session_token,
                challenge_fields=dummy_fields,
            )

        user_ref, user_data = result

        # Ensure verification fields exist (backfill for older accounts)
        user_data = self._ensure_verification_fields(user_ref, user_data)

        # Randomly pick 2 of the 4 verification fields
        all_v_fields = list(_VERIFICATION_FIELDS.keys())
        chosen_keys = random.sample(all_v_fields, 2)
        chosen_labels = [_VERIFICATION_FIELDS[k] for k in chosen_keys]

        self._reset_store.create(
            session_token,
            {
                "uid": user_data["uid"],
                "fields": {
                    _VERIFICATION_FIELDS[k]: user_data.get(k, "")
                    for k in chosen_keys
                },
                "field_labels": chosen_labels,
                "attempts": 0,
                "locked_until": None,
                "created_at": datetime.now(timezone.utc),
                "reset_token": None,
            },
        )

        return ForgotPasswordInitResponse(
            session_token=session_token,
            challenge_fields=chosen_labels,
        )

    def forgot_password_verify(
        self, session_token: str, answers: dict[str, str]
    ) -> ForgotPasswordVerifyResponse:
        """
        Step 2: Verify the user's answers to the 2 challenge questions.
        Returns a reset token on success.
        Max 3 attempts, then locked for 5 minutes.
        """
        self._reset_store.cleanup_stale()

        session = self._reset_store.get(session_token)
        if not session:
            raise BadRequestException("Invalid or expired session.")

        # Check session expiry (15 minutes)
        if datetime.now(timezone.utc) - session["created_at"] > timedelta(minutes=15):
            self._reset_store.delete(session_token)
            raise BadRequestException("Session expired. Please start over.")

        # Check if locked out
        if session["locked_until"] and datetime.now(timezone.utc) < session[
            "locked_until"
        ]:
            remaining = (
                session["locked_until"] - datetime.now(timezone.utc)
            ).seconds // 60 + 1
            raise TooManyRequestsException(
                f"Too many failed attempts. Please try again in {remaining} minute(s)."
            )

        # If this is a dummy session (email didn't exist), always fail
        if session["uid"] is None:
            session["attempts"] += 1
            if session["attempts"] >= 3:
                session["locked_until"] = datetime.now(timezone.utc) + timedelta(
                    minutes=5
                )
            raise BadRequestException("Verification failed. Please try again.")

        # Normalize and compare answers
        stored_fields = session["fields"]
        all_match = all(
            answers.get(label, "").strip().lower() == stored_value
            for label, stored_value in stored_fields.items()
        )

        if not all_match:
            session["attempts"] += 1
            if session["attempts"] >= 3:
                session["locked_until"] = datetime.now(timezone.utc) + timedelta(
                    minutes=5
                )
            raise BadRequestException("Verification failed. Please try again.")

        # Success — generate reset token
        reset_token = str(uuid.uuid4())
        session["reset_token"] = reset_token
        session["reset_token_created"] = datetime.now(timezone.utc)

        return ForgotPasswordVerifyResponse(reset_token=reset_token)

    def forgot_password_reset(self, reset_token: str, new_password: str) -> None:
        """
        Step 3: Reset the password using the reset token.
        Uses Firebase Admin SDK to update the user's password directly.
        """
        self._reset_store.cleanup_stale()

        session_key, session = self._reset_store.find_by_reset_token(reset_token)
        if not session or not session.get("uid"):
            raise BadRequestException("Invalid or expired reset token.")

        # Check reset token expiry (10 minutes)
        token_created = session.get("reset_token_created")
        if not token_created or datetime.now(timezone.utc) - token_created > timedelta(
            minutes=10
        ):
            self._reset_store.delete(session_key)
            raise BadRequestException("Reset token expired. Please start over.")

        # Update password via Firebase Admin SDK
        from firebase_admin import auth

        try:
            auth.update_user(session["uid"], password=new_password)
        except Exception as e:
            logger.error("Password reset failed: %s: %s", type(e).__name__, e)
            raise AppException(
                "Failed to reset password. Please try again.", status_code=500
            )

        # Clean up session
        self._reset_store.delete(session_key)

    # ── Private Helpers ──────────────────────────────────────────────

    @staticmethod
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
