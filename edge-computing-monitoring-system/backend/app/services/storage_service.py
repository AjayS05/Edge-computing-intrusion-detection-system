from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import boto3
from botocore import UNSIGNED
from botocore.config import Config

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self.storage_backend = settings.storage_backend.lower()

        if self.storage_backend == "s3":
            boto_config = Config(signature_version=UNSIGNED) if settings.s3_unsigned_requests else None

            self.s3_client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                config=boto_config,
            )
        else:
            self.s3_client = None
            settings.data_directory.mkdir(parents=True, exist_ok=True)

    def generate_frame_id(self) -> str:
        return uuid4().hex

    def today_utc(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def build_raw_image_key(self, sensor_node_id: str, frame_id: str, extension: str = "jpg") -> str:
        return f"raw/{sensor_node_id}/{self.today_utc()}/{frame_id}.{extension}"

    def build_annotated_image_key(self, sensor_node_id: str, frame_id: str, extension: str = "jpg") -> str:
        return f"annotated/{sensor_node_id}/{self.today_utc()}/{frame_id}_annotated.{extension}"

    def build_frame_metadata_key(self, frame_id: str) -> str:
        return f"frames/{frame_id}.json"

    def build_detection_metadata_key(self, frame_id: str) -> str:
        return f"detections/{frame_id}.json"

    def build_event_metadata_key(self, event_id: str) -> str:
        return f"events/{event_id}.json"

    def upload_image_bytes(
        self,
        *,
        image_bytes: bytes,
        object_key: str,
        content_type: str,
    ) -> str:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            self.s3_client.put_object(
                Bucket=settings.s3_images_bucket,
                Key=object_key,
                Body=image_bytes,
                ContentType=content_type,
            )

            return f"s3://{settings.s3_images_bucket}/{object_key}"

        local_path = settings.data_directory / object_key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(image_bytes)
        return str(local_path)

    def upload_metadata_json(
        self,
        *,
        metadata: dict[str, Any],
        object_key: str,
    ) -> str:
        body = json.dumps(metadata, indent=2, default=str).encode("utf-8")

        if self.storage_backend == "s3":
            assert self.s3_client is not None

            self.s3_client.put_object(
                Bucket=settings.s3_metadata_bucket,
                Key=object_key,
                Body=body,
                ContentType="application/json",
            )

            return f"s3://{settings.s3_metadata_bucket}/{object_key}"

        local_path = settings.data_directory / object_key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(body)
        return str(local_path)

    def download_image_bytes(self, object_key: str) -> bytes:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            response = self.s3_client.get_object(
                Bucket=settings.s3_images_bucket,
                Key=object_key,
            )
            return response["Body"].read()

        local_path = settings.data_directory / object_key
        return local_path.read_bytes()


storage_service = StorageService()
