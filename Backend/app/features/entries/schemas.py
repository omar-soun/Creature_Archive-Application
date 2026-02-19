from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


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
