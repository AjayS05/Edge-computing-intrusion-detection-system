#!/usr/bin/env python3
"""Capture JPEG frames on Raspberry Pi 4 and upload them to the backend."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import requests
import yaml

LOGGER = logging.getLogger("camera_sender")


@dataclass(frozen=True)
class Settings:
    backend_url: str
    sensor_node_id: str
    camera_location: str
    capture_interval_seconds: float
    width: int
    height: int
    jpeg_quality: int
    request_timeout_seconds: float
    retry_queue_max_images: int
    runtime_directory: Path
    retry_directory: Path
    state_file: Path


@dataclass(frozen=True)
class UploadResult:
    success: bool
    status_code: int | None = None
    frame_id: str | None = None
    error: str | None = None


def utc_now_iso() -> str:
    """Return the current UTC time in ISO 8601 format."""

    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_settings(settings: Settings) -> None:
    """Validate configuration values before starting the sender."""

    if not settings.backend_url.startswith(("http://", "https://")):
        raise ValueError("backend_url must start with http:// or https://")

    if not settings.sensor_node_id.strip():
        raise ValueError("sensor_node_id cannot be empty")

    if settings.capture_interval_seconds <= 0:
        raise ValueError("capture_interval_seconds must be greater than zero")

    if settings.width <= 0 or settings.height <= 0:
        raise ValueError("width and height must be greater than zero")

    if not 1 <= settings.jpeg_quality <= 100:
        raise ValueError("jpeg_quality must be between 1 and 100")

    if settings.request_timeout_seconds <= 0:
        raise ValueError("request_timeout_seconds must be greater than zero")

    if settings.retry_queue_max_images < 1:
        raise ValueError("retry_queue_max_images must be at least 1")


def load_settings(config_path: Path) -> Settings:
    """Load and validate sender configuration from YAML."""

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)

    if not isinstance(raw, dict):
        raise ValueError("Configuration file must contain a YAML mapping")

    required_keys = {
        "backend_url",
        "sensor_node_id",
        "camera_location",
        "capture_interval_seconds",
        "width",
        "height",
        "jpeg_quality",
        "request_timeout_seconds",
        "retry_queue_max_images",
        "runtime_directory",
    }

    missing_keys = sorted(required_keys - raw.keys())
    if missing_keys:
        raise ValueError(
            f"Missing configuration keys: {', '.join(missing_keys)}"
        )

    runtime_directory = Path(str(raw["runtime_directory"])).expanduser()
    retry_directory = runtime_directory / "retry_queue"
    state_file = runtime_directory / "state.json"

    settings = Settings(
        backend_url=str(raw["backend_url"]).rstrip("/"),
        sensor_node_id=str(raw["sensor_node_id"]),
        camera_location=str(raw["camera_location"]),
        capture_interval_seconds=float(raw["capture_interval_seconds"]),
        width=int(raw["width"]),
        height=int(raw["height"]),
        jpeg_quality=int(raw["jpeg_quality"]),
        request_timeout_seconds=float(raw["request_timeout_seconds"]),
        retry_queue_max_images=int(raw["retry_queue_max_images"]),
        runtime_directory=runtime_directory,
        retry_directory=retry_directory,
        state_file=state_file,
    )

    validate_settings(settings)
    return settings


def ensure_directories(settings: Settings) -> None:
    """Create runtime directories if they do not exist."""

    settings.runtime_directory.mkdir(parents=True, exist_ok=True)
    settings.retry_directory.mkdir(parents=True, exist_ok=True)


def read_sequence_number(settings: Settings) -> int:
    """Read the last persisted sequence number."""

    if not settings.state_file.exists():
        return 0

    try:
        with settings.state_file.open("r", encoding="utf-8") as handle:
            state = json.load(handle)

        return int(state.get("last_sequence_number", 0))

    except (OSError, ValueError, json.JSONDecodeError) as exc:
        LOGGER.warning(
            "State file could not be read. Starting at zero: %s",
            exc,
        )
        return 0


def save_sequence_number(
    settings: Settings,
    sequence_number: int,
) -> None:
    """Persist the sequence number atomically."""

    temporary_file = settings.state_file.with_suffix(".tmp")

    with temporary_file.open("w", encoding="utf-8") as handle:
        json.dump(
            {"last_sequence_number": sequence_number},
            handle,
            indent=2,
        )

    temporary_file.replace(settings.state_file)


def find_camera_command() -> str:
    """Find the supported Raspberry Pi camera command."""

    for command in ("rpicam-still", "libcamera-still"):
        if shutil.which(command):
            return command

    raise RuntimeError(
        "No camera command found. Expected rpicam-still or libcamera-still."
    )


def capture_image(
    camera_command: str,
    settings: Settings,
    output_path: Path,
) -> None:
    """Capture one JPEG frame."""

    command = [
        camera_command,
        "--nopreview",
        "--immediate",
        "--width",
        str(settings.width),
        "--height",
        str(settings.height),
        "--quality",
        str(settings.jpeg_quality),
        "--output",
        str(output_path),
    ]

    LOGGER.info("Capturing frame: %s", output_path.name)

    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )

    if completed.returncode != 0:
        error_text = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"Camera capture failed: {error_text}")

    if not output_path.exists() or output_path.stat().st_size == 0:
        raise RuntimeError("Camera capture produced no image data")


def upload_image(
    session: requests.Session,
    settings: Settings,
    image_path: Path,
    metadata: dict[str, Any],
) -> UploadResult:
    """Upload one image and its metadata to the backend."""

    endpoint = f"{settings.backend_url}/api/v1/frames"

    try:
        with image_path.open("rb") as image_handle:
            response = session.post(
                endpoint,
                files={
                    "image": (
                        image_path.name,
                        image_handle,
                        "image/jpeg",
                    )
                },
                data={
                    "sensor_node_id": metadata["sensor_node_id"],
                    "captured_at": metadata["captured_at"],
                    "sequence_number": str(metadata["sequence_number"]),
                    "camera_location": metadata["camera_location"],
                },
                timeout=settings.request_timeout_seconds,
            )

        response.raise_for_status()

        try:
            body = response.json()
        except requests.JSONDecodeError:
            body = {}

        frame_id = body.get("frame", {}).get("frame_id")

        LOGGER.info(
            "Uploaded sequence=%s frame_id=%s status=%s",
            metadata["sequence_number"],
            frame_id or "unknown",
            response.status_code,
        )

        return UploadResult(
            success=True,
            status_code=response.status_code,
            frame_id=frame_id,
        )

    except requests.HTTPError as exc:
        status_code = (
            exc.response.status_code
            if exc.response is not None
            else None
        )

        response_text = (
            exc.response.text[:500]
            if exc.response is not None
            else str(exc)
        )

        error = f"HTTP {status_code}: {response_text}"

    except requests.RequestException as exc:
        status_code = None
        error = str(exc)

    except OSError as exc:
        status_code = None
        error = str(exc)

    LOGGER.warning(
        "Upload failed for sequence=%s: %s",
        metadata["sequence_number"],
        error,
    )

    return UploadResult(
        success=False,
        status_code=status_code,
        error=error,
    )


def queue_failed_upload(
    settings: Settings,
    image_path: Path,
    metadata: dict[str, Any],
) -> None:
    """Move a failed upload into the bounded retry queue."""

    queued_images = sorted(settings.retry_directory.glob("*.jpg"))

    while len(queued_images) >= settings.retry_queue_max_images:
        oldest_image = queued_images.pop(0)
        oldest_metadata = oldest_image.with_suffix(".json")

        LOGGER.warning(
            "Retry queue full. Removing oldest frame: %s",
            oldest_image.name,
        )

        oldest_image.unlink(missing_ok=True)
        oldest_metadata.unlink(missing_ok=True)

    safe_timestamp = (
        str(metadata["captured_at"])
        .replace(":", "-")
        .replace(".", "-")
    )

    queue_name = (
        f"{int(metadata['sequence_number']):012d}_"
        f"{safe_timestamp}_"
        f"{uuid4().hex[:8]}"
    )

    queued_image = settings.retry_directory / f"{queue_name}.jpg"
    queued_metadata = settings.retry_directory / f"{queue_name}.json"

    shutil.move(str(image_path), str(queued_image))

    with queued_metadata.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    LOGGER.info("Queued failed upload: %s", queued_image.name)


def retry_oldest_queued_upload(
    session: requests.Session,
    settings: Settings,
) -> None:
    """Retry one queued upload per capture cycle."""

    queued_images = sorted(settings.retry_directory.glob("*.jpg"))
    if not queued_images:
        return

    queued_image = queued_images[0]
    queued_metadata = queued_image.with_suffix(".json")

    if not queued_metadata.exists():
        LOGGER.warning(
            "Removing retry image without metadata: %s",
            queued_image.name,
        )
        queued_image.unlink(missing_ok=True)
        return

    try:
        with queued_metadata.open("r", encoding="utf-8") as handle:
            metadata = json.load(handle)

    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning(
            "Removing unreadable retry record %s: %s",
            queued_image.name,
            exc,
        )
        queued_image.unlink(missing_ok=True)
        queued_metadata.unlink(missing_ok=True)
        return

    LOGGER.info(
        "Retrying queued sequence=%s",
        metadata.get("sequence_number", "unknown"),
    )

    result = upload_image(
        session=session,
        settings=settings,
        image_path=queued_image,
        metadata=metadata,
    )

    if result.success:
        queued_image.unlink(missing_ok=True)
        queued_metadata.unlink(missing_ok=True)


def run_capture_cycle(
    session: requests.Session,
    camera_command: str,
    settings: Settings,
    sequence_number: int,
) -> None:
    """Capture and upload one new frame."""

    captured_at = utc_now_iso()

    image_path = (
        settings.runtime_directory
        / f"current_{sequence_number:012d}.jpg"
    )

    metadata: dict[str, Any] = {
        "sensor_node_id": settings.sensor_node_id,
        "captured_at": captured_at,
        "sequence_number": sequence_number,
        "camera_location": settings.camera_location,
    }

    try:
        capture_image(
            camera_command=camera_command,
            settings=settings,
            output_path=image_path,
        )

        result = upload_image(
            session=session,
            settings=settings,
            image_path=image_path,
            metadata=metadata,
        )

        if result.success:
            image_path.unlink(missing_ok=True)
        else:
            queue_failed_upload(
                settings=settings,
                image_path=image_path,
                metadata=metadata,
            )

    except (RuntimeError, subprocess.TimeoutExpired, OSError) as exc:
        LOGGER.error("Capture cycle failed: %s", exc)
        image_path.unlink(missing_ok=True)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    config_path = Path(
        sys.argv[1] if len(sys.argv) > 1 else "config.yaml"
    )

    try:
        settings = load_settings(config_path)
        ensure_directories(settings)

        camera_command = find_camera_command()

    except (OSError, ValueError, RuntimeError) as exc:
        LOGGER.error("Startup failed: %s", exc)
        return 1

    LOGGER.info("Using camera command: %s", camera_command)
    LOGGER.info("Backend URL: %s", settings.backend_url)
    LOGGER.info("Sensor node: %s", settings.sensor_node_id)
    LOGGER.info(
        "Capture size: %sx%s",
        settings.width,
        settings.height,
    )

    sequence_number = read_sequence_number(settings)

    with requests.Session() as session:
        try:
            while True:
                cycle_started = time.monotonic()

                retry_oldest_queued_upload(
                    session=session,
                    settings=settings,
                )

                sequence_number += 1
                save_sequence_number(settings, sequence_number)

                run_capture_cycle(
                    session=session,
                    camera_command=camera_command,
                    settings=settings,
                    sequence_number=sequence_number,
                )

                elapsed = time.monotonic() - cycle_started
                sleep_seconds = max(
                    0.0,
                    settings.capture_interval_seconds - elapsed,
                )

                time.sleep(sleep_seconds)

        except KeyboardInterrupt:
            LOGGER.info("Camera sender stopped by user")
            return 0


if __name__ == "__main__":
    raise SystemExit(main())
