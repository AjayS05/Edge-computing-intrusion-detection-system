from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import boto3
from botocore import UNSIGNED
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings


LOGGER = logging.getLogger("storage_service")


class StorageService:
    def __init__(self) -> None:
        self.storage_backend = settings.storage_backend.lower()

        if self.storage_backend == "s3":
            if settings.s3_unsigned_requests:
                boto_config = Config(
                    signature_version=UNSIGNED,
                    s3={"addressing_style": "path"},
                )
            else:
                boto_config = Config(
                    s3={"addressing_style": "path"},
                )

            client_arguments: dict[str, Any] = {
                "service_name": "s3",
                "endpoint_url": settings.s3_endpoint_url,
                "config": boto_config,
            }

            if not settings.s3_unsigned_requests:
                client_arguments.update(
                    {
                        "aws_access_key_id": (
                            settings.s3_access_key_id
                        ),
                        "aws_secret_access_key": (
                            settings.s3_secret_access_key
                        ),
                    }
                )

            self.s3_client = boto3.client(
                **client_arguments
            )
        else:
            self.s3_client = None
            settings.data_directory.mkdir(
                parents=True,
                exist_ok=True,
            )

    @staticmethod
    def generate_frame_id() -> str:
        return uuid4().hex

    @staticmethod
    def generate_alert_id() -> str:
        return uuid4().hex

    @staticmethod
    def today_utc() -> str:
        return datetime.now(
            timezone.utc
        ).strftime("%Y-%m-%d")

    def build_raw_image_key(
        self,
        sensor_node_id: str,
        frame_id: str,
        extension: str = "jpg",
    ) -> str:
        return (
            f"raw/{sensor_node_id}/{self.today_utc()}/"
            f"{frame_id}.{extension}"
        )

    def build_annotated_image_key(
        self,
        sensor_node_id: str,
        frame_id: str,
        extension: str = "jpg",
    ) -> str:
        return (
            f"annotated/{sensor_node_id}/{self.today_utc()}/"
            f"{frame_id}_annotated.{extension}"
        )

    @staticmethod
    def build_frame_metadata_key(
        frame_id: str,
    ) -> str:
        return f"frames/{frame_id}.json"

    @staticmethod
    def build_detection_metadata_key(
        frame_id: str,
    ) -> str:
        return f"detections/{frame_id}.json"

    @staticmethod
    def build_event_metadata_key(
        event_id: str,
    ) -> str:
        return f"events/{event_id}.json"

    @staticmethod
    def build_alert_metadata_key(
        alert_id: str,
    ) -> str:
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

            return (
                f"s3://{settings.s3_images_bucket}/"
                f"{object_key}"
            )

        local_path = settings.data_directory / object_key
        local_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        local_path.write_bytes(image_bytes)
        return str(local_path)

    def upload_metadata_json(
        self,
        *,
        metadata: dict[str, Any],
        object_key: str,
    ) -> str:
        body = json.dumps(
            metadata,
            indent=2,
            default=str,
        ).encode("utf-8")

        if self.storage_backend == "s3":
            assert self.s3_client is not None

            self.s3_client.put_object(
                Bucket=settings.s3_metadata_bucket,
                Key=object_key,
                Body=body,
                ContentType="application/json",
            )

            return (
                f"s3://{settings.s3_metadata_bucket}/"
                f"{object_key}"
            )

        local_path = settings.data_directory / object_key
        local_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        local_path.write_bytes(body)
        return str(local_path)

    def read_metadata_json(
        self,
        object_key: str,
    ) -> dict[str, Any]:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            response = self.s3_client.get_object(
                Bucket=settings.s3_metadata_bucket,
                Key=object_key,
            )
            return json.loads(
                response["Body"].read().decode("utf-8")
            )

        local_path = settings.data_directory / object_key
        return json.loads(
            local_path.read_text(encoding="utf-8")
        )

    def download_image_bytes(
        self,
        object_key: str,
    ) -> bytes:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            response = self.s3_client.get_object(
                Bucket=settings.s3_images_bucket,
                Key=object_key,
            )
            return response["Body"].read()

        local_path = settings.data_directory / object_key
        return local_path.read_bytes()

    def list_metadata_objects(
        self,
        prefix: str,
    ) -> list[dict[str, Any]]:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            objects: list[dict[str, Any]] = []

            try:
                paginator = self.s3_client.get_paginator(
                    "list_objects_v2"
                )

                for page in paginator.paginate(
                    Bucket=settings.s3_metadata_bucket,
                    Prefix=prefix,
                ):
                    for item in page.get("Contents", []):
                        objects.append(
                            {
                                "key": item["Key"],
                                "last_modified": item.get(
                                    "LastModified"
                                ),
                                "size": item.get("Size", 0),
                            }
                        )

            except ClientError as exc:
                error_code = str(
                    exc.response.get("Error", {}).get(
                        "Code",
                        "",
                    )
                )

                if error_code in {
                    "NoSuchBucket",
                    "404",
                    "NotFound",
                }:
                    return []

                LOGGER.warning(
                    "Could not list metadata prefix %s: %s",
                    prefix,
                    exc,
                )
                return []

            return sorted(
                objects,
                key=lambda item: (
                    item.get("last_modified")
                    or datetime.min.replace(
                        tzinfo=timezone.utc
                    )
                ),
                reverse=True,
            )

        local_root = settings.data_directory / prefix

        if not local_root.exists():
            return []

        objects: list[dict[str, Any]] = []

        for path in local_root.rglob("*.json"):
            objects.append(
                {
                    "key": str(
                        path.relative_to(
                            settings.data_directory
                        )
                    ),
                    "last_modified": datetime.fromtimestamp(
                        path.stat().st_mtime,
                        tz=timezone.utc,
                    ),
                    "size": path.stat().st_size,
                }
            )

        return sorted(
            objects,
            key=lambda item: (
                item.get("last_modified")
                or datetime.min.replace(
                    tzinfo=timezone.utc
                )
            ),
            reverse=True,
        )

    def list_metadata_keys(
        self,
        prefix: str,
    ) -> list[str]:
        return [
            item["key"]
            for item in self.list_metadata_objects(prefix)
        ]

    def count_metadata_objects(
        self,
        prefix: str,
    ) -> int:
        return len(self.list_metadata_objects(prefix))

    def count_image_objects(
        self,
        prefix: str,
    ) -> int:
        if self.storage_backend == "s3":
            assert self.s3_client is not None

            count = 0

            try:
                paginator = self.s3_client.get_paginator(
                    "list_objects_v2"
                )

                for page in paginator.paginate(
                    Bucket=settings.s3_images_bucket,
                    Prefix=prefix,
                ):
                    count += len(page.get("Contents", []))

            except ClientError as exc:
                LOGGER.warning(
                    "Could not count image prefix %s: %s",
                    prefix,
                    exc,
                )
                return 0

            return count

        local_root = settings.data_directory / prefix

        if not local_root.exists():
            return 0

        return len(
            [
                path
                for path in local_root.rglob("*")
                if path.is_file()
            ]
        )

    def bucket_exists(
        self,
        bucket_name: str,
    ) -> bool:
        if self.storage_backend != "s3":
            return True

        assert self.s3_client is not None

        try:
            self.s3_client.head_bucket(Bucket=bucket_name)
            return True
        except ClientError as exc:
            error_code = str(
                exc.response.get("Error", {}).get(
                    "Code",
                    "",
                )
            )

            if error_code in {
                "404",
                "NoSuchBucket",
                "NotFound",
            }:
                return False

            raise

    def ensure_buckets(self) -> None:
        if self.storage_backend != "s3":
            return

        assert self.s3_client is not None

        required_buckets = (
            settings.s3_images_bucket,
            settings.s3_metadata_bucket,
        )

        for bucket_name in required_buckets:
            if self.bucket_exists(bucket_name):
                continue

            try:
                self.s3_client.create_bucket(
                    Bucket=bucket_name
                )
            except ClientError as exc:
                error_code = str(
                    exc.response.get("Error", {}).get(
                        "Code",
                        "",
                    )
                )

                if error_code not in {
                    "BucketAlreadyExists",
                    "BucketAlreadyOwnedByYou",
                }:
                    raise RuntimeError(
                        f"Could not create storage bucket "
                        f"'{bucket_name}': "
                        f"{error_code or exc}"
                    ) from exc

    def build_public_image_url(
        self,
        object_key: str | None,
    ) -> str | None:
        if object_key is None:
            return None

        if self.storage_backend == "s3":
            endpoint = settings.s3_endpoint_url.rstrip("/")
            return (
                f"{endpoint}/{settings.s3_images_bucket}/"
                f"{object_key}"
            )

        return str(settings.data_directory / object_key)


storage_service = StorageService()
