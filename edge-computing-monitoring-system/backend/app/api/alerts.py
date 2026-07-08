from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


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


def _normalize_alert(alert: dict[str, Any], *, key: str, request: Request) -> dict[str, Any]:
    frame_id = alert.get("frame_id")
    annotated_image_key = alert.get("annotated_image_key")

    timestamp = (
        alert.get("timestamp")
        or alert.get("created_at")
        or alert.get("captured_at")
    )

    return {
        **alert,
        "alert_metadata_key": key,
        "alert_id": alert.get("alert_id"),
        "event_id": alert.get("event_id"),
        "frame_id": frame_id,
        "timestamp": timestamp,
        "created_at": alert.get("created_at") or timestamp,
        "alert_type": alert.get("alert_type") or alert.get("event_type"),
        "event_type": alert.get("event_type") or alert.get("alert_type"),
        "severity": alert.get("severity", "unknown"),
        "status": alert.get("status", "active"),
        "title": alert.get("title", "Alert"),
        "message": alert.get("message", ""),
        "confidence": alert.get("confidence"),
        "confidence_percent": alert.get("confidence_percent"),
        "node_name": alert.get("node_name") or alert.get("sensor_node_id"),
        "sensor_node_id": alert.get("sensor_node_id"),
        "camera_location": alert.get("camera_location"),
        "raw_image_id": alert.get("raw_image_id") or frame_id,
        "annotated_image_id": alert.get("annotated_image_id") or (frame_id if annotated_image_key else None),
        "raw_image_key": alert.get("raw_image_key"),
        "annotated_image_key": annotated_image_key,
        "raw_image_url": _build_raw_image_api_url(request, frame_id),
        "annotated_image_url": _build_annotated_image_api_url(
            request,
            frame_id=frame_id,
            annotated_image_key=annotated_image_key,
        ),
        "telegram_sent": alert.get("telegram_sent", False),
        "telegram_sent_at": alert.get("telegram_sent_at"),
        "telegram_error": alert.get("telegram_error"),
    }


def _alert_matches_filters(
    alert: dict[str, Any],
    *,
    severity: str | None,
    status: str | None,
    alert_type: str | None,
) -> bool:
    if severity and alert.get("severity") != severity:
        return False

    if status and alert.get("status") != status:
        return False

    if alert_type and alert.get("alert_type") != alert_type:
        return False

    return True


@router.get("")
def list_alerts(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    severity: str | None = Query(None),
    status: str | None = Query(None),
    alert_type: str | None = Query(None),
):
    alert_objects = storage_service.list_metadata_objects("alerts/")

    alerts: list[dict[str, Any]] = []

    for item in alert_objects:
        key = item["key"]

        try:
            alert = storage_service.read_metadata_json(key)
            normalized_alert = _normalize_alert(alert, key=key, request=request)

            if not _alert_matches_filters(
                normalized_alert,
                severity=severity,
                status=status,
                alert_type=alert_type,
            ):
                continue

            alerts.append(normalized_alert)

        except Exception:
            continue

        if len(alerts) >= limit:
            break

    return {
        "count": len(alerts),
        "alerts": alerts,
    }


@router.get("/latest")
def latest_alert(request: Request):
    alert_objects = storage_service.list_metadata_objects("alerts/")

    for item in alert_objects:
        key = item["key"]

        try:
            alert = storage_service.read_metadata_json(key)
            normalized_alert = _normalize_alert(alert, key=key, request=request)

            return {
                "found": True,
                "alert": normalized_alert,
            }

        except Exception:
            continue

    return {
        "found": False,
        "alert": None,
    }


@router.get("/{alert_id}")
def get_alert(alert_id: str, request: Request):
    alert_key = storage_service.build_alert_metadata_key(alert_id)

    try:
        alert = storage_service.read_metadata_json(alert_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Alert not found: {alert_id}",
        ) from exc

    return _normalize_alert(alert, key=alert_key, request=request)
