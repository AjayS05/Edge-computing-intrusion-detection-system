from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.config import settings
from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/frames", tags=["frames"])


@router.post("")
async def upload_frame(
    image: UploadFile = File(...),
    sensor_node_id: str = Form(...),
    captured_at: str = Form(...),
    sequence_number: Optional[int] = Form(None),
    camera_location: Optional[str] = Form(None),
):
    if image.content_type not in {"image/jpeg", "image/jpg", "image/png"}:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {image.content_type}",
        )

    image_bytes = await image.read()

    if len(image_bytes) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=413,
            detail="Uploaded image is too large",
        )

    frame_id = storage_service.generate_frame_id()

    extension = "png" if image.content_type == "image/png" else "jpg"
    raw_image_key = storage_service.build_raw_image_key(
        sensor_node_id=sensor_node_id,
        frame_id=frame_id,
        extension=extension,
    )

    raw_image_uri = storage_service.upload_image_bytes(
        image_bytes=image_bytes,
        object_key=raw_image_key,
        content_type=image.content_type or "image/jpeg",
    )

    metadata = {
        "frame_id": frame_id,
        "sensor_node_id": sensor_node_id,
        "captured_at": captured_at,
        "received_at": datetime.now(timezone.utc).isoformat(),
        "sequence_number": sequence_number,
        "camera_location": camera_location,
        "content_type": image.content_type,
        "size_bytes": len(image_bytes),
        "raw_image_key": raw_image_key,
        "raw_image_uri": raw_image_uri,
        "storage_backend": settings.storage_backend,
        "status": "stored",
    }

    metadata_key = storage_service.build_frame_metadata_key(frame_id)
    metadata_uri = storage_service.upload_metadata_json(
        metadata=metadata,
        object_key=metadata_key,
    )

    return {
        "message": "Frame uploaded and stored successfully",
        "frame": metadata,
        "metadata_key": metadata_key,
        "metadata_uri": metadata_uri,
    }
