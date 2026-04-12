"""
Species service — species data loading, validation, and online detection.

Loads species_data.json and provides lookup/validation.
Also proxies image detection requests to the AnimalDetect API
so the API key is never exposed to frontend clients.
"""

from __future__ import annotations

import json
import logging

import httpx

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


def _parse_animaldetect_response(data: dict) -> dict:
    """
    Parse the AnimalDetect API response into a normalised result.

    Actual AnimalDetect API response shape (POST /api/v1/detect):
    {
        "id": "uuid",
        "expires_at": "ISO-8601",
        "annotations": [
            {
                "id": 1,
                "bbox": [x, y, w, h],
                "score": 0.97,          # confidence 0.0-1.0
                "label": "Lion",        # common name
                "taxonomy": {
                    "id": "uuid",
                    "class": "Mammalia",
                    "order": "Carnivora",
                    "family": "Felidae",
                    "genus": "Panthera",
                    "species": "leo"    # species epithet (combine with genus)
                }
            }
        ],
        "info": { "processing_time_ms": ..., "model_version": ..., ... }
    }
    The top annotation (highest score) is used as the primary result.
    """
    annotations: list[dict] = data.get("annotations") or []

    if not annotations:
        return {
            "commonName": "Unknown",
            "scientificName": "",
            "confidence": 0,
            "extraData": {},
        }

    # Sort by score descending — take the top detection
    annotations_sorted = sorted(annotations, key=lambda a: a.get("score", 0), reverse=True)
    top = annotations_sorted[0]

    common_name: str = top.get("label") or "Unknown"
    confidence_raw: float = float(top.get("score") or 0.0)

    # Build scientific name from genus + species epithet when available
    taxonomy: dict = top.get("taxonomy") or {}
    genus: str = taxonomy.get("genus") or ""
    species_epithet: str = taxonomy.get("species") or ""
    if genus and species_epithet:
        scientific_name = f"{genus} {species_epithet}"
    elif genus:
        scientific_name = genus
    else:
        scientific_name = ""

    # Preserve useful taxonomy + bbox as extra data for the Notes field
    extra_data: dict = {}
    if taxonomy:
        for key in ("class", "order", "family"):
            if taxonomy.get(key):
                extra_data[key] = taxonomy[key]
    if top.get("bbox"):
        extra_data["bbox"] = top["bbox"]
    if data.get("info"):
        extra_data["detection_info"] = data["info"]

    return {
        "commonName": common_name,
        "scientificName": scientific_name,
        "confidence": round(confidence_raw * 100),  # 0-100 percentage
        "extraData": extra_data,
    }


async def detect_via_animaldetect_api(
    image_bytes: bytes,
    image_filename: str = "image.jpg",
) -> dict:
    """
    Send an image to the AnimalDetect API and return a normalised result.

    This is called ONLY from the backend — the API key is read from
    server-side environment variables and never exposed to clients.

    Returns:
        {
            "commonName": str,
            "scientificName": str,
            "confidence": int,   # 0-100
            "extraData": dict,
        }

    Raises:
        ValueError: If ANIMAL_DETECT_API_KEY is not configured.
        httpx.HTTPError: If the upstream API call fails.
    """
    settings = get_settings()
    api_key = settings.animal_detect_api_key
    api_url = settings.animal_detect_api_url

    if not api_key:
        raise ValueError(
            "ANIMAL_DETECT_API_KEY is not set. "
            "Add it to Backend/.env to enable online animal detection."
        )

    logger.info(
        "Calling AnimalDetect API at %s for image '%s'", api_url, image_filename
    )

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            api_url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
            },
            files={"image": (image_filename, image_bytes, "image/jpeg")},
        )

    if response.status_code == 401:
        raise ValueError("AnimalDetect API rejected the API key (401 Unauthorized).")

    if not response.is_success:
        logger.error(
            "AnimalDetect API error %s: %s", response.status_code, response.text
        )
        raise httpx.HTTPStatusError(
            f"AnimalDetect API returned {response.status_code}",
            request=response.request,
            response=response,
        )

    data = response.json()
    result = _parse_animaldetect_response(data)
    logger.info(
        "AnimalDetect result: %s (%s) confidence=%d%%",
        result["commonName"],
        result["scientificName"],
        result["confidence"],
    )
    return result
