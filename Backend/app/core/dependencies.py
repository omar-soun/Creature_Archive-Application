"""
FastAPI dependency injection functions.

All dependencies use Depends() and are injected into route handlers.
This eliminates duplicated _db() helpers and makes auth reusable.
"""

import logging

from fastapi import Header, HTTPException

from .firebase import get_firestore_client, get_storage_bucket as _get_bucket

logger = logging.getLogger("creature_archive.security")


def get_db():
    """Dependency: Firestore client."""
    return get_firestore_client()


def get_bucket():
    """Dependency: Firebase Storage bucket."""
    return _get_bucket()


def get_current_user_uid(authorization: str = Header(...)) -> str:
    """
    Dependency: Verify Firebase ID token and return the user's UID.

    Replaces the private _verify_token() function from the old main.py.
    Use via: uid: str = Depends(get_current_user_uid)
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Authorization header."
        )

    token = authorization.split("Bearer ")[1]
    try:
        from firebase_admin import auth

        decoded = auth.verify_id_token(token)
        return decoded["uid"]
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Token verification failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
