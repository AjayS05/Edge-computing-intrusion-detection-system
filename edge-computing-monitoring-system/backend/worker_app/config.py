from __future__ import annotations

import socket

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    service_name: str = "edge-image-worker"

    worker_id: str = Field(
        default_factory=socket.gethostname
    )

    processing_mode: str = "clahe"

    max_upload_size_bytes: int = 5 * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("processing_mode")
    @classmethod
    def validate_processing_mode(cls, value: str) -> str:
        normalized_value = value.strip().lower()

        supported_modes = {
            "identity",
            "grayscale",
            "clahe",
        }

        if normalized_value not in supported_modes:
            raise ValueError(
                "WORKER_PROCESSING_MODE must be one of: "
                "identity, grayscale, clahe"
            )

        return normalized_value


worker_settings = WorkerSettings()
