from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import boto3
from botocore import UNSIGNED
from botocore.config import Config
from botocore.exceptions import ClientError

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

    def generate_alert_id(self) -> str:
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

    def build_alert_metadata_key(self, alert_id: str) -> str:
        return f"alerts/{alert_id}.json"

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

    def read_metadata_json(self, object_key: str) -> dict[str, Any]:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            response = self.s3_client.get_object(
                Bucket=settings.s3_metadata_bucket,
                Key=object_key,
            )
            return json.loads(response["Body"].read().decode("utf-8"))

        local_path = settings.data_directory / object_key
        return json.loads(local_path.read_text(encoding="utf-8"))

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

    def list_metadata_objects(self, prefix: str) -> list[dict[str, Any]]:
        """
        Returns metadata objects safely.

        Important:
        - If the bucket does not exist, return [] instead of crashing.
        - If the bucket is empty, return [].
        - Sort by LastModified newest first when available.
        """
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            objects: list[dict[str, Any]] = []

            try:
                paginator = self.s3_client.get_paginator("list_objects_v2")

                for page in paginator.paginate(
                    Bucket=settings.s3_metadata_bucket,
                    Prefix=prefix,
                ):
                    for item in page.get("Contents", []):
                        objects.append(
                            {
                                "key": item["Key"],
                                "last_modified": item.get("LastModified"),
                                "size": item.get("Size", 0),
                            }
                        )

            except ClientError as exc:
                error_code = exc.response.get("Error", {}).get("Code")

                if error_code in {"NoSuchBucket", "404", "NotFound"}:
                    return []

                return []

            return sorted(
                objects,
                key=lambda item: item.get("last_modified") or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True,
            )

        local_root = settings.data_directory / prefix
        if not local_root.exists():
            return []

        objects = []

        for path in local_root.rglob("*.json"):
            objects.append(
                {
                    "key": str(path.relative_to(settings.data_directory)),
                    "last_modified": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc),
                    "size": path.stat().st_size,
                }
            )

        return sorted(
            objects,
            key=lambda item: item.get("last_modified") or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

    def list_metadata_keys(self, prefix: str) -> list[str]:
        return [item["key"] for item in self.list_metadata_objects(prefix)]

    def count_metadata_objects(self, prefix: str) -> int:
        return len(self.list_metadata_objects(prefix))

    def count_image_objects(self, prefix: str) -> int:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            count = 0

            try:
                paginator = self.s3_client.get_paginator("list_objects_v2")

                for page in paginator.paginate(
                    Bucket=settings.s3_images_bucket,
                    Prefix=prefix,
                ):
                    count += len(page.get("Contents", []))

            except ClientError:
                return 0

            return count

        local_root = settings.data_directory / prefix
        if not local_root.exists():
            return 0

        return len([path for path in local_root.rglob("*") if path.is_file()])

    def bucket_exists(self, bucket_name: str) -> bool:
        if self.storage_backend != "s3":
            return True

        assert self.s3_client is not None

        try:
            self.s3_client.head_bucket(Bucket=bucket_name)
            return True
        except ClientError:
            return False

    def build_public_image_url(self, object_key: str | None) -> str | None:
        """
        Direct SeaweedFS/S3 URL.

        For the frontend, prefer backend image routes:
        /api/v1/images/raw/{frame_id}
        /api/v1/images/annotated/{frame_id}
        """
        if object_key is None:
            return None

        if self.storage_backend == "s3":
            endpoint = settings.s3_endpoint_url.rstrip("/")
            return f"{endpoint}/{settings.s3_images_bucket}/{object_key}"

        return str(settings.data_directory / object_key)


storage_service = StorageService()
