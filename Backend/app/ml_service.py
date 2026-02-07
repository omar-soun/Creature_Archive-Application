import json
import pickle
import time
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

from .config import TFLITE_MODEL_PATH, PREPROCESSOR_PATH, SPECIES_DATA_PATH

# ── Lazy-loaded singletons ─────────────────────────────────────────────
_interpreter = None
_preprocessor = None
_species_data: list[dict] | None = None


def _load_tflite():
    """Load the TFLite interpreter once."""
    global _interpreter
    if _interpreter is not None:
        return _interpreter

    import tensorflow as tf

    _interpreter = tf.lite.Interpreter(model_path=str(TFLITE_MODEL_PATH))
    _interpreter.allocate_tensors()
    return _interpreter


def _load_preprocessor():
    """Load the serialised OpenCV preprocessor once."""
    global _preprocessor
    if _preprocessor is not None:
        return _preprocessor

    with open(PREPROCESSOR_PATH, "rb") as f:
        _preprocessor = pickle.load(f)
    return _preprocessor


def _load_species_data() -> list[dict]:
    """Load species metadata from JSON."""
    global _species_data
    if _species_data is not None:
        return _species_data

    with open(SPECIES_DATA_PATH, "r") as f:
        _species_data = json.load(f)
    return _species_data


_species_map: dict[str, dict] | None = None


def _load_species_map() -> dict[str, dict]:
    """Build a name-based lookup dict for post-sync species mapping."""
    global _species_map
    if _species_map is not None:
        return _species_map

    _species_map = {item["common_name"]: item for item in _load_species_data()}
    return _species_map


def get_species_count() -> int:
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
    Maps common_name → scientific_name + description.
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


def is_model_loaded() -> bool:
    try:
        _load_tflite()
        return True
    except Exception:
        return False


def predict(image_bytes: bytes) -> dict:
    """
    Run species classification on raw image bytes.

    Returns dict matching PredictionResponse schema.
    """
    start = time.time()

    # 1. Decode image
    img = Image.open(BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)

    # 2. Preprocess using the serialised OpenCV preprocessor
    preprocessor = _load_preprocessor()
    if hasattr(preprocessor, "preprocess"):
        processed = preprocessor.preprocess(img_array)
    else:
        # Fallback: manual resize + normalise to match MobileNetV2 input
        processed = np.array(img.resize((224, 224)), dtype=np.float32) / 255.0

    # Ensure batch dimension  (1, 224, 224, 3)
    if processed.ndim == 3:
        processed = np.expand_dims(processed, axis=0)
    processed = processed.astype(np.float32)

    # 3. Run TFLite inference
    interpreter = _load_tflite()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    interpreter.set_tensor(input_details[0]["index"], processed)
    interpreter.invoke()

    output = interpreter.get_tensor(output_details[0]["index"])[0]

    # 4. Map output to species
    species_id = int(np.argmax(output))
    confidence = float(output[species_id])
    species_data = _load_species_data()

    species = species_data[species_id] if species_id < len(species_data) else {
        "common_name": "Unknown",
        "scientific_name": "Unknown",
    }

    elapsed = round(time.time() - start, 4)

    return {
        "species_name": species["common_name"],
        "scientific_name": species["scientific_name"],
        "confidence_score": round(confidence, 4),
        "species_id": species_id,
        "prediction_time": f"{elapsed}s",
    }
