"""Health check router."""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.features.species.service import get_species_count
from .schemas import HealthCheckResponse

router = APIRouter(tags=["health"])


@router.get("/")
def root():
    """Root health check."""
    return {"message": "Creature Archive API is running"}


@router.get("/health", response_model=HealthCheckResponse)
def health_check():
    """Detailed health check with species data status."""
    return HealthCheckResponse(
        status="healthy",
        model_loaded=True,
        species_count=get_species_count(),
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
