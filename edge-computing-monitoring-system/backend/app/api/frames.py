from __future__ import annotations

import hashlib
import re
from typing import Optional

from fastapi import (
    APIRouter,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.services.frame_processing_service import (
    FrameProcessingInput,
    frame_processing_service,
)
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/frames", tags=["frames"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
}

CAPTURE_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")
SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
ALLOWED_UPLOAD_SOURCES = {"live", "retry", "manual"}


def _api_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _raw_image_api_url(
    request: Request,
    frame_id: str,
) -> str:
    return (
        f"{_api_base_url(request)}"
        f"/api/v1/images/raw/{frame_id}"
    )


def _annotated_image_api_url(
    request: Request,
    frame_id: str,
    annotated_image_key: str | None,
) -> str | None:
    if not annotated_image_key:
        return None

    return (
        f"{_api_base_url(request)}"
        f"/api/v1/images/annotated/{frame_id}"
    )


def _validate_upload(
    *,
    content_type: str | None,
    image_bytes: bytes,
) -> str:
    normalized_content_type = (
        content_type or "application/octet-stream"
    ).lower()

    if normalized_content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported file type: "
                f"{normalized_content_type}"
            ),
        )

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty",
        )

    if len(image_bytes) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=413,
            detail="Uploaded image is too large",
        )

    return normalized_content_type


def _normalize_upload_source(value: str | None) -> str:
    normalized = (value or "live").strip().lower()

    if normalized not in ALLOWED_UPLOAD_SOURCES:
        raise HTTPException(
            status_code=422,
            detail=(
                "upload_source must be one of: "
                "live, retry, manual"
            ),
        )

    return normalized


def _resolve_capture_id(
    *,
    capture_id: str | None,
    sensor_node_id: str,
    captured_at: str,
    sequence_number: int | None,
    image_sha256: str,
) -> str:
    if capture_id:
        normalized = capture_id.strip().lower()

        if not CAPTURE_ID_PATTERN.fullmatch(normalized):
            raise HTTPException(
                status_code=422,
                detail=(
                    "capture_id must contain exactly "
                    "32 lowercase hexadecimal characters"
                ),
            )

        return normalized

    # Backward-compatible deterministic ID for older clients that do not
    # yet send capture_id. Retrying the same image with the same metadata
    # resolves to the same frame ID.
    seed = (
        f"{sensor_node_id}\0"
        f"{captured_at}\0"
        f"{sequence_number}\0"
        f"{image_sha256}"
    ).encode("utf-8")

    return hashlib.sha256(seed).hexdigest()[:32]


@router.post("")
async def upload_frame(
    request: Request,
    image: UploadFile = File(...),
    sensor_node_id: str = Form(...),
    captured_at: str = Form(...),
    sequence_number: Optional[int] = Form(None),
    camera_location: Optional[str] = Form(None),
    capture_id: Optional[str] = Form(None),
    content_sha256: Optional[str] = Form(None),
    upload_source: str = Form("live"),
):
    image_bytes = await image.read()

    content_type = _validate_upload(
        content_type=image.content_type,
        image_bytes=image_bytes,
    )

    sensor_node_id = sensor_node_id.strip()
    captured_at = captured_at.strip()

    if not sensor_node_id:
        raise HTTPException(
            status_code=400,
            detail="sensor_node_id cannot be empty",
        )

    if not captured_at:
        raise HTTPException(
            status_code=400,
            detail="captured_at cannot be empty",
        )

    actual_sha256 = hashlib.sha256(image_bytes).hexdigest()

    if content_sha256:
        normalized_sha256 = content_sha256.strip().lower()

        if not SHA256_PATTERN.fullmatch(normalized_sha256):
            raise HTTPException(
                status_code=422,
                detail=(
                    "content_sha256 must contain exactly "
                    "64 lowercase hexadecimal characters"
                ),
            )

        if normalized_sha256 != actual_sha256:
            raise HTTPException(
                status_code=422,
                detail=(
                    "content_sha256 does not match the "
                    "uploaded image bytes"
                ),
            )

    resolved_capture_id = _resolve_capture_id(
        capture_id=capture_id,
        sensor_node_id=sensor_node_id,
        captured_at=captured_at,
        sequence_number=sequence_number,
        image_sha256=actual_sha256,
    )

    normalized_upload_source = _normalize_upload_source(
        upload_source
    )

    processing_input = FrameProcessingInput(
        image_bytes=image_bytes,
        content_type=content_type,
        sensor_node_id=sensor_node_id,
        captured_at=captured_at,
        sequence_number=sequence_number,
        camera_location=(
            camera_location.strip()
            if camera_location and camera_location.strip()
            else None
        ),
        api_base_url=_api_base_url(request),
        capture_id=resolved_capture_id,
        image_sha256=actual_sha256,
        upload_source=normalized_upload_source,
    )

    try:
        result = await run_in_threadpool(
            frame_processing_service.process,
            processing_input,
        )

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Inference model unavailable: {exc}",
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Frame processing failed: {exc}",
        ) from exc

    return {
        "message": (
            "Duplicate upload detected; existing result returned"
            if result.duplicate
            else "Frame uploaded and processed successfully"
        ),
        "duplicate": result.duplicate,
        "capture_id": resolved_capture_id,
        "frame": result.frame,
        "metadata_key": result.metadata_key,
        "metadata_uri": result.metadata_uri,
        "detection_key": result.detection_key,
        "detection_uri": result.detection_uri,
        "events": result.events,
        "alerts": result.alerts,
        "distribution": result.distribution,
    }


@router.get("/{frame_id}")
def get_frame(frame_id: str, request: Request):
    frame_key = storage_service.build_frame_metadata_key(
        frame_id
    )

    try:
        frame = storage_service.read_metadata_json(frame_key)

    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Frame not found: {frame_id}",
        ) from exc

    frame["frame_metadata_key"] = frame_key
    frame["raw_image_id"] = (
        frame.get("raw_image_id") or frame_id
    )

    frame["annotated_image_id"] = (
        frame.get("annotated_image_id")
        or (
            frame_id
            if frame.get("annotated_image_key")
            else None
        )
    )

    frame["raw_image_url"] = _raw_image_api_url(
        request,
        frame_id,
    )

    frame["annotated_image_url"] = (
        _annotated_image_api_url(
            request,
            frame_id,
            frame.get("annotated_image_key"),
        )
    )

    return frame


@router.get("/{frame_id}/annotation-check")
def get_annotation_check(
    frame_id: str,
    request: Request,
):
    frame_key = storage_service.build_frame_metadata_key(
        frame_id
    )

    try:
        frame = storage_service.read_metadata_json(frame_key)

    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Frame not found: {frame_id}",
        ) from exc

    annotated_image_key = frame.get(
        "annotated_image_key"
    )

    return {
        "frame_id": frame_id,
        "capture_id": frame.get("capture_id"),
        "detections_count": len(
            frame.get("detections", [])
        ),
        "raw_image_id": frame_id,
        "annotated_image_id": (
            frame_id if annotated_image_key else None
        ),
        "raw_image_key": frame.get("raw_image_key"),
        "annotated_image_key": annotated_image_key,
        "raw_image_url": _raw_image_api_url(
            request,
            frame_id,
        ),
        "annotated_image_url": (
            _annotated_image_api_url(
                request,
                frame_id,
                annotated_image_key,
            )
        ),
        "annotated_image_uri": frame.get(
            "annotated_image_uri"
        ),
        "annotation_check": frame.get(
            "annotation_check"
        ),
        "annotation_diff_pixels": frame.get(
            "annotation_diff_pixels"
        ),
        "distributed_processing": frame.get(
            "distributed_processing"
        ),
    }
