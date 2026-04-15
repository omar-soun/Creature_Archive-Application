from typing import Optional

from pydantic import BaseModel, Field


class SyncEntryData(BaseModel):
    """
    Local journal entry data sent by the client during sync.
    Includes all fields needed for conflict resolution.
    """
    localId: str
    firestoreId: Optional[str] = None
    userId: str
    speciesName: str
    scientificName: str
    confidenceScore: float = Field(..., ge=0.0, le=1.0)
    localImageUri: str
    imageUrl: Optional[str] = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    locationName: Optional[str] = None
    capturedAt: int
    createdAt: int
    lastUpdated: int
    syncStatus: str
    notes: str = ""
    tags: list[str] = []
    behaviorObserved: str = ""
    quantity: int = Field(1, ge=0)
    habitatType: str = ""
    animalClass: str = "Other"
    detectionSource: str = "offline"
    isDeleted: bool = False
    deletedAt: Optional[int] = None


class TwoWaySyncRequest(BaseModel):
    """
    Request body for two-way sync endpoint.
    Client sends all local entries that need syncing.
    """
    localEntries: list[SyncEntryData]
    lastSyncTime: Optional[int] = None


class SyncedEntryResponse(BaseModel):
    """Single entry in sync response with all fields needed by client."""
    localId: str
    firestoreId: str
    userId: str
    speciesName: str
    scientificName: str
    confidenceScore: float
    localImageUri: str
    imageUrl: str
    latitude: float
    longitude: float
    locationName: Optional[str] = None
    capturedAt: int
    createdAt: int
    lastUpdated: int
    syncStatus: str
    notes: str
    tags: list[str]
    behaviorObserved: str
    quantity: int
    habitatType: str
    animalClass: str
    detectionSource: str = "offline"


class TwoWaySyncResponse(BaseModel):
    """
    Response body for two-way sync endpoint.
    Contains the merged result of local and cloud data.
    """
    success: bool
    mergedEntries: list[SyncedEntryResponse]
    uploaded: int
    downloaded: int
    deleted: int
    conflicts: int
    errors: list[str]
    syncTimestamp: int
    syncDeferred: bool = False
