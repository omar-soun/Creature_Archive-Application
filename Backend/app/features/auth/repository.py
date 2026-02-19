"""
User repository — Firestore operations for the users collection.

All database access for user profiles is centralized here.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("creature_archive.auth.repository")

USERS_COLLECTION = "users"
ENTRIES_COLLECTION = "journal_entries"


class UserRepository:
    def __init__(self, db):
        self._db = db

    def get_by_uid(self, uid: str) -> dict | None:
        """Get user document by UID. Returns None if not found."""
        doc = self._db.collection(USERS_COLLECTION).document(uid).get()
        if not doc.exists:
            return None
        return doc.to_dict()

    def get_ref(self, uid: str):
        """Get a document reference for the user."""
        return self._db.collection(USERS_COLLECTION).document(uid)

    def exists(self, uid: str) -> bool:
        """Check if user profile exists."""
        return self._db.collection(USERS_COLLECTION).document(uid).get().exists

    def create(self, uid: str, user_doc: dict) -> None:
        """Create a new user document."""
        self._db.collection(USERS_COLLECTION).document(uid).set(user_doc)

    def update(self, uid: str, updates: dict) -> None:
        """Update user document fields."""
        self._db.collection(USERS_COLLECTION).document(uid).update(updates)

    def delete(self, uid: str) -> None:
        """Delete user document."""
        self._db.collection(USERS_COLLECTION).document(uid).delete()

    def find_by_email(self, email: str) -> tuple | None:
        """
        Find user by email.
        Returns (doc_reference, data_dict) or None if not found.
        """
        query = (
            self._db.collection(USERS_COLLECTION)
            .where("email", "==", email)
            .limit(1)
            .get()
        )
        for doc in query:
            return (doc.reference, doc.to_dict())
        return None

    def delete_user_entries(self, uid: str) -> None:
        """Delete all journal entries for a user (used during account deletion)."""
        entries = (
            self._db.collection(ENTRIES_COLLECTION)
            .where("userId", "==", uid)
            .stream()
        )
        for entry_doc in entries:
            entry_doc.reference.delete()
