"""
Shared Firestore utility functions.

Eliminates the duplicated _firestore_increment() helper.
"""

from google.cloud.firestore_v1 import transforms


def firestore_increment(value: int):
    """Atomic increment for Firestore numeric fields."""
    return transforms.Increment(value)
