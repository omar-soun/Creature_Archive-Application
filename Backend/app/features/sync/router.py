"""Sync router — batch sync and two-way sync endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user_uid, get_db
from app.features.entries.schemas import JournalEntryCreate, JournalEntryResponse
from app.features.entries.service import EntryService
from .schemas import TwoWaySyncRequest, TwoWaySyncResponse
from .service import SyncService

router = APIRouter(tags=["sync"])


def _get_entry_service(db=Depends(get_db)) -> EntryService:
    return EntryService(db)


def _get_sync_service(db=Depends(get_db)) -> SyncService:
    return SyncService(db)


@router.post("/entries/sync", response_model=list[JournalEntryResponse])
def sync_pending_entries(
    entries: list[JournalEntryCreate],
    uid: str = Depends(get_current_user_uid),
    service: EntryService = Depends(_get_entry_service),
):
    """
    Batch sync pending entries from the mobile client.
    Skips duplicates based on userId + capturedAt.

    DEPRECATED: Use POST /entries/two-way-sync instead for full bidirectional sync.
    """
    return service.batch_sync(entries, uid)


@router.post("/entries/two-way-sync", response_model=TwoWaySyncResponse)
def two_way_sync(
    request: TwoWaySyncRequest,
    uid: str = Depends(get_current_user_uid),
    service: SyncService = Depends(_get_sync_service),
):
    """
    Two-way synchronization between mobile client and cloud.

    This endpoint handles the complete sync flow:
    1. Receives all local entries from the client
    2. Fetches all cloud entries for the user
    3. Performs conflict resolution based on lastUpdated timestamps
    4. Updates/creates/deletes entries in Firestore as needed
    5. Returns merged result for client to update local storage
    """
    try:
        return service.perform_two_way_sync(request, uid)
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
