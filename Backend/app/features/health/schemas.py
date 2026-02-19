from pydantic import BaseModel


class HealthCheckResponse(BaseModel):
    status: str
    model_loaded: bool
    species_count: int
    timestamp: str
