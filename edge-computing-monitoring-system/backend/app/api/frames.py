from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.core.config import settings
from app.metrics.prometheus_metrics import (
    FRAME_UPLOAD_BYTES,
    FRAME_UPLOAD_FAILURES_TOTAL,
    FRAME_UPLOAD_PROCESSING_SECONDS,
    FRAMES_UPLOADED_TOTAL,
)
from app.models.frame import FrameResponse, FrameUploadResponse
from app.services.frame_repository import FrameRepository
from app.services.storage_service import (
    InvalidUploadError,
    LocalFrameStorage,
    UploadTooLargeError,
)

router = APIRouter(prefix="/api/v1/frames", tags=["frames"])
storage = LocalFrameStorage(settings.raw_frames_directory)
repository = FrameRepository(settings.database_path)


def _parse_captured_at(value: str) -> datetime:
    try:
        captured_at = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="captured_at must be an ISO-8601 datetime, such as 2026-06-11T14:30:15Z",
        ) from exc

    if captured_at.tzinfo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="captured_at must include a timezone, such as Z or +00:00",
        )

    return captured_at.astimezone(timezone.utc)


@router.post("", response_model=FrameUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_frame(
    image: UploadFile = File(...),
    sensor_node_id: str = Form(...),
    captured_at: str = Form(...),
    sequence_number: int | None = Form(default=None),
    camera_location: str | None = Form(default=None),
) -> FrameUploadResponse:
    parsed_captured_at = _parse_captured_at(captured_at)
    received_at = datetime.now(timezone.utc)

    with FRAME_UPLOAD_PROCESSING_SECONDS.time():
        try:
            stored_filename, size_bytes = await storage.save_upload(
                upload=image,
                sensor_node_id=sensor_node_id,
                captured_at=parsed_captured_at,
            )
        except UploadTooLargeError as exc:
            FRAME_UPLOAD_FAILURES_TOTAL.labels(reason="too_large").inc()
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=str(exc),
            ) from exc
        except InvalidUploadError as exc:
            FRAME_UPLOAD_FAILURES_TOTAL.labels(reason="invalid_upload").inc()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        except OSError as exc:
            FRAME_UPLOAD_FAILURES_TOTAL.labels(reason="storage_error").inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to store uploaded image",
            ) from exc

        frame = FrameResponse(
            frame_id=str(uuid4()),
            sensor_node_id=sensor_node_id,
            sequence_number=sequence_number,
            camera_location=camera_location,
            captured_at=parsed_captured_at,
            received_at=received_at,
            status="received",
            content_type=image.content_type or "application/octet-stream",
            size_bytes=size_bytes,
            stored_filename=stored_filename,
        )

        try:
            repository.create(frame)
        except Exception as exc:
            FRAME_UPLOAD_FAILURES_TOTAL.labels(reason="database_error").inc()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Image was stored but metadata could not be recorded",
            ) from exc

    FRAMES_UPLOADED_TOTAL.labels(sensor_node_id=sensor_node_id).inc()
    FRAME_UPLOAD_BYTES.observe(size_bytes)
    return FrameUploadResponse(frame=frame)


@router.get("/{frame_id}", response_model=FrameResponse)
def get_frame(frame_id: str) -> FrameResponse:
    frame = repository.get_by_id(frame_id)
    if frame is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")
    return frame
