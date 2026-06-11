from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


FrameStatus = Literal["received", "processing", "processed", "failed"]


class FrameResponse(BaseModel):
    frame_id: str
    sensor_node_id: str
    sequence_number: int | None = None
    camera_location: str | None = None
    captured_at: datetime
    received_at: datetime
    status: FrameStatus
    content_type: str
    size_bytes: int
    stored_filename: str


class FrameUploadResponse(BaseModel):
    message: str = Field(default="Frame uploaded successfully")
    frame: FrameResponse


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    data_directory: str
    database_status: Literal["ok"]
