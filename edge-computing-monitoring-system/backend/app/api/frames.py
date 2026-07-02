from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.config import settings
from app.services.inference_service import inference_service
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

    detections = []
    events = []
    annotated_image_key = None
    annotated_image_uri = None
    annotation_check = "not_run"
    inference_latency_seconds = None
    annotation_diff_pixels = 0

    if settings.run_inference_on_upload:
        try:
            inference_result = inference_service.run_on_image_bytes(image_bytes)

            detections = inference_result.detections
            inference_latency_seconds = round(
                inference_result.inference_latency_seconds,
                4,
            )
            annotation_diff_pixels = inference_result.annotation_diff_pixels

            if inference_result.annotated_image_bytes is not None:
                annotated_image_key = storage_service.build_annotated_image_key(
                    sensor_node_id=sensor_node_id,
                    frame_id=frame_id,
                    extension="jpg",
                )

                annotated_image_uri = storage_service.upload_image_bytes(
                    image_bytes=inference_result.annotated_image_bytes,
                    object_key=annotated_image_key,
                    content_type="image/jpeg",
                )

                if annotation_diff_pixels > 0:
                    annotation_check = "passed"
                else:
                    annotation_check = "failed_no_visual_difference"
            else:
                annotation_check = "not_applicable_no_detections"

            for detection in detections:
                if detection["severity"] in {"critical", "high", "medium"}:
                    event_id = uuid4().hex
                    events.append(
                        {
                            "event_id": event_id,
                            "frame_id": frame_id,
                            "event_type": detection["class_name"],
                            "severity": detection["severity"],
                            "confidence": detection["confidence"],
                            "confidence_percent": detection["confidence_percent"],
                            "sensor_node_id": sensor_node_id,
                            "camera_location": camera_location,
                            "captured_at": captured_at,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "raw_image_key": raw_image_key,
                            "annotated_image_key": annotated_image_key,
                        }
                    )

        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Inference failed: {exc}",
            ) from exc

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
        "annotated_image_key": annotated_image_key,
        "annotated_image_uri": annotated_image_uri,
        "storage_backend": settings.storage_backend,
        "status": "processed" if settings.run_inference_on_upload else "stored",
        "detections": detections,
        "events": events,
        "inference_latency_seconds": inference_latency_seconds,
        "annotation_check": annotation_check,
        "annotation_diff_pixels": annotation_diff_pixels,
    }

    metadata_key = storage_service.build_frame_metadata_key(frame_id)
    metadata_uri = storage_service.upload_metadata_json(
        metadata=metadata,
        object_key=metadata_key,
    )

    detection_key = storage_service.build_detection_metadata_key(frame_id)
    detection_uri = storage_service.upload_metadata_json(
        metadata={
            "frame_id": frame_id,
            "detections": detections,
            "events": events,
            "annotation_check": annotation_check,
            "annotation_diff_pixels": annotation_diff_pixels,
            "annotated_image_key": annotated_image_key,
        },
        object_key=detection_key,
    )

    for event in events:
        event_key = storage_service.build_event_metadata_key(event["event_id"])
        storage_service.upload_metadata_json(
            metadata=event,
            object_key=event_key,
        )

    return {
        "message": "Frame uploaded and processed successfully",
        "frame": metadata,
        "metadata_key": metadata_key,
        "metadata_uri": metadata_uri,
        "detection_key": detection_key,
        "detection_uri": detection_uri,
    }

@router.get("/{frame_id}")
def get_frame(frame_id: str):
    frame_key = storage_service.build_frame_metadata_key(frame_id)

    try:
        frame = storage_service.read_metadata_json(frame_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Frame not found: {frame_id}",
        ) from exc

    frame["frame_metadata_key"] = frame_key
    frame["raw_image_url"] = storage_service.build_public_image_url(
        frame.get("raw_image_key")
    )
    frame["annotated_image_url"] = storage_service.build_public_image_url(
        frame.get("annotated_image_key")
    )

    return frame
