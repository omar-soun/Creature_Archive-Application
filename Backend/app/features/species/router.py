"""Species router — species data lookup and prediction validation."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user_uid
from .service import get_all_species, get_species_by_name, validate_prediction

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
