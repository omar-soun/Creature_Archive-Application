import os
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore, storage as fb_storage

# ── Paths ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "CreatureArchive_model" / "dataset"

TFLITE_MODEL_PATH = MODEL_DIR / "creature_archive_model.tflite"
PREPROCESSOR_PATH = MODEL_DIR / "creature_preprocessor.pkl"
SPECIES_DATA_PATH = MODEL_DIR / "species_data.json"

# ── Firebase Admin SDK ─────────────────────────────────────────────────
# Set GOOGLE_APPLICATION_CREDENTIALS env var to your service-account key
# OR place service-account.json in Backend/app/
SERVICE_ACCOUNT_PATH = BASE_DIR / "service-account.json"

# Storage bucket name (override with FIREBASE_STORAGE_BUCKET env var)
# Defaults to {project-id}.firebasestorage.app from service account
STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", None)


def init_firebase() -> firestore.firestore.Client:

    """Initialise Firebase Admin and return a Firestore client."""
    if not firebase_admin._apps:
        options = {}
        if STORAGE_BUCKET:
            options["storageBucket"] = STORAGE_BUCKET

        if SERVICE_ACCOUNT_PATH.exists():
            cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
            # Auto-detect bucket from project ID if not explicitly set
            if not STORAGE_BUCKET:
                project_id = cred.project_id
                if project_id:
                    options["storageBucket"] = f"{project_id}.firebasestorage.app"
            firebase_admin.initialize_app(cred, options)
        elif os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            firebase_admin.initialize_app(options=options)
        else:
            raise RuntimeError(
                "Firebase credentials not found. "
                "Place service-account.json in Backend/app/ "
                "or set GOOGLE_APPLICATION_CREDENTIALS env var."
            )
    return firestore.client()


def get_storage_bucket():
    """Get the Firebase Storage bucket. Initializes Firebase if needed."""
    init_firebase()
    return fb_storage.bucket()


def check_firestore_reachable() -> bool:
    """
    Quick connectivity check to Firestore.
    Attempts a lightweight read with a short timeout.
    Returns True if Firestore is reachable, False otherwise.
    """
    try:
        db = init_firebase()
        # Attempt a minimal read — reading a nonexistent doc is the lightest operation
        db.collection("_health_check").document("ping").get(timeout=5)
        return True
    except Exception:
        return False
