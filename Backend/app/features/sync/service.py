"""
Two-Way Sync Service

Handles bidirectional synchronization between mobile client and Firestore.
Implements conflict resolution based on lastUpdated timestamps.

Sync Flow:
1. Client sends all local entries (pending + synced with local changes)
2. Backend fetches all cloud entries for user
3. Conflict resolution:
   - If entry exists in both: compare lastUpdated, keep newer
   - If entry only in local (pending): upload to cloud
   - If entry only in cloud: include in response for client download
   - If entry marked as deleted locally: delete from cloud
4. Return merged result to client
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from google.cloud.firestore_v1 import GeoPoint
from google.cloud.firestore_v1.base_query import FieldFilter

from app.core.firebase import check_firestore_reachable
from app.core.firestore_utils import firestore_increment
from .schemas import (
    SyncEntryData,
    SyncedEntryResponse,
    TwoWaySyncRequest,
    TwoWaySyncResponse,
)

logger = logging.getLogger("creature_archive.sync.service")

COLLECTION = "journal_entries"


class SyncService:
    def __init__(self, db):
        self._db = db

    def perform_two_way_sync(
        self, request: TwoWaySyncRequest, auth_uid: str
    ) -> TwoWaySyncResponse:
        """
        Perform two-way synchronization between client and cloud.

        If Firestore is unreachable, returns the client's local entries unchanged
        with syncDeferred=True so the frontend knows not to overwrite local data.
        """
        now = datetime.now(timezone.utc)
        sync_timestamp = int(now.timestamp() * 1000)

        # Check Firestore reachability before attempting sync
        if not check_firestore_reachable():
            return TwoWaySyncResponse(
                success=True,  # Not a failure — just deferred
                mergedEntries=self._build_deferred_entries(request, auth_uid),
                uploaded=0,
                downloaded=0,
                deleted=0,
                conflicts=0,
                errors=[],
                syncTimestamp=sync_timestamp,
                syncDeferred=True,
            )

        result = TwoWaySyncResponse(
            success=True,
            mergedEntries=[],
            uploaded=0,
            downloaded=0,
            deleted=0,
            conflicts=0,
            errors=[],
            syncTimestamp=sync_timestamp,
            syncDeferred=False,
        )

        try:
            # Step 1: Build maps from local entries
            local_by_firestore_id: dict[str, SyncEntryData] = {}
            local_by_local_id: dict[str, SyncEntryData] = {}

            for entry in request.localEntries:
                # Verify ownership
                if entry.userId != auth_uid:
                    result.errors.append(
                        f"Entry {entry.localId} has mismatched userId"
                    )
                    continue

                if entry.firestoreId:
                    local_by_firestore_id[entry.firestoreId] = entry
                local_by_local_id[entry.localId] = entry

            # Step 2: Fetch all cloud entries for this user
            cloud_docs = (
                self._db.collection(COLLECTION)
                .where(filter=FieldFilter("userId", "==", auth_uid))
                .stream()
            )

            cloud_by_id: dict[str, any] = {}
            cloud_by_local_id: dict[str, any] = {}

            for doc in cloud_docs:
                cloud_by_id[doc.id] = doc
                data = doc.to_dict()
                if data.get("localId"):
                    cloud_by_local_id[data["localId"]] = doc

            processed_firestore_ids: set[str] = set()
            processed_local_ids: set[str] = set()
            entry_count_delta = 0

            # Step 3: Process local entries
            for entry in request.localEntries:
                if entry.userId != auth_uid:
                    continue

                # Handle deleted entries
                if entry.isDeleted:
                    if entry.firestoreId and entry.firestoreId in cloud_by_id:
                        try:
                            self._db.collection(COLLECTION).document(
                                entry.firestoreId
                            ).delete()
                            result.deleted += 1
                            entry_count_delta -= 1
                            processed_firestore_ids.add(entry.firestoreId)
                        except Exception as e:
                            result.errors.append(
                                f"Failed to delete {entry.firestoreId}: {str(e)}"
                            )
                    elif entry.localId in cloud_by_local_id:
                        # Find by localId if firestoreId not set
                        try:
                            cloud_doc = cloud_by_local_id[entry.localId]
                            self._db.collection(COLLECTION).document(
                                cloud_doc.id
                            ).delete()
                            result.deleted += 1
                            entry_count_delta -= 1
                            processed_firestore_ids.add(cloud_doc.id)
                            processed_local_ids.add(entry.localId)
                        except Exception as e:
                            result.errors.append(
                                f"Failed to delete by localId {entry.localId}: {str(e)}"
                            )
                    continue

                # Check if entry exists in cloud (by firestoreId or localId)
                cloud_doc = None
                if entry.firestoreId and entry.firestoreId in cloud_by_id:
                    cloud_doc = cloud_by_id[entry.firestoreId]
                elif entry.localId in cloud_by_local_id:
                    cloud_doc = cloud_by_local_id[entry.localId]

                if cloud_doc:
                    # Entry exists in both — resolve conflict
                    cloud_data = cloud_doc.to_dict()
                    cloud_last_updated = cloud_data.get("lastUpdated")

                    if hasattr(cloud_last_updated, "timestamp"):
                        cloud_last_updated_ms = int(
                            cloud_last_updated.timestamp() * 1000
                        )
                    else:
                        cloud_last_updated_ms = 0

                    if (
                        entry.syncStatus == "pending"
                        and entry.lastUpdated > cloud_last_updated_ms
                    ):
                        # Local is newer — update cloud
                        try:
                            image_url = entry.imageUrl or cloud_data.get(
                                "imageUrl", ""
                            )
                            update_data = {
                                "speciesName": entry.speciesName,
                                "scientificName": entry.scientificName,
                                "confidenceScore": entry.confidenceScore,
                                "notes": entry.notes,
                                "tags": entry.tags,
                                "behaviorObserved": entry.behaviorObserved,
                                "quantity": entry.quantity,
                                "habitatType": entry.habitatType,
                                "animalClass": entry.animalClass,
                                "locationName": entry.locationName or "",
                                "lastUpdated": datetime.fromtimestamp(
                                    entry.lastUpdated / 1000, tz=timezone.utc
                                ),
                                "syncedAt": now,
                                "localId": entry.localId,
                            }

                            self._db.collection(COLLECTION).document(
                                cloud_doc.id
                            ).update(update_data)
                            result.uploaded += 1

                            # Add to merged entries
                            synced_entry = SyncedEntryResponse(
                                localId=entry.localId,
                                firestoreId=cloud_doc.id,
                                userId=entry.userId,
                                speciesName=entry.speciesName,
                                scientificName=entry.scientificName,
                                confidenceScore=entry.confidenceScore,
                                localImageUri=entry.localImageUri,
                                imageUrl=image_url,
                                latitude=entry.latitude,
                                longitude=entry.longitude,
                                locationName=entry.locationName,
                                capturedAt=entry.capturedAt,
                                createdAt=entry.createdAt,
                                lastUpdated=entry.lastUpdated,
                                syncStatus="synced",
                                notes=entry.notes,
                                tags=entry.tags,
                                behaviorObserved=entry.behaviorObserved,
                                quantity=entry.quantity,
                                habitatType=entry.habitatType,
                                animalClass=entry.animalClass,
                            )
                            result.mergedEntries.append(synced_entry)

                        except Exception as e:
                            result.errors.append(
                                f"Failed to update {entry.localId}: {str(e)}"
                            )
                            continue
                    else:
                        # Cloud is newer or same — use cloud data
                        result.conflicts += 1
                        synced_entry = self._doc_to_sync_response(
                            cloud_doc, entry.localImageUri
                        )
                        synced_entry.localId = (
                            entry.localId
                        )  # Preserve client's localId
                        result.mergedEntries.append(synced_entry)

                    processed_firestore_ids.add(cloud_doc.id)
                    processed_local_ids.add(entry.localId)

                elif entry.syncStatus == "pending":
                    # New entry — upload to cloud
                    try:
                        image_url = entry.imageUrl or entry.localImageUri
                        doc_data = self._entry_to_firestore(entry, image_url)
                        doc_ref = self._db.collection(COLLECTION).document()
                        doc_ref.set(doc_data)

                        result.uploaded += 1
                        entry_count_delta += 1

                        synced_entry = SyncedEntryResponse(
                            localId=entry.localId,
                            firestoreId=doc_ref.id,
                            userId=entry.userId,
                            speciesName=entry.speciesName,
                            scientificName=entry.scientificName,
                            confidenceScore=entry.confidenceScore,
                            localImageUri=entry.localImageUri,
                            imageUrl=image_url,
                            latitude=entry.latitude,
                            longitude=entry.longitude,
                            locationName=entry.locationName,
                            capturedAt=entry.capturedAt,
                            createdAt=entry.createdAt,
                            lastUpdated=entry.lastUpdated,
                            syncStatus="synced",
                            notes=entry.notes,
                            tags=entry.tags,
                            behaviorObserved=entry.behaviorObserved,
                            quantity=entry.quantity,
                            habitatType=entry.habitatType,
                            animalClass=entry.animalClass,
                        )
                        result.mergedEntries.append(synced_entry)
                        processed_local_ids.add(entry.localId)

                    except Exception as e:
                        result.errors.append(
                            f"Failed to upload {entry.localId}: {str(e)}"
                        )

                else:
                    # Entry is synced locally but not in cloud
                    # Might have been deleted on another device — include it anyway
                    synced_entry = SyncedEntryResponse(
                        localId=entry.localId,
                        firestoreId=entry.firestoreId or "",
                        userId=entry.userId,
                        speciesName=entry.speciesName,
                        scientificName=entry.scientificName,
                        confidenceScore=entry.confidenceScore,
                        localImageUri=entry.localImageUri,
                        imageUrl=entry.imageUrl or "",
                        latitude=entry.latitude,
                        longitude=entry.longitude,
                        locationName=entry.locationName,
                        capturedAt=entry.capturedAt,
                        createdAt=entry.createdAt,
                        lastUpdated=entry.lastUpdated,
                        syncStatus="synced",
                        notes=entry.notes,
                        tags=entry.tags,
                        behaviorObserved=entry.behaviorObserved,
                        quantity=entry.quantity,
                        habitatType=entry.habitatType,
                        animalClass=entry.animalClass,
                    )
                    result.mergedEntries.append(synced_entry)
                    processed_local_ids.add(entry.localId)

            # Step 4: Process cloud-only entries (download to client)
            for firestore_id, cloud_doc in cloud_by_id.items():
                if firestore_id in processed_firestore_ids:
                    continue

                cloud_data = cloud_doc.to_dict()
                cloud_local_id = cloud_data.get("localId")

                if cloud_local_id and cloud_local_id in processed_local_ids:
                    continue

                # Entry only in cloud — include for client download
                synced_entry = self._doc_to_sync_response(cloud_doc)
                result.mergedEntries.append(synced_entry)
                result.downloaded += 1

            # Step 5: Update user's entry count if changed
            if entry_count_delta != 0:
                try:
                    user_ref = self._db.collection("users").document(auth_uid)
                    user_ref.update(
                        {
                            "entryCount": firestore_increment(entry_count_delta),
                            "lastSync": now,
                        }
                    )
                except Exception as e:
                    result.errors.append(
                        f"Failed to update user entry count: {str(e)}"
                    )
            else:
                # Update lastSync even if no entry count change
                try:
                    user_ref = self._db.collection("users").document(auth_uid)
                    user_ref.update({"lastSync": now})
                except Exception:
                    pass  # Non-critical error

            result.success = len(result.errors) == 0

        except Exception as e:
            result.success = False
            result.syncDeferred = True
            result.errors.append(f"Sync failed: {str(e)}")

        return result

    # ── Conversion Helpers ────────────────────────────────────────────

    @staticmethod
    def _entry_to_firestore(entry: SyncEntryData, image_url: str) -> dict:
        """Convert a sync entry to Firestore document format."""
        return {
            "userId": entry.userId,
            "speciesName": entry.speciesName,
            "scientificName": entry.scientificName,
            "confidenceScore": entry.confidenceScore,
            "imageUrl": image_url,
            "location": GeoPoint(entry.latitude, entry.longitude)
            if entry.latitude and entry.longitude
            else None,
            "locationName": entry.locationName or "",
            "capturedAt": datetime.fromtimestamp(
                entry.capturedAt / 1000, tz=timezone.utc
            ),
            "createdAt": datetime.fromtimestamp(
                entry.createdAt / 1000, tz=timezone.utc
            ),
            "lastUpdated": datetime.fromtimestamp(
                entry.lastUpdated / 1000, tz=timezone.utc
            ),
            "syncedAt": datetime.now(timezone.utc),
            "notes": entry.notes,
            "tags": entry.tags,
            "behaviorObserved": entry.behaviorObserved,
            "quantity": entry.quantity,
            "habitatType": entry.habitatType,
            "animalClass": entry.animalClass,
            "localId": entry.localId,
        }

    @staticmethod
    def _doc_to_sync_response(
        doc, local_image_uri: str = ""
    ) -> SyncedEntryResponse:
        """Convert a Firestore document to sync response format."""
        data = doc.to_dict()
        loc = data.get("location")

        # Handle timestamp conversion
        captured_at = data.get("capturedAt")
        if hasattr(captured_at, "timestamp"):
            captured_at_ms = int(captured_at.timestamp() * 1000)
        else:
            captured_at_ms = (
                int(captured_at.timestamp() * 1000) if captured_at else 0
            )

        created_at = data.get("createdAt") or data.get("capturedAt")
        if hasattr(created_at, "timestamp"):
            created_at_ms = int(created_at.timestamp() * 1000)
        else:
            created_at_ms = captured_at_ms

        last_updated = data.get("lastUpdated") or data.get("syncedAt")
        if hasattr(last_updated, "timestamp"):
            last_updated_ms = int(last_updated.timestamp() * 1000)
        else:
            last_updated_ms = created_at_ms

        return SyncedEntryResponse(
            localId=data.get("localId", doc.id),
            firestoreId=doc.id,
            userId=data["userId"],
            speciesName=data["speciesName"],
            scientificName=data["scientificName"],
            confidenceScore=data["confidenceScore"],
            localImageUri=local_image_uri or data.get("imageUrl", ""),
            imageUrl=data.get("imageUrl", ""),
            latitude=loc.latitude if loc else 0,
            longitude=loc.longitude if loc else 0,
            locationName=data.get("locationName"),
            capturedAt=captured_at_ms,
            createdAt=created_at_ms,
            lastUpdated=last_updated_ms,
            syncStatus="synced",
            notes=data.get("notes", ""),
            tags=data.get("tags", []),
            behaviorObserved=data.get("behaviorObserved", ""),
            quantity=data.get("quantity", 1),
            habitatType=data.get("habitatType", ""),
            animalClass=data.get("animalClass", "Other"),
        )

    @staticmethod
    def _build_deferred_entries(
        request: TwoWaySyncRequest, auth_uid: str
    ) -> list[SyncedEntryResponse]:
        """Echo back local entries as-is when cloud is unreachable."""
        entries = []
        for entry in request.localEntries:
            if entry.userId != auth_uid or entry.isDeleted:
                continue
            entries.append(
                SyncedEntryResponse(
                    localId=entry.localId,
                    firestoreId=entry.firestoreId or "",
                    userId=entry.userId,
                    speciesName=entry.speciesName,
                    scientificName=entry.scientificName,
                    confidenceScore=entry.confidenceScore,
                    localImageUri=entry.localImageUri,
                    imageUrl=entry.imageUrl or "",
                    latitude=entry.latitude,
                    longitude=entry.longitude,
                    locationName=entry.locationName,
                    capturedAt=entry.capturedAt,
                    createdAt=entry.createdAt,
                    lastUpdated=entry.lastUpdated,
                    syncStatus=entry.syncStatus,
                    notes=entry.notes,
                    tags=entry.tags,
                    behaviorObserved=entry.behaviorObserved,
                    quantity=entry.quantity,
                    habitatType=entry.habitatType,
                    animalClass=entry.animalClass,
                )
            )
        return entries
