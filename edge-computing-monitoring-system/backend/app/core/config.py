from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Edge Monitoring Backend"
    app_version: str = "0.2.0"

    # Storage mode: local or s3
    storage_backend: str = "local"

    # Local fallback/debug storage root
    data_directory: Path = Path.home() / "edge-monitoring-data"

    # Backward-compatible paths used by earlier backend code
    database_path: Path | None = None
    raw_frames_directory: Path | None = None
    annotated_frames_directory: Path | None = None
    metadata_directory: Path | None = None

    # SeaweedFS S3 configuration
    s3_endpoint_url: str = "http://192.168.178.200:8333"
    s3_images_bucket: str = "captured-images"
    s3_metadata_bucket: str = "event-metadata"
    s3_unsigned_requests: bool = True

    max_upload_size_bytes: int = 5 * 1024 * 1024
    
    run_inference_on_upload: bool = True
    yolo_model_path: str = "../object_detection/training/best_k.pt"
    yolo_confidence_threshold: float = 0.55

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def model_post_init(self, __context):
        self.data_directory = Path(self.data_directory)

        if self.database_path is None:
            self.database_path = self.data_directory / "database" / "edge_monitoring.sqlite3"

        if self.raw_frames_directory is None:
            self.raw_frames_directory = self.data_directory / "raw"

        if self.annotated_frames_directory is None:
            self.annotated_frames_directory = self.data_directory / "annotated"

        if self.metadata_directory is None:
            self.metadata_directory = self.data_directory / "metadata"


settings = Settings()
