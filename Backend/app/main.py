"""
Creature Archive API — FastAPI Backend

App factory with router wiring, startup/shutdown lifecycle, and exception handling.

Auth flow (Firebase Auth + FastAPI):
─────────────────────────────────────
1. MOBILE: User signs up via Firebase Auth SDK → createUserWithEmailAndPassword()
   This creates the Firebase Auth record and returns a uid + ID token.

2. MOBILE: Immediately POST /auth/signup with the ID token in Authorization header.
   The backend verifies the token, extracts the uid, and creates the Firestore
   user profile document (users/{uid}).

3. MOBILE: For all subsequent requests, the mobile app calls user.getIdToken()
   and sends it as "Bearer <token>" in the Authorization header.

4. BACKEND: Every protected route uses Depends(get_current_user_uid) which
   decodes the Firebase ID token and returns the uid. Routes then scope all
   Firestore queries to that uid.

5. TOKEN REFRESH: Firebase ID tokens expire after 1 hour. The mobile SDK
   auto-refreshes them. The backend just verifies whatever token it receives.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.firebase import init_firebase
from app.core.logging import setup_logging

from app.features.auth.router import router as auth_router
from app.features.entries.router import router as entries_router
from app.features.health.router import router as health_router
from app.features.images.router import router as images_router
from app.features.species.router import router as species_router
from app.features.sync.router import router as sync_router

logger = logging.getLogger("creature_archive")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup and shutdown lifecycle management."""
    settings = get_settings()
    setup_logging(debug=settings.debug)
    logger.info("Starting Creature Archive API...")
    init_firebase()
    logger.info("Firebase initialized successfully.")
    yield
    logger.info("Shutting down Creature Archive API.")


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title="Creature Archive API",
        version="2.0.0",
        lifespan=lifespan,
    )

    register_exception_handlers(app)

    # IMPORTANT: Router registration order matters!
    # Sync router MUST be included before entries router because
    # /entries/sync and /entries/two-way-sync must match before /entries/{entry_id}
    app.include_router(sync_router)
    app.include_router(images_router)
    app.include_router(auth_router)
    app.include_router(entries_router)
    app.include_router(species_router)
    app.include_router(health_router)

    return app


app = create_app()
