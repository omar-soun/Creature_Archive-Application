"""
Firebase Admin SDK initialization and client singletons.

Initialized once during app startup via lifespan.
All other modules access Firebase through dependency injection (see dependencies.py).
"""

import firebase_admin
from firebase_admin import credentials, firestore, storage as fb_storage

from .config import get_settings

_db_client = None
_storage_bucket = None


def init_firebase() -> None:
    """Initialize Firebase Admin SDK. Called once at app startup."""
    if firebase_admin._apps:
        return

    settings = get_settings()
    options = {}

    if settings.firebase_storage_bucket:
        options["storageBucket"] = settings.firebase_storage_bucket

    if settings.service_account_path.exists():
        cred = credentials.Certificate(str(settings.service_account_path))
        if not settings.firebase_storage_bucket and cred.project_id:
            options["storageBucket"] = f"{cred.project_id}.firebasestorage.app"
        firebase_admin.initialize_app(cred, options)
    elif settings.google_application_credentials:
        firebase_admin.initialize_app(options=options)
    else:
        raise RuntimeError(
            "Firebase credentials not found. "
            "Place service-account.json in Backend/app/ "
            "or set GOOGLE_APPLICATION_CREDENTIALS env var."
        )


def get_firestore_client():
    """Get the Firestore client singleton. Firebase must be initialized first."""
    global _db_client
    if _db_client is None:
        _db_client = firestore.client()
    return _db_client


def get_storage_bucket():
    """Get the Firebase Storage bucket singleton."""
    global _storage_bucket
    if _storage_bucket is None:
        _storage_bucket = fb_storage.bucket()
    return _storage_bucket


def check_firestore_reachable() -> bool:
    """Quick connectivity check to Firestore with 5-second timeout."""
    try:
        db = get_firestore_client()
        db.collection("_health_check").document("ping").get(timeout=5)
        return True
    except Exception:
        return False
