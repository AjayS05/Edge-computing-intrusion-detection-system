from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.core.config import settings
from app.services.alert_service import alert_service
from app.services.storage_service import storage_service
from app.services.telegram_service import telegram_service

router = APIRouter(prefix="/api/v1/frames", tags=["frames"])


def _api_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _raw_image_api_url(request: Request, frame_id: str) -> str:
    return f"{_api_base_url(request)}/api/v1/images/raw/{frame_id}"


def _annotated_image_api_url(
    request: Request,
    frame_id: str,
    annotated_image_key: str | None,
) -> str | None:
    if not annotated_image_key:
        return None

    return f"{_api_base_url(request)}/api/v1/images/annotated/{frame_id}"


@router.post("")
async def upload_frame(
    request: Request,
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
    received_at = datetime.now(timezone.utc).isoformat()

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

    detections: list[dict] = []
    events: list[dict] = []
    alerts: list[dict] = []

    annotated_image_key = None
    annotated_image_uri = None
    annotation_check = "not_run"
    inference_latency_seconds = None
    annotation_diff_pixels = 0

    if settings.run_inference_on_upload:
        try:
            # Lazy import:
            # Prevents the lightweight Kubernetes backend from importing cv2/YOLO
            # when RUN_INFERENCE_ON_UPLOAD=false.
            from app.services.inference_service import inference_service

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
                event_id = uuid4().hex
                created_at = datetime.now(timezone.utc).isoformat()

                event = {
                    "event_id": event_id,
                    "frame_id": frame_id,
                    "timestamp": created_at,
                    "created_at": created_at,
                    "captured_at": captured_at,
                    "received_at": received_at,
                    "event_type": detection.get("class_name", "unknown"),
                    "severity": detection.get("severity", "unknown"),
                    "confidence": detection.get("confidence"),
                    "confidence_percent": detection.get("confidence_percent"),
                    "node_name": sensor_node_id,
                    "sensor_node_id": sensor_node_id,
                    "camera_location": camera_location,
                    "detection": detection,
                    "detections": [detection],
                    "raw_image_id": frame_id,
                    "annotated_image_id": frame_id if annotated_image_key else None,
                    "raw_image_key": raw_image_key,
                    "annotated_image_key": annotated_image_key,
                    "status": "open",
                    "telegram_sent": False,
                    "telegram_sent_at": None,
                    "telegram_error": None,
                }

                events.append(event)

                if alert_service.should_create_alert(detection):
                    alert = alert_service.build_alert(
                        frame_id=frame_id,
                        event=event,
                        detection=detection,
                        raw_image_key=raw_image_key,
                        annotated_image_key=annotated_image_key,
                    )
                    alerts.append(alert)

        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Inference failed: {exc}",
            ) from exc

    for alert in alerts:
        telegram_result = telegram_service.send_alert(
            alert,
            raw_image_url=_raw_image_api_url(request, frame_id),
        )

        alert["telegram_sent"] = telegram_result["telegram_sent"]
        alert["telegram_sent_at"] = telegram_result["telegram_sent_at"]
        alert["telegram_error"] = telegram_result["telegram_error"]

        for event in events:
            if event.get("event_id") == alert.get("event_id"):
                event["telegram_sent"] = telegram_result["telegram_sent"]
                event["telegram_sent_at"] = telegram_result["telegram_sent_at"]
                event["telegram_error"] = telegram_result["telegram_error"]

    metadata = {
        "frame_id": frame_id,
        "timestamp": received_at,
        "sensor_node_id": sensor_node_id,
        "node_name": sensor_node_id,
        "captured_at": captured_at,
        "received_at": received_at,
        "sequence_number": sequence_number,
        "camera_location": camera_location,
        "content_type": image.content_type,
        "size_bytes": len(image_bytes),
        "raw_image_id": frame_id,
        "annotated_image_id": frame_id if annotated_image_key else None,
        "raw_image_key": raw_image_key,
        "raw_image_uri": raw_image_uri,
        "annotated_image_key": annotated_image_key,
        "annotated_image_uri": annotated_image_uri,
        "raw_image_url": _raw_image_api_url(request, frame_id),
        "annotated_image_url": _annotated_image_api_url(
            request,
            frame_id,
            annotated_image_key,
        ),
        "storage_backend": settings.storage_backend,
        "status": "processed" if settings.run_inference_on_upload else "stored",
        "detections": detections,
        "events": events,
        "alerts": alerts,
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
            "timestamp": received_at,
            "detections": detections,
            "events": events,
            "alerts": alerts,
            "annotation_check": annotation_check,
            "annotation_diff_pixels": annotation_diff_pixels,
            "raw_image_key": raw_image_key,
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

    for alert in alerts:
        alert_key = storage_service.build_alert_metadata_key(alert["alert_id"])
        storage_service.upload_metadata_json(
            metadata=alert,
            object_key=alert_key,
        )

    return {
        "message": "Frame uploaded and processed successfully",
        "frame": metadata,
        "metadata_key": metadata_key,
        "metadata_uri": metadata_uri,
        "detection_key": detection_key,
        "detection_uri": detection_uri,
        "events": events,
        "alerts": alerts,
    }


@router.get("/{frame_id}")
def get_frame(frame_id: str, request: Request):
    frame_key = storage_service.build_frame_metadata_key(frame_id)

    try:
        frame = storage_service.read_metadata_json(frame_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Frame not found: {frame_id}",
        ) from exc

    frame["frame_metadata_key"] = frame_key
    frame["raw_image_id"] = frame.get("raw_image_id") or frame_id
    frame["annotated_image_id"] = frame.get("annotated_image_id") or (
        frame_id if frame.get("annotated_image_key") else None
    )
    frame["raw_image_url"] = _raw_image_api_url(request, frame_id)
    frame["annotated_image_url"] = _annotated_image_api_url(
        request,
        frame_id,
        frame.get("annotated_image_key"),
    )

    return frame


@router.get("/{frame_id}/annotation-check")
def get_annotation_check(frame_id: str, request: Request):
    frame_key = storage_service.build_frame_metadata_key(frame_id)

    try:
        frame = storage_service.read_metadata_json(frame_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Frame not found: {frame_id}",
        ) from exc

    annotated_image_key = frame.get("annotated_image_key")

    return {
        "frame_id": frame_id,
        "detections_count": len(frame.get("detections", [])),
        "raw_image_id": frame_id,
        "annotated_image_id": frame_id if annotated_image_key else None,
        "raw_image_key": frame.get("raw_image_key"),
        "annotated_image_key": annotated_image_key,
        "raw_image_url": _raw_image_api_url(request, frame_id),
        "annotated_image_url": _annotated_image_api_url(
            request,
            frame_id,
            annotated_image_key,
        ),
        "annotated_image_uri": frame.get("annotated_image_uri"),
        "annotation_check": frame.get("annotation_check"),
        "annotation_diff_pixels": frame.get("annotation_diff_pixels"),
    }
