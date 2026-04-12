"""Species router — species data lookup, prediction validation, and online detection."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.dependencies import get_current_user_uid
from .service import (
    detect_via_animaldetect_api,
    get_all_species,
    get_species_by_name,
    validate_prediction,
)

router = APIRouter(prefix="/species", tags=["species"])


@router.get("")
def list_all_species():
    """Return all 101 species with scientific names and descriptions."""
    return get_all_species()


@router.get("/{common_name}")
def get_species_info(common_name: str):
    """Look up a species by common name."""
    species = get_species_by_name(common_name)
    if species is None:
        raise HTTPException(
            status_code=404, detail=f"Species '{common_name}' not found."
        )
    return species


@router.post("/validate")
def validate_species_prediction(
    species_name: str,
    confidence_score: float,
    uid: str = Depends(get_current_user_uid),
):
    """
    Post-sync validation: map a mobile prediction (common name + confidence)
    to the canonical scientific name and description from species_data.json.
    """
    return validate_prediction(species_name, confidence_score)


@router.post("/detect")
async def detect_animal_online(
    image: UploadFile = File(..., description="JPEG image of the animal to identify"),
    uid: str = Depends(get_current_user_uid),
):
    """
    Proxy an image to the AnimalDetect API for online species identification.

    Called by the mobile app ONLY when:
    - The user rejects the on-device ML prediction, AND
    - The device has an active internet connection.

    The AnimalDetect API key is stored server-side in .env and is never
    sent to or accessible from the frontend.

    Returns:
        {
            "commonName": str,
            "scientificName": str,
            "confidence": int,   # 0-100
            "extraData": dict,   # additional data from API (stored in notes)
        }
    """
    image_bytes = await image.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    try:
        result = await detect_via_animaldetect_api(
            image_bytes=image_bytes,
            image_filename=image.filename or "image.jpg",
        )
    except ValueError as exc:
        # API key not configured or rejected
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"AnimalDetect API call failed: {exc}",
        ) from exc

    return result
