from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Runtime settings loaded from environment variables."""

    app_name: str
    app_version: str
    data_directory: Path
    raw_frames_directory: Path
    database_path: Path
    max_upload_bytes: int
    allowed_content_types: frozenset[str]


def load_settings() -> Settings:
    data_directory = Path(
        os.getenv("EDGE_MONITORING_DATA_DIR", "~/edge-monitoring-data")
    ).expanduser().resolve()

    return Settings(
        app_name="Edge Computing Monitoring Backend",
        app_version="0.1.0",
        data_directory=data_directory,
        raw_frames_directory=data_directory / "raw",
        database_path=data_directory / "database" / "edge_monitoring.sqlite3",
        max_upload_bytes=int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024))),
        allowed_content_types=frozenset({"image/jpeg", "image/png"}),
    )


settings = load_settings()
