from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/events", tags=["events"])


def _api_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _build_raw_image_api_url(request: Request, frame_id: str | None) -> str | None:
    if not frame_id:
        return None

    return f"{_api_base_url(request)}/api/v1/images/raw/{frame_id}"


def _build_annotated_image_api_url(
    request: Request,
    *,
    frame_id: str | None,
    annotated_image_key: str | None,
) -> str | None:
    if not frame_id or not annotated_image_key:
        return None

    return f"{_api_base_url(request)}/api/v1/images/annotated/{frame_id}"


def _normalize_event(event: dict[str, Any], *, key: str, request: Request) -> dict[str, Any]:
    frame_id = event.get("frame_id")

    raw_image_key = event.get("raw_image_key")
    annotated_image_key = event.get("annotated_image_key")

    timestamp = (
        event.get("timestamp")
        or event.get("created_at")
        or event.get("captured_at")
        or event.get("received_at")
    )

    sensor_node_id = event.get("sensor_node_id") or event.get("node_name")
    node_name = event.get("node_name") or sensor_node_id

    detections = event.get("detections")

    if detections is None:
        detection = event.get("detection")
        detections = [detection] if detection else []

    normalized = {
        **event,
        "event_metadata_key": key,
        "event_id": event.get("event_id"),
        "frame_id": frame_id,
        "timestamp": timestamp,
        "created_at": event.get("created_at") or timestamp,
        "captured_at": event.get("captured_at"),
        "node_name": node_name,
        "sensor_node_id": sensor_node_id,
        "camera_location": event.get("camera_location"),
        "event_type": event.get("event_type") or event.get("class_name") or "unknown",
        "severity": event.get("severity") or "unknown",
        "detections": detections,
        "confidence": event.get("confidence"),
        "confidence_percent": event.get("confidence_percent"),
        "raw_image_id": event.get("raw_image_id") or frame_id,
        "annotated_image_id": event.get("annotated_image_id") or (frame_id if annotated_image_key else None),
        "raw_image_key": raw_image_key,
        "annotated_image_key": annotated_image_key,
        "raw_image_url": _build_raw_image_api_url(request, frame_id),
        "annotated_image_url": _build_annotated_image_api_url(
            request,
            frame_id=frame_id,
            annotated_image_key=annotated_image_key,
        ),
        "telegram_sent": event.get("telegram_sent", False),
        "telegram_sent_at": event.get("telegram_sent_at"),
        "telegram_error": event.get("telegram_error"),
        "status": event.get("status", "open"),
    }

    return normalized


def _event_matches_filters(
    event: dict[str, Any],
    *,
    severity: str | None,
    event_type: str | None,
    sensor_node_id: str | None,
    status: str | None,
) -> bool:
    if severity and event.get("severity") != severity:
        return False

    if event_type and event.get("event_type") != event_type:
        return False

    if sensor_node_id and event.get("sensor_node_id") != sensor_node_id:
        return False

    if status and event.get("status") != status:
        return False

    return True


@router.get("")
def list_events(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    severity: str | None = Query(None),
    event_type: str | None = Query(None),
    sensor_node_id: str | None = Query(None),
    status: str | None = Query(None),
):
    event_objects = storage_service.list_metadata_objects("events/")

    events: list[dict[str, Any]] = []

    for item in event_objects:
        key = item["key"]

        try:
            event = storage_service.read_metadata_json(key)
            normalized_event = _normalize_event(event, key=key, request=request)

            if not _event_matches_filters(
                normalized_event,
                severity=severity,
                event_type=event_type,
                sensor_node_id=sensor_node_id,
                status=status,
            ):
                continue

            events.append(normalized_event)

        except Exception:
            continue

        if len(events) >= limit:
            break

    return {
        "count": len(events),
        "events": events,
    }


@router.get("/latest")
def latest_event(request: Request):
    event_objects = storage_service.list_metadata_objects("events/")

    for item in event_objects:
        key = item["key"]

        try:
            event = storage_service.read_metadata_json(key)
            normalized_event = _normalize_event(event, key=key, request=request)

            return {
                "found": True,
                "event": normalized_event,
            }

        except Exception:
            continue

    return {
        "found": False,
        "event": None,
    }


@router.get("/{event_id}")
def get_event(event_id: str, request: Request):
    event_key = storage_service.build_event_metadata_key(event_id)

    try:
        event = storage_service.read_metadata_json(event_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Event not found: {event_id}",
        ) from exc

    return _normalize_event(event, key=event_key, request=request)
