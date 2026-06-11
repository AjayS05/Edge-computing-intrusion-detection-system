#!/usr/bin/env python3
"""Capture JPEG frames on Raspberry Pi 4 and upload them to the Pi 5 backend."""

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


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_settings(config_path: Path) -> Settings:
    with config_path.open("r", encoding="utf-8") as handle:
        raw: dict[str, Any] = yaml.safe_load(handle)

    runtime_directory = Path(raw["runtime_directory"]).expanduser()
    retry_directory = runtime_directory / "retry_queue"
    state_file = runtime_directory / "state.json"

    return Settings(
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


def ensure_directories(settings: Settings) -> None:
    settings.runtime_directory.mkdir(parents=True, exist_ok=True)
    settings.retry_directory.mkdir(parents=True, exist_ok=True)


def read_sequence_number(settings: Settings) -> int:
    if not settings.state_file.exists():
        return 0

    try:
        with settings.state_file.open("r", encoding="utf-8") as handle:
            state = json.load(handle)
        return int(state.get("last_sequence_number", 0))
    except (OSError, ValueError, json.JSONDecodeError):
        LOGGER.warning("State file could not be read. Starting sequence from zero.")
        return 0


def save_sequence_number(settings: Settings, sequence_number: int) -> None:
    temporary_file = settings.state_file.with_suffix(".tmp")
    with temporary_file.open("w", encoding="utf-8") as handle:
        json.dump({"last_sequence_number": sequence_number}, handle)
    temporary_file.replace(settings.state_file)


def find_camera_command() -> str:
    for command in ("rpicam-still", "libcamera-still"):
        if shutil.which(command):
            return command

    raise RuntimeError(
        "No camera capture command found. Expected rpicam-still or libcamera-still."
    )


def capture_image(
    camera_command: str,
    settings: Settings,
    output_path: Path,
) -> None:
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
        raise RuntimeError("Camera capture produced no image data.")


def upload_image(
    settings: Settings,
    image_path: Path,
    metadata: dict[str, Any],
) -> bool:
    endpoint = f"{settings.backend_url}/api/v1/frames"

    try:
        with image_path.open("rb") as image_handle:
            response = requests.post(
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
        body = response.json()
        frame_id = body.get("frame", {}).get("frame_id", "unknown")
        LOGGER.info(
            "Uploaded sequence=%s frame_id=%s",
            metadata["sequence_number"],
            frame_id,
        )
        return True

    except (requests.RequestException, ValueError, OSError) as exc:
        LOGGER.warning(
            "Upload failed for sequence=%s: %s",
            metadata["sequence_number"],
            exc,
        )
        return False


def queue_failed_upload(
    settings: Settings,
    image_path: Path,
    metadata: dict[str, Any],
) -> None:
    queued_images = sorted(settings.retry_directory.glob("*.jpg"))
    if len(queued_images) >= settings.retry_queue_max_images:
        oldest_image = queued_images[0]
        oldest_metadata = oldest_image.with_suffix(".json")
        LOGGER.warning("Retry queue full. Removing oldest frame: %s", oldest_image.name)
        oldest_image.unlink(missing_ok=True)
        oldest_metadata.unlink(missing_ok=True)

    queue_name = (
        f"{metadata['sequence_number']:012d}_"
        f"{metadata['captured_at'].replace(':', '-').replace('.', '-')}_"
        f"{uuid4().hex[:8]}"
    )
    queued_image = settings.retry_directory / f"{queue_name}.jpg"
    queued_metadata = settings.retry_directory / f"{queue_name}.json"

    shutil.move(str(image_path), queued_image)
    with queued_metadata.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    LOGGER.info("Queued failed upload: %s", queued_image.name)


def retry_oldest_queued_upload(settings: Settings) -> None:
    queued_images = sorted(settings.retry_directory.glob("*.jpg"))
    if not queued_images:
        return

    queued_image = queued_images[0]
    queued_metadata = queued_image.with_suffix(".json")

    if not queued_metadata.exists():
        LOGGER.warning("Removing retry image without metadata: %s", queued_image.name)
        queued_image.unlink(missing_ok=True)
        return

    try:
        with queued_metadata.open("r", encoding="utf-8") as handle:
            metadata = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        LOGGER.warning("Removing unreadable retry record %s: %s", queued_image.name, exc)
        queued_image.unlink(missing_ok=True)
        queued_metadata.unlink(missing_ok=True)
        return

    LOGGER.info("Retrying queued sequence=%s", metadata["sequence_number"])
    if upload_image(settings, queued_image, metadata):
        queued_image.unlink(missing_ok=True)
        queued_metadata.unlink(missing_ok=True)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    config_path = Path(sys.argv[1] if len(sys.argv) > 1 else "config.yaml")
    settings = load_settings(config_path)
    ensure_directories(settings)

    camera_command = find_camera_command()
    LOGGER.info("Using camera command: %s", camera_command)
    LOGGER.info("Backend URL: %s", settings.backend_url)

    sequence_number = read_sequence_number(settings)

    while True:
        cycle_started = time.monotonic()
        retry_oldest_queued_upload(settings)

        sequence_number += 1
        save_sequence_number(settings, sequence_number)

        captured_at = utc_now_iso()
        image_path = settings.runtime_directory / f"current_{sequence_number:012d}.jpg"

        metadata = {
            "sensor_node_id": settings.sensor_node_id,
            "captured_at": captured_at,
            "sequence_number": sequence_number,
            "camera_location": settings.camera_location,
        }

        try:
            capture_image(camera_command, settings, image_path)
            if upload_image(settings, image_path, metadata):
                image_path.unlink(missing_ok=True)
            else:
                queue_failed_upload(settings, image_path, metadata)
        except (RuntimeError, subprocess.TimeoutExpired, OSError) as exc:
            LOGGER.error("Capture cycle failed: %s", exc)
            image_path.unlink(missing_ok=True)

        elapsed = time.monotonic() - cycle_started
        sleep_seconds = max(0.0, settings.capture_interval_seconds - elapsed)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
