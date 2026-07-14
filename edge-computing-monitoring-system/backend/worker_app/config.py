from __future__ import annotations

import socket

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerSettings(BaseSettings):
    service_name: str = Field(
        default="edge-image-worker",
        validation_alias="WORKER_SERVICE_NAME",
    )
    worker_id: str = Field(
        default_factory=socket.gethostname,
        validation_alias="WORKER_ID",
    )
    processing_mode: str = Field(
        default="clahe",
        validation_alias="WORKER_PROCESSING_MODE",
    )
    max_upload_size_bytes: int = Field(
        default=5 * 1024 * 1024,
        validation_alias="WORKER_MAX_UPLOAD_SIZE_BYTES",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("processing_mode")
    @classmethod
    def validate_processing_mode(
        cls,
        value: str,
    ) -> str:
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
