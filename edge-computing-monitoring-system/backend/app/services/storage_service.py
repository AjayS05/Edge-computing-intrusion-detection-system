from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import settings


class InvalidUploadError(ValueError):
    pass


class UploadTooLargeError(ValueError):
    pass


_SAFE_NODE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
_CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
}


class LocalFrameStorage:
    """Save incoming frames atomically on the Pi 5 local SSD or filesystem."""

    def __init__(self, raw_frames_directory: Path) -> None:
        self.raw_frames_directory = raw_frames_directory

    @staticmethod
    def validate_sensor_node_id(sensor_node_id: str) -> None:
        if not _SAFE_NODE_ID.fullmatch(sensor_node_id):
            raise InvalidUploadError(
                "sensor_node_id must contain only letters, numbers, '.', '_' or '-', "
                "start with a letter or number, and be at most 64 characters long"
            )

    async def save_upload(
        self,
        *,
        upload: UploadFile,
        sensor_node_id: str,
        captured_at: datetime,
    ) -> tuple[str, int]:
        self.validate_sensor_node_id(sensor_node_id)

        content_type = upload.content_type or ""
        extension = _CONTENT_TYPE_EXTENSIONS.get(content_type)
        if extension is None:
            raise InvalidUploadError("Only JPEG and PNG images are accepted")

        destination_directory = (
            self.raw_frames_directory
            / sensor_node_id
            / captured_at.strftime("%Y-%m-%d")
        )
        destination_directory.mkdir(parents=True, exist_ok=True)

        stored_filename = f"{captured_at.strftime('%H%M%S_%f')}_{uuid4().hex}{extension}"
        destination_path = destination_directory / stored_filename
        temporary_path = destination_path.with_suffix(destination_path.suffix + ".part")

        total_bytes = 0
        try:
            with temporary_path.open("wb") as output_file:
                while chunk := await upload.read(1024 * 1024):
                    total_bytes += len(chunk)
                    if total_bytes > settings.max_upload_bytes:
                        raise UploadTooLargeError(
                            f"Image exceeds the {settings.max_upload_bytes}-byte limit"
                        )
                    output_file.write(chunk)

            if total_bytes == 0:
                raise InvalidUploadError("Uploaded image is empty")

            os.replace(temporary_path, destination_path)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise
        finally:
            await upload.close()

        relative_path = destination_path.relative_to(settings.data_directory)
        return str(relative_path), total_bytes
