from pydantic import BaseModel


class ImageUploadResponse(BaseModel):
    """Response from journal image upload endpoint."""
    imageUrl: str
    storagePath: str
    localId: str


class ProfileImageUploadResponse(BaseModel):
    """Response from profile image upload endpoint."""
    imageUrl: str
    storagePath: str
