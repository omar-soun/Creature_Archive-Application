"""Journal entries router — CRUD operations."""

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user_uid, get_db
from .schemas import JournalEntryCreate, JournalEntryResponse, JournalEntryUpdate
from .service import EntryService

router = APIRouter(prefix="/entries", tags=["entries"])


def _get_service(db=Depends(get_db)) -> EntryService:
    return EntryService(db)


@router.post("", response_model=JournalEntryResponse)
def create_journal_entry(
    entry: JournalEntryCreate,
    uid: str = Depends(get_current_user_uid),
    service: EntryService = Depends(_get_service),
):
    """Create a new journal entry."""
    return service.create(entry, uid)


@router.get("", response_model=list[JournalEntryResponse])
def list_journal_entries(
    limit: int = 50,
    offset: int = 0,
    uid: str = Depends(get_current_user_uid),
    service: EntryService = Depends(_get_service),
):
    """List all journal entries for the authenticated user."""
    return service.list(uid, limit=limit, offset=offset)


@router.get("/{entry_id}", response_model=JournalEntryResponse)
def get_journal_entry(
    entry_id: str,
    uid: str = Depends(get_current_user_uid),
    service: EntryService = Depends(_get_service),
):
    """Get a single journal entry by ID."""
    return service.get(entry_id, uid)


@router.patch("/{entry_id}", response_model=JournalEntryResponse)
def update_journal_entry(
    entry_id: str,
    updates: JournalEntryUpdate,
    uid: str = Depends(get_current_user_uid),
    service: EntryService = Depends(_get_service),
):
    """Partially update a journal entry."""
    return service.update(entry_id, updates, uid)


@router.delete("/{entry_id}")
def delete_journal_entry(
    entry_id: str,
    uid: str = Depends(get_current_user_uid),
    service: EntryService = Depends(_get_service),
):
    """Delete a journal entry."""
    service.delete(entry_id, uid)
    return {"detail": "Entry deleted."}
