"""
Journal entries service — business logic for CRUD operations.

Handles entry creation, retrieval, update, deletion, and legacy batch sync.
Data conversion between Pydantic models and Firestore documents happens here.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from google.cloud.firestore_v1 import GeoPoint

from app.core.exceptions import ForbiddenException, NotFoundException
from .repository import EntryRepository
from .schemas import (
    GeoPointModel,
    JournalEntryCreate,
    JournalEntryResponse,
    JournalEntryUpdate,
)

logger = logging.getLogger("creature_archive.entries.service")


class EntryService:
    def __init__(self, db):
        self._repo = EntryRepository(db)

    def create(self, entry: JournalEntryCreate, auth_uid: str) -> JournalEntryResponse:
        """Create a new journal entry. Enforces userId == auth_uid."""
        if entry.userId != auth_uid:
            raise ForbiddenException("userId does not match authenticated user.")

        doc_data = self._entry_to_firestore(entry)
        doc_id = self._repo.create(doc_data)

        # Increment user's entryCount
        self._repo.increment_user_entry_count(auth_uid, 1)

        return JournalEntryResponse(
            id=doc_id,
            userId=doc_data["userId"],
            speciesName=doc_data["speciesName"],
            scientificName=doc_data["scientificName"],
            confidenceScore=doc_data["confidenceScore"],
            imageUrl=doc_data["imageUrl"],
            location=GeoPointModel(
                latitude=entry.location.latitude,
                longitude=entry.location.longitude,
            ),
            capturedAt=doc_data["capturedAt"],
            syncedAt=doc_data["syncedAt"],
            notes=doc_data["notes"],
            tags=doc_data["tags"],
            behaviorObserved=doc_data["behaviorObserved"],
            quantity=doc_data["quantity"],
            habitatType=doc_data["habitatType"],
        )

    def get(self, entry_id: str, auth_uid: str) -> JournalEntryResponse:
        """Get a single entry by ID. Enforces ownership."""
        result = self._repo.get(entry_id)
        if result is None:
            raise NotFoundException("Entry")
        doc_id, data = result
        if data["userId"] != auth_uid:
            raise ForbiddenException()
        return self._doc_to_response(doc_id, data)

    def list(
        self, auth_uid: str, limit: int = 50, offset: int = 0
    ) -> list[JournalEntryResponse]:
        """List all journal entries for a user, newest first."""
        docs = self._repo.list_by_user(auth_uid, limit=limit, offset=offset)
        return [self._doc_to_response(doc.id, doc.to_dict()) for doc in docs]

    def update(
        self, entry_id: str, updates: JournalEntryUpdate, auth_uid: str
    ) -> JournalEntryResponse:
        """Partial update of a journal entry. Enforces ownership."""
        result = self._repo.get(entry_id)
        if result is None:
            raise NotFoundException("Entry")
        doc_id, data = result
        if data["userId"] != auth_uid:
            raise ForbiddenException()

        update_data = {}
        for field, value in updates.model_dump(exclude_none=True).items():
            if field == "location" and value is not None:
                update_data["location"] = GeoPoint(value["latitude"], value["longitude"])
            else:
                update_data[field] = value

        update_data["syncedAt"] = datetime.now(timezone.utc)
        self._repo.update(entry_id, update_data)

        # Re-fetch updated doc
        result = self._repo.get(entry_id)
        return self._doc_to_response(result[0], result[1])

    def delete(self, entry_id: str, auth_uid: str) -> None:
        """Delete a journal entry. Enforces ownership."""
        result = self._repo.get(entry_id)
        if result is None:
            raise NotFoundException("Entry")
        _, data = result
        if data["userId"] != auth_uid:
            raise ForbiddenException()

        self._repo.delete(entry_id)

        # Decrement user's entryCount
        self._repo.increment_user_entry_count(auth_uid, -1)

    def batch_sync(
        self, entries: list[JournalEntryCreate], auth_uid: str
    ) -> list[JournalEntryResponse]:
        """
        Sync multiple pending entries from mobile client.
        Prevents duplicates by checking capturedAt + userId.

        DEPRECATED: Use two-way sync instead.
        """
        results = []

        for entry in entries:
            if entry.userId != auth_uid:
                continue

            # Duplicate check: same user + same capturedAt timestamp
            if self._repo.find_duplicate(auth_uid, entry.capturedAt):
                continue

            doc_data = self._entry_to_firestore(entry)
            doc_id = self._repo.create(doc_data)
            results.append(
                JournalEntryResponse(
                    id=doc_id,
                    userId=doc_data["userId"],
                    speciesName=doc_data["speciesName"],
                    scientificName=doc_data["scientificName"],
                    confidenceScore=doc_data["confidenceScore"],
                    imageUrl=doc_data["imageUrl"],
                    location=GeoPointModel(
                        latitude=entry.location.latitude,
                        longitude=entry.location.longitude,
                    ),
                    capturedAt=doc_data["capturedAt"],
                    syncedAt=doc_data["syncedAt"],
                    notes=doc_data["notes"],
                    tags=doc_data["tags"],
                    behaviorObserved=doc_data["behaviorObserved"],
                    quantity=doc_data["quantity"],
                    habitatType=doc_data["habitatType"],
                )
            )

        if results:
            self._repo.increment_user_entry_count(auth_uid, len(results))

        return results

    # ── Conversion Helpers ────────────────────────────────────────────

    @staticmethod
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

    @staticmethod
    def _doc_to_response(doc_id: str, data: dict) -> JournalEntryResponse:
        """Convert a Firestore document to a response model."""
        loc = data.get("location")
        return JournalEntryResponse(
            id=doc_id,
            userId=data["userId"],
            speciesName=data["speciesName"],
            scientificName=data["scientificName"],
            confidenceScore=data["confidenceScore"],
            imageUrl=data["imageUrl"],
            location=GeoPointModel(
                latitude=loc.latitude if loc else 0,
                longitude=loc.longitude if loc else 0,
            ),
            capturedAt=data["capturedAt"],
            syncedAt=data["syncedAt"],
            notes=data.get("notes", ""),
            tags=data.get("tags", []),
            behaviorObserved=data.get("behaviorObserved", ""),
            quantity=data.get("quantity", 1),
            habitatType=data.get("habitatType", ""),
        )
