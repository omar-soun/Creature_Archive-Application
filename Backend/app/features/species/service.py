"""
Species service — species data loading and validation.

Loads species_data.json and provides lookup/validation.
NO ML inference — that is handled on the frontend.
"""

from __future__ import annotations

import json
import logging

from app.core.config import get_settings

logger = logging.getLogger("creature_archive.species.service")

_species_data: list[dict] | None = None
_species_map: dict[str, dict] | None = None


def _load_species_data() -> list[dict]:
    """Load species metadata from JSON (lazy-loaded singleton)."""
    global _species_data
    if _species_data is not None:
        return _species_data

    settings = get_settings()
    species_path = settings.species_data_path

    if not species_path.exists():
        logger.warning("species_data.json not found at %s", species_path)
        _species_data = []
        return _species_data

    with open(species_path, "r") as f:
        _species_data = json.load(f)

    logger.info("Loaded %d species from %s", len(_species_data), species_path)
    return _species_data


def _load_species_map() -> dict[str, dict]:
    """Build a name-based lookup dict (lazy-loaded singleton)."""
    global _species_map
    if _species_map is not None:
        return _species_map

    _species_map = {item["common_name"]: item for item in _load_species_data()}
    return _species_map


def get_species_count() -> int:
    """Return the total number of species."""
    return len(_load_species_data())


def get_species_by_name(common_name: str) -> dict | None:
    """Look up species info by common name. Returns None if not found."""
    return _load_species_map().get(common_name)


def get_all_species() -> list[dict]:
    """Return the full species data list."""
    return _load_species_data()


def validate_prediction(species_name: str, confidence: float) -> dict:
    """
    Validate a mobile-side prediction against species_data.json.
    Maps common_name -> scientific_name + description.
    Used during post-sync processing.
    """
    species = get_species_by_name(species_name)
    if species is None:
        return {
            "valid": False,
            "speciesName": species_name,
            "scientificName": "Unknown",
            "description": "",
            "confidenceScore": confidence,
        }
    return {
        "valid": True,
        "speciesName": species["common_name"],
        "scientificName": species["scientific_name"],
        "description": species.get("description", ""),
        "confidenceScore": confidence,
    }
