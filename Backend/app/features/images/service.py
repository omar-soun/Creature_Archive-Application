"""
Image upload service — handles Firebase Storage uploads.

Consolidates the duplicated upload pattern from the two image upload endpoints
into a single reusable service.
"""

import logging
import uuid
from urllib.parse import quote

from app.core.exceptions import AppException

logger = logging.getLogger("creature_archive.images.service")


class ImageUploadService:
    def __init__(self, bucket):
        self._bucket = bucket

    def _upload_to_storage(
        self,
        file_content: bytes,
        storage_path: str,
        content_type: str = "image/jpeg",
    ) -> str:
        """
        Upload bytes to Firebase Storage and return the download URL.

        This is the shared upload logic that eliminates duplication between
        entry image and profile image uploads.
        """
        download_token = str(uuid.uuid4())

        blob = self._bucket.blob(storage_path)
        blob.metadata = {"firebaseStorageDownloadTokens": download_token}

        blob.upload_from_string(file_content, content_type=content_type)

        # Construct Firebase Storage download URL with token
        encoded_path = quote(storage_path, safe="")
        image_url = (
            f"https://firebasestorage.googleapis.com/v0/b/{self._bucket.name}"
            f"/o/{encoded_path}?alt=media&token={download_token}"
        )

        return image_url

    def upload_entry_image(
        self, uid: str, local_id: str, file_content: bytes, content_type: str
    ) -> dict:
        """Upload a journal entry image to Firebase Storage."""
        storage_path = f"users/{uid}/journals/{local_id}/species.jpg"
        try:
            image_url = self._upload_to_storage(file_content, storage_path, content_type)
            return {
                "imageUrl": image_url,
                "storagePath": storage_path,
                "localId": local_id,
            }
        except Exception as e:
            logger.error(
                "Entry image upload failed: %s: %s",
                type(e).__name__,
                e,
                exc_info=True,
            )
            raise AppException(f"Image upload failed: {str(e)}", status_code=500)

    def upload_profile_image(
        self, uid: str, file_content: bytes, content_type: str, db=None
    ) -> dict:
        """Upload a profile image and optionally update the user profile."""
        storage_path = f"users/{uid}/profile/profile.jpg"
        try:
            image_url = self._upload_to_storage(file_content, storage_path, content_type)

            # Update user profile in Firestore with the image URL
            if db:
                user_ref = db.collection("users").document(uid)
                if user_ref.get().exists:
                    user_ref.update({"profileImage": image_url})

            return {
                "imageUrl": image_url,
                "storagePath": storage_path,
            }
        except AppException:
            raise
        except Exception as e:
            logger.error(
                "Profile image upload failed: %s: %s",
                type(e).__name__,
                e,
                exc_info=True,
            )
            raise AppException(
                f"Profile image upload failed: {str(e)}", status_code=500
            )
