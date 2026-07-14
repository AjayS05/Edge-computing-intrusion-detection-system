from __future__ import annotations

from pydantic import BaseModel, Field


class WorkerHealthResponse(BaseModel):
    status: str
    service: str
    worker_id: str
    processing_mode: str


class TileProcessingResponse(BaseModel):
    status: str

    worker_id: str
    frame_id: str
    tile_id: str

    row: int = Field(ge=0)
    column: int = Field(ge=0)

    x: int = Field(ge=0)
    y: int = Field(ge=0)

    width: int = Field(gt=0)
    height: int = Field(gt=0)

    original_width: int = Field(gt=0)
    original_height: int = Field(gt=0)

    processing_mode: str
    processing_latency_seconds: float = Field(ge=0)

    processed_content_type: str
    processed_image_base64: str
    processed_image_sha256: str
