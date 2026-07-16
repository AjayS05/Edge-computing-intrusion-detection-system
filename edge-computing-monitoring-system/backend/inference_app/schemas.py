from __future__ import annotations

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x_min: float
    y_min: float
    x_max: float
    y_max: float


class DetectionResponse(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    confidence_percent: float
    severity: str
    bounding_box: BoundingBox


class InferenceResponse(BaseModel):
    detections: list[DetectionResponse]
    detection_count: int = Field(ge=0)
    annotated_image_base64: str | None
    inference_latency_seconds: float = Field(ge=0)
    annotation_saved: bool
    annotation_diff_pixels: int = Field(ge=0)


class HealthResponse(BaseModel):
    status: str
    service: str
    model_loaded: bool


class ModelInfoResponse(BaseModel):
    model_path: str
    model_filename: str
    model_loaded: bool
    confidence_threshold: float
    classes: dict[int, str]
    class_count: int
