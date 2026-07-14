from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Edge Monitoring Backend"
    app_version: str = "0.2.0"

    # Storage mode: local or s3
    storage_backend: str = "s3"
    
    #Telegram bot
    telegram_enabled: bool = False
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    
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
    s3_access_key_id: str = "admin"
    s3_secret_access_key: str = "admin"
    s3_unsigned_requests: bool = False

    max_upload_size_bytes: int = 5 * 1024 * 1024
    
    run_inference_on_upload: bool = True
    yolo_model_path: str = "models/best_final.pt"
    yolo_confidence_threshold: float = 0.55
   
    # Dedicated inference service
    inference_service_url: str = "http://127.0.0.1:8001"
    inference_request_timeout_seconds: float = 60.0
   
   # Distributed Pi3 image processing
    distributed_processing_enabled: bool = True

    # Comma-separated worker URLs for local testing.
    worker_urls: str = (
        "http://127.0.0.1:8002,"
        "http://127.0.0.1:8003"
    )

    # Kubernetes headless-service discovery.
    worker_service_host: str | None = None
    worker_service_port: int = 8002

    worker_health_timeout_seconds: float = 2.0
    worker_request_timeout_seconds: float = 30.0

    worker_tile_overlap_pixels: int = 32

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
