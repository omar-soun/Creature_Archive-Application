"""Image upload router — entry images and profile images."""

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.core.dependencies import get_bucket, get_current_user_uid, get_db
from .schemas import ImageUploadResponse, ProfileImageUploadResponse
from .service import ImageUploadService

router = APIRouter(tags=["images"])


def _get_service(bucket=Depends(get_bucket)) -> ImageUploadService:
    return ImageUploadService(bucket)


@router.post("/entries/upload-image", response_model=ImageUploadResponse)
def upload_entry_image(
    image: UploadFile = File(...),
    localId: str = Form(...),
    uid: str = Depends(get_current_user_uid),
    service: ImageUploadService = Depends(_get_service),
):
    """
    Upload a journal entry image to Firebase Storage via the backend.
    Frontend must NOT upload directly to Firebase Storage.
    """
    file_content = image.file.read()
    result = service.upload_entry_image(
        uid, localId, file_content, image.content_type or "image/jpeg"
    )
    return ImageUploadResponse(**result)


@router.post("/auth/upload-profile-image", response_model=ProfileImageUploadResponse)
def upload_profile_image(
    image: UploadFile = File(...),
    uid: str = Depends(get_current_user_uid),
    service: ImageUploadService = Depends(_get_service),
    db=Depends(get_db),
):
    """
    Upload a profile image to Firebase Storage via the backend.
    Frontend must NOT upload directly to Firebase Storage.
    """
    file_content = image.file.read()
    result = service.upload_profile_image(
        uid, file_content, image.content_type or "image/jpeg", db=db
    )
    return ProfileImageUploadResponse(**result)
