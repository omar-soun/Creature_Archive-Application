from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Request Models ─────────────────────────────────────────────────────

class GeoPointModel(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class JournalEntryCreate(BaseModel):
    userId: str
    speciesName: str
    scientificName: str
    confidenceScore: float = Field(..., ge=0.0, le=1.0)
    imageUrl: str
    location: GeoPointModel
    capturedAt: datetime
    notes: str = ""
    tags: list[str] = []
    behaviorObserved: str = ""
    quantity: int = Field(1, ge=0)
    habitatType: str = ""


class JournalEntryUpdate(BaseModel):
    speciesName: Optional[str] = None
    scientificName: Optional[str] = None
    confidenceScore: Optional[float] = Field(None, ge=0.0, le=1.0)
    imageUrl: Optional[str] = None
    location: Optional[GeoPointModel] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None
    behaviorObserved: Optional[str] = None
    quantity: Optional[int] = Field(None, ge=0)
    habitatType: Optional[str] = None


# ── Response Models ────────────────────────────────────────────────────

class JournalEntryResponse(BaseModel):
    id: str
    userId: str
    speciesName: str
    scientificName: str
    confidenceScore: float
    imageUrl: str
    location: GeoPointModel
    capturedAt: datetime
    syncedAt: datetime
    notes: str
    tags: list[str]
    behaviorObserved: str
    quantity: int
    habitatType: str


class PredictionResponse(BaseModel):
    species_name: str
    scientific_name: str
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    species_id: int
    prediction_time: str


class HealthCheckResponse(BaseModel):
    status: str
    model_loaded: bool
    species_count: int
    timestamp: str


# ── Auth Models ───────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    """Sent by mobile after Firebase Auth createUser completes."""
    email: str
    firstName: str = Field(..., min_length=1, max_length=100)
    lastName: str = Field(..., min_length=1, max_length=100)
    institution: str = ""
    currentRole: str = ""


class ProfileUpdateRequest(BaseModel):
    """Optional fields for updating user profile via PATCH /auth/me."""
    firstName: Optional[str] = Field(None, min_length=1, max_length=100)
    lastName: Optional[str] = Field(None, min_length=1, max_length=100)
    institution: Optional[str] = None
    currentRole: Optional[str] = None
    email: Optional[str] = None
    profileImage: Optional[str] = None


class UserProfileResponse(BaseModel):
    uid: str
    email: str
    firstName: str
    lastName: str
    institution: str
    currentRole: str
    entryCount: int
    createdAt: datetime
    lastSync: Optional[datetime] = None
    profileImage: Optional[str] = None


# ── Two-Way Sync Models ───────────────────────────────────────────────

class SyncEntryData(BaseModel):
    """
    Local journal entry data sent by the client during sync.
    Includes all fields needed for conflict resolution.
    """
    localId: str
    firestoreId: Optional[str] = None  # None for new entries
    userId: str
    speciesName: str
    scientificName: str
    confidenceScore: float = Field(..., ge=0.0, le=1.0)
    localImageUri: str  # Local file path on device
    imageUrl: Optional[str] = None  # Cloud URL if already uploaded
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    locationName: Optional[str] = None
    capturedAt: int  # Unix timestamp in ms
    createdAt: int  # Unix timestamp in ms
    lastUpdated: int  # Unix timestamp in ms - used for conflict resolution
    syncStatus: str  # 'synced' | 'pending' | 'failed'
    notes: str = ""
    tags: list[str] = []
    behaviorObserved: str = ""
    quantity: int = Field(1, ge=0)
    habitatType: str = ""
    animalClass: str = "Other"
    isDeleted: bool = False  # Soft delete flag
    deletedAt: Optional[int] = None  # When deleted locally


class TwoWaySyncRequest(BaseModel):
    """
    Request body for two-way sync endpoint.
    Client sends all local entries that need syncing.
    """
    localEntries: list[SyncEntryData]
    lastSyncTime: Optional[int] = None  # Client's last successful sync timestamp


class SyncedEntryResponse(BaseModel):
    """
    Single entry in sync response with all fields needed by client.
    """
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


class TwoWaySyncResponse(BaseModel):
    """
    Response body for two-way sync endpoint.
    Contains the merged result of local and cloud data.
    """
    success: bool
    mergedEntries: list[SyncedEntryResponse]  # All entries after merge
    uploaded: int  # Count of entries uploaded to cloud
    downloaded: int  # Count of entries downloaded from cloud
    deleted: int  # Count of entries deleted from cloud
    conflicts: int  # Count of conflicts resolved
    errors: list[str]  # Error messages if any
    syncTimestamp: int  # Server timestamp for this sync
    syncDeferred: bool = False  # True when cloud was unreachable


# ── Image Upload Models ──────────────────────────────────────────────

class ImageUploadResponse(BaseModel):
    """Response from journal image upload endpoint."""
    imageUrl: str  # Firebase Storage download URL
    storagePath: str  # Firebase Storage path (e.g., users/{uid}/journals/{id}/species.jpg)
    localId: str  # The localId associated with this image


class ProfileImageUploadResponse(BaseModel):
    """Response from profile image upload endpoint."""
    imageUrl: str  # Firebase Storage download URL
    storagePath: str  # Firebase Storage path


# ── Forgot Password Models ──────────────────────────────────────────

class ForgotPasswordInitRequest(BaseModel):
    """Step 1: User provides email to start password reset."""
    email: str


class ForgotPasswordInitResponse(BaseModel):
    """Returns a session token and the 2 challenge field labels."""
    session_token: str
    challenge_fields: list[str]  # Display labels e.g. ["First Name", "Current Role"]


class ForgotPasswordVerifyRequest(BaseModel):
    """Step 2: User answers the 2 challenge questions."""
    session_token: str
    answers: dict[str, str]  # { "First Name": "john", "Current Role": "researcher" }


class ForgotPasswordVerifyResponse(BaseModel):
    """Returns a reset token if verification succeeded."""
    reset_token: str


class ForgotPasswordResetRequest(BaseModel):
    """Step 3: User sets a new password using the reset token."""
    reset_token: str
    new_password: str = Field(..., min_length=8)
