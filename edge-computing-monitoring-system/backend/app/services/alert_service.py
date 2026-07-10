from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.storage_service import storage_service


class AlertService:
    def should_create_alert(self, detection: dict[str, Any]) -> bool:
        """
        Alerts are created only for actual threat/safety classes.

        Person is kept as an informational event, but it is not an alert.
        """
        return detection.get("severity") in {"critical", "high", "medium"}

    def build_alert(
        self,
        *,
        frame_id: str,
        event: dict[str, Any],
        detection: dict[str, Any],
        raw_image_key: str,
        annotated_image_key: str | None,
    ) -> dict[str, Any]:
        alert_id = storage_service.generate_alert_id()

        event_type = event.get("event_type", "unknown")
        severity = event.get("severity", "unknown")
        confidence_percent = detection.get("confidence_percent")

        title = self._build_title(event_type=event_type, severity=severity)

        message = self._build_message(
            event_type=event_type,
            confidence_percent=confidence_percent,
            camera_location=event.get("camera_location"),
            sensor_node_id=event.get("sensor_node_id"),
        )

        created_at = datetime.now(timezone.utc).isoformat()

        return {
            "alert_id": alert_id,
            "event_id": event.get("event_id"),
            "frame_id": frame_id,
            "timestamp": created_at,
            "created_at": created_at,
            "alert_type": event_type,
            "event_type": event_type,
            "severity": severity,
            "status": "active",
            "title": title,
            "message": message,
            "confidence": detection.get("confidence"),
            "confidence_percent": confidence_percent,
            "node_name": event.get("node_name") or event.get("sensor_node_id"),
            "sensor_node_id": event.get("sensor_node_id"),
            "camera_location": event.get("camera_location"),
            "captured_at": event.get("captured_at"),
            "raw_image_id": frame_id,
            "annotated_image_id": frame_id if annotated_image_key else None,
            "raw_image_key": raw_image_key,
            "annotated_image_key": annotated_image_key,
            "telegram_sent": False,
            "telegram_sent_at": None,
            "telegram_error": None,
        }

    def _build_title(self, *, event_type: str, severity: str) -> str:
        readable_event = event_type.replace("_", " ").title()
        return f"{severity.upper()} Alert: {readable_event} Detected"

    def _build_message(
        self,
        *,
        event_type: str,
        confidence_percent: float | int | None,
        camera_location: str | None,
        sensor_node_id: str | None,
    ) -> str:
        readable_event = event_type.replace("_", " ").title()

        if isinstance(confidence_percent, (int, float)):
            confidence_text = f"{confidence_percent:.1f}%"
        else:
            confidence_text = "unknown"

        location_text = camera_location or "unknown location"
        node_text = sensor_node_id or "unknown sensor"

        return (
            f"{readable_event} detected with {confidence_text} confidence "
            f"at {location_text} from sensor {node_text}."
        )


alert_service = AlertService()
