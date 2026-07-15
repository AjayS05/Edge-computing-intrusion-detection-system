from __future__ import annotations

import os
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.services.storage_service import storage_service


class StorageStatusService:
    """Build storage status data for the frontend."""

    def __init__(self) -> None:
        self._cache_lock = threading.Lock()
        self._cache_value: dict[str, Any] | None = None
        self._cache_created_at = 0.0
        self._cache_ttl_seconds = 10.0

    @staticmethod
    def _iso_timestamp(value: Any) -> str:
        if isinstance(value, datetime):
            timestamp = value

            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(
                    tzinfo=timezone.utc
                )

            return timestamp.isoformat()

        if value:
            return str(value)

        return datetime.now(
            timezone.utc
        ).isoformat()

    @staticmethod
    def _frame_id_from_key(key: str) -> str:
        name = Path(key).name

        for suffix in (
            "_annotated.jpg",
            "_annotated.jpeg",
            "_annotated.png",
            ".jpg",
            ".jpeg",
            ".png",
            ".json",
        ):
            if name.endswith(suffix):
                return name[: -len(suffix)]

        return name

    @staticmethod
    def _upload_type(
        *,
        bucket: str,
        key: str,
    ) -> str:
        if bucket == settings.s3_metadata_bucket:
            return "metadata"

        if key.startswith("annotated/"):
            return "annotated"

        return "raw"

    @staticmethod
    def _configured_total_gb() -> float:
        value = os.getenv(
            "STORAGE_TOTAL_GB",
            "458",
        )

        try:
            return max(float(value), 0.0)

        except ValueError:
            return 0.0

    @staticmethod
    def _replication_text() -> str:
        return os.getenv(
            "SEAWEEDFS_REPLICATION",
            "000 (single copy)",
        )

    def _list_s3_objects(
        self,
        bucket: str,
    ) -> list[dict[str, Any]]:
        if storage_service.s3_client is None:
            return []

        objects: list[dict[str, Any]] = []
        paginator = (
            storage_service.s3_client.get_paginator(
                "list_objects_v2"
            )
        )

        for page in paginator.paginate(
            Bucket=bucket
        ):
            for item in page.get(
                "Contents",
                [],
            ):
                objects.append(
                    {
                        "bucket": bucket,
                        "key": str(item["Key"]),
                        "size": int(
                            item.get("Size", 0)
                        ),
                        "last_modified": item.get(
                            "LastModified"
                        ),
                    }
                )

        return objects

    def _list_local_objects(
        self,
    ) -> list[dict[str, Any]]:
        root = settings.data_directory

        if not root.exists():
            return []

        objects: list[dict[str, Any]] = []

        for path in root.rglob("*"):
            if not path.is_file():
                continue

            objects.append(
                {
                    "bucket": "local",
                    "key": str(
                        path.relative_to(root)
                    ),
                    "size": path.stat().st_size,
                    "last_modified": (
                        datetime.fromtimestamp(
                            path.stat().st_mtime,
                            tz=timezone.utc,
                        )
                    ),
                }
            )

        return objects

    def _disk_capacity(
        self,
        object_used_bytes: int,
    ) -> tuple[float, float, float]:
        configured_path = os.getenv(
            "STORAGE_MOUNT_PATH",
            "",
        ).strip()

        candidates = [
            Path(configured_path)
            if configured_path
            else None,
            Path("/srv/nfs"),
            settings.data_directory,
        ]

        for candidate in candidates:
            if (
                candidate is None
                or not candidate.exists()
            ):
                continue

            try:
                usage = shutil.disk_usage(candidate)
            except OSError:
                continue

            used_gb = round(
                usage.used / (1024**3),
                3,
            )
            total_gb = round(
                usage.total / (1024**3),
                3,
            )
            usage_percent = round(
                (
                    usage.used
                    / max(usage.total, 1)
                )
                * 100,
                2,
            )

            return (
                used_gb,
                total_gb,
                usage_percent,
            )

        object_used_gb = round(
            object_used_bytes / (1024**3),
            3,
        )

        total_gb = self._configured_total_gb()

        usage_percent = (
            round(
                object_used_gb
                / total_gb
                * 100,
                2,
            )
            if total_gb > 0
            else 0.0
        )

        return (
            object_used_gb,
            total_gb,
            usage_percent,
        )

    def _build_status(self) -> dict[str, Any]:
        storage_backend = (
            settings.storage_backend.lower()
        )

        if storage_backend == "s3":
            image_bucket_online = (
                storage_service.bucket_exists(
                    settings.s3_images_bucket
                )
            )

            metadata_bucket_online = (
                storage_service.bucket_exists(
                    settings.s3_metadata_bucket
                )
            )

            objects: list[dict[str, Any]] = []

            if image_bucket_online:
                objects.extend(
                    self._list_s3_objects(
                        settings.s3_images_bucket
                    )
                )

            if metadata_bucket_online:
                objects.extend(
                    self._list_s3_objects(
                        settings.s3_metadata_bucket
                    )
                )

        else:
            image_bucket_online = True
            metadata_bucket_online = True
            objects = self._list_local_objects()

        raw_objects = [
            item
            for item in objects
            if item["key"].startswith("raw/")
        ]

        annotated_objects = [
            item
            for item in objects
            if item["key"].startswith(
                "annotated/"
            )
        ]

        metadata_objects = [
            item
            for item in objects
            if item["key"].endswith(".json")
        ]

        object_used_bytes = sum(
            int(item.get("size", 0))
            for item in objects
        )

        used_gb, total_gb, usage_percent = (
            self._disk_capacity(
                object_used_bytes
            )
        )

        ordered_objects = sorted(
            objects,
            key=lambda item: (
                item.get("last_modified")
                or datetime.min.replace(
                    tzinfo=timezone.utc
                )
            ),
            reverse=True,
        )

        recent_uploads = [
            {
                "id": self._frame_id_from_key(
                    item["key"]
                ),
                "filename": Path(
                    item["key"]
                ).name,
                "path": (
                    f"{item['bucket']}/"
                    f"{item['key']}"
                ),
                "uploaded_at": (
                    self._iso_timestamp(
                        item.get("last_modified")
                    )
                ),
                "type": self._upload_type(
                    bucket=item["bucket"],
                    key=item["key"],
                ),
            }
            for item in ordered_objects[:20]
        ]

        last_upload = (
            recent_uploads[0]["uploaded_at"]
            if recent_uploads
            else None
        )

        storage_online = (
            image_bucket_online
            and metadata_bucket_online
        )

        status = (
            "online"
            if storage_online
            else "offline"
        )

        if (
            storage_online
            and usage_percent >= 90
        ):
            status = "warning"

        health = [
            {
                "name": "SeaweedFS S3 gateway",
                "status": (
                    "online"
                    if storage_online
                    else "offline"
                ),
                "value": (
                    settings.s3_endpoint_url
                    if storage_backend == "s3"
                    else str(
                        settings.data_directory
                    )
                ),
            },
            {
                "name": "Image bucket",
                "status": (
                    "online"
                    if image_bucket_online
                    else "offline"
                ),
                "value": (
                    settings.s3_images_bucket
                    if storage_backend == "s3"
                    else "local/raw + annotated"
                ),
            },
            {
                "name": "Metadata bucket",
                "status": (
                    "online"
                    if metadata_bucket_online
                    else "offline"
                ),
                "value": (
                    settings.s3_metadata_bucket
                    if storage_backend == "s3"
                    else "local metadata"
                ),
            },
            {
                "name": "Storage capacity",
                "status": (
                    "warning"
                    if usage_percent >= 90
                    else "online"
                ),
                "value": (
                    f"{used_gb:.3f} GB / "
                    f"{total_gb:.3f} GB"
                ),
            },
        ]

        return {
            "provider": (
                "SeaweedFS"
                if storage_backend == "s3"
                else "Local filesystem"
            ),
            "compatibility": (
                "S3-compatible"
                if storage_backend == "s3"
                else "POSIX filesystem"
            ),
            "bucket": (
                f"{settings.s3_images_bucket} + "
                f"{settings.s3_metadata_bucket}"
                if storage_backend == "s3"
                else str(settings.data_directory)
            ),
            "raw_images": len(raw_objects),
            "annotated_images": len(
                annotated_objects
            ),
            "metadata_records": len(
                metadata_objects
            ),
            "used_gb": used_gb,
            "total_gb": total_gb,
            "usage_percent": usage_percent,
            "status": status,
            "last_upload": last_upload,
            "replication": (
                self._replication_text()
                if storage_backend == "s3"
                else "local"
            ),
            # A reliable throughput metric requires Prometheus or
            # application-side counters. Do not invent a value.
            "upload_throughput_mbps": 0.0,
            "health": health,
            "recent_uploads": recent_uploads,
        }

    def get_status(
        self,
        *,
        refresh: bool = False,
    ) -> dict[str, Any]:
        now = time.monotonic()

        with self._cache_lock:
            cache_is_fresh = (
                self._cache_value is not None
                and (
                    now - self._cache_created_at
                    < self._cache_ttl_seconds
                )
            )

            if cache_is_fresh and not refresh:
                return dict(self._cache_value)

            status = self._build_status()
            self._cache_value = status
            self._cache_created_at = now

            return dict(status)


storage_status_service = StorageStatusService()
