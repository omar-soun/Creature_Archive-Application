"""
Journal entries repository — Firestore operations for the journal_entries collection.

All database access for journal entries is centralized here.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from google.cloud.firestore_v1.base_query import FieldFilter

from app.core.firestore_utils import firestore_increment

logger = logging.getLogger("creature_archive.entries.repository")

COLLECTION = "journal_entries"


class EntryRepository:
    def __init__(self, db):
        self._db = db

    def create(self, doc_data: dict) -> str:
        """Create a new entry document. Returns the document ID."""
        doc_ref = self._db.collection(COLLECTION).document()
        doc_ref.set(doc_data)
        return doc_ref.id

    def get(self, entry_id: str) -> tuple | None:
        """Get entry by ID. Returns (doc, data_dict) or None."""
        doc = self._db.collection(COLLECTION).document(entry_id).get()
        if not doc.exists:
            return None
        return (doc.id, doc.to_dict())

    def get_doc(self, entry_id: str):
        """Get raw Firestore document snapshot."""
        return self._db.collection(COLLECTION).document(entry_id).get()

    def list_by_user(self, user_id: str, limit: int = 50, offset: int = 0) -> list:
        """List entries for a user, newest first. Returns Firestore document snapshots."""
        query = (
            self._db.collection(COLLECTION)
            .where(filter=FieldFilter("userId", "==", user_id))
            .order_by("capturedAt", direction="DESCENDING")
            .limit(limit)
            .offset(offset)
        )
        return list(query.stream())

    def update(self, entry_id: str, update_data: dict) -> None:
        """Update entry fields."""
        self._db.collection(COLLECTION).document(entry_id).update(update_data)

    def delete(self, entry_id: str) -> None:
        """Delete an entry document."""
        self._db.collection(COLLECTION).document(entry_id).delete()

    def find_duplicate(self, user_id: str, captured_at) -> bool:
        """Check if a duplicate entry exists (same user + capturedAt)."""
        existing = (
            self._db.collection(COLLECTION)
            .where(filter=FieldFilter("userId", "==", user_id))
            .where(filter=FieldFilter("capturedAt", "==", captured_at))
            .limit(1)
            .stream()
        )
        return any(True for _ in existing)

    def stream_by_user(self, user_id: str):
        """Stream all entries for a user (for sync operations)."""
        return (
            self._db.collection(COLLECTION)
            .where(filter=FieldFilter("userId", "==", user_id))
            .stream()
        )

    def increment_user_entry_count(self, user_id: str, delta: int) -> None:
        """Atomically adjust the user's entryCount and update lastSync."""
        user_ref = self._db.collection("users").document(user_id)
        user_ref.update({
            "entryCount": firestore_increment(delta),
            "lastSync": datetime.now(timezone.utc),
        })

    def update_user_last_sync(self, user_id: str) -> None:
        """Update user's lastSync timestamp without changing entryCount."""
        user_ref = self._db.collection("users").document(user_id)
        user_ref.update({"lastSync": datetime.now(timezone.utc)})
