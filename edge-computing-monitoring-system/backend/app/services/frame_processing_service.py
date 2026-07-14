from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.config import settings
from app.services.alert_service import alert_service
from app.services.storage_service import storage_service
from app.services.telegram_service import telegram_service
from app.services.inference_client import inference_client
from app.services.distributed_frame_service import (
    distributed_frame_service,
)

@dataclass(frozen=True)
class FrameProcessingInput:
    image_bytes: bytes
    content_type: str
    sensor_node_id: str
    captured_at: str
    sequence_number: int | None
    camera_location: str | None
    api_base_url: str


@dataclass(frozen=True)
class FrameProcessingResult:
    frame: dict[str, Any]
    metadata_key: str
    metadata_uri: str
    detection_key: str
    detection_uri: str
    events: list[dict[str, Any]]
    alerts: list[dict[str, Any]]


class FrameProcessingService:
    """Coordinates storage, inference, events, alerts and notifications."""

    @staticmethod
    def _raw_image_url(api_base_url: str, frame_id: str) -> str:
        return f"{api_base_url}/api/v1/images/raw/{frame_id}"

    @staticmethod
    def _annotated_image_url(
        api_base_url: str,
        frame_id: str,
        annotated_image_key: str | None,
    ) -> str | None:
        if not annotated_image_key:
            return None

        return f"{api_base_url}/api/v1/images/annotated/{frame_id}"

    @staticmethod
    def _extension_for_content_type(content_type: str) -> str:
        return "png" if content_type == "image/png" else "jpg"

    def process(self, payload: FrameProcessingInput) -> FrameProcessingResult:
        frame_id = storage_service.generate_frame_id()
        received_at = datetime.now(timezone.utc).isoformat()

        extension = self._extension_for_content_type(payload.content_type)

        raw_image_key = storage_service.build_raw_image_key(
            sensor_node_id=payload.sensor_node_id,
            frame_id=frame_id,
            extension=extension,
        )

        raw_image_uri = storage_service.upload_image_bytes(
            image_bytes=payload.image_bytes,
            object_key=raw_image_key,
            content_type=payload.content_type,
        )

        detections: list[dict[str, Any]] = []
        events: list[dict[str, Any]] = []
        alerts: list[dict[str, Any]] = []

        annotated_image_key: str | None = None
        annotated_image_uri: str | None = None
        inference_latency_seconds: float | None = None
        annotation_check = "not_run"
        annotation_diff_pixels = 0

        if settings.run_inference_on_upload:
            distributed_outcome = (
                distributed_frame_service.prepare_for_inference(
                    frame_id=frame_id,
                    image_bytes=payload.image_bytes,
                    content_type=payload.content_type,
                )
            )
            (
                detections,
                annotated_image_key,
                annotated_image_uri,
                inference_latency_seconds,
                annotation_check,
                annotation_diff_pixels,	
            ) = self._run_inference(
                image_bytes=distributed_outcome.image_bytes,
    		content_type=distributed_outcome.content_type,
    		sensor_node_id=payload.sensor_node_id,
    		frame_id=frame_id,
		)

            events, alerts = self._build_events_and_alerts(
                detections=detections,
                frame_id=frame_id,
                captured_at=payload.captured_at,
                received_at=received_at,
                sensor_node_id=payload.sensor_node_id,
                camera_location=payload.camera_location,
                raw_image_key=raw_image_key,
                annotated_image_key=annotated_image_key,
            )

        raw_image_url = self._raw_image_url(
            payload.api_base_url,
            frame_id,
        )

        self._send_telegram_alerts(
            alerts=alerts,
            events=events,
            raw_image_url=raw_image_url,
        )

        metadata = {
            "frame_id": frame_id,
            "timestamp": received_at,
            "sensor_node_id": payload.sensor_node_id,
            "node_name": payload.sensor_node_id,
            "captured_at": payload.captured_at,
            "received_at": received_at,
            "sequence_number": payload.sequence_number,
            "camera_location": payload.camera_location,
            "content_type": payload.content_type,
            "size_bytes": len(payload.image_bytes),
            "raw_image_id": frame_id,
            "annotated_image_id": (
                frame_id if annotated_image_key else None
            ),
            "raw_image_key": raw_image_key,
            "raw_image_uri": raw_image_uri,
            "annotated_image_key": annotated_image_key,
            "annotated_image_uri": annotated_image_uri,
            "raw_image_url": raw_image_url,
            "annotated_image_url": self._annotated_image_url(
                payload.api_base_url,
                frame_id,
                annotated_image_key,
            ),
            "storage_backend": settings.storage_backend,
            "status": (
                "processed"
                if settings.run_inference_on_upload
                else "stored"
            ),
            "detections": detections,
            "events": events,
            "alerts": alerts,
            "inference_latency_seconds": inference_latency_seconds,
            "annotation_check": annotation_check,
            "annotation_diff_pixels": annotation_diff_pixels,
        }

        metadata_key, metadata_uri = self._store_frame_metadata(
            frame_id=frame_id,
            received_at=received_at,
            metadata=metadata,
            detections=detections,
            events=events,
            alerts=alerts,
            raw_image_key=raw_image_key,
            annotated_image_key=annotated_image_key,
            annotation_check=annotation_check,
            annotation_diff_pixels=annotation_diff_pixels,
        )

        detection_key = storage_service.build_detection_metadata_key(
            frame_id
        )

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

        self._store_events(events)
        self._store_alerts(alerts)

        return FrameProcessingResult(
            frame=metadata,
            metadata_key=metadata_key,
            metadata_uri=metadata_uri,
            detection_key=detection_key,
            detection_uri=detection_uri,
            events=events,
            alerts=alerts,
        )

    def _run_inference(
        self,
        *,
        content_type: str,
        image_bytes: bytes,
        sensor_node_id: str,
        frame_id: str,
    ) -> tuple[
        list[dict[str, Any]],
        str | None,
        str | None,
        float,
        str,
        int,
    ]:
        from app.services.inference_client import inference_client

        extension = "png" if content_type == "image/png" else "jpg"

        inference_result = inference_client.infer(
            image_bytes=image_bytes,
            content_type=content_type,
            filename=f"{frame_id}.{extension}",
        )

        detections = inference_result.detections

        latency = round(
            inference_result.inference_latency_seconds,
            4,
        )

        annotation_diff_pixels = (
            inference_result.annotation_diff_pixels
        )

        annotated_image_key: str | None = None
        annotated_image_uri: str | None = None

        if inference_result.annotated_image_bytes is None:
            return (
                detections,
                None,
                None,
                latency,
                "not_applicable_no_detections",
                annotation_diff_pixels,
            )

        annotated_image_key = (
            storage_service.build_annotated_image_key(
                sensor_node_id=sensor_node_id,
                frame_id=frame_id,
                extension="jpg",
            )
        )

        annotated_image_uri = storage_service.upload_image_bytes(
            image_bytes=inference_result.annotated_image_bytes,
            object_key=annotated_image_key,
            content_type="image/jpeg",
        )

        annotation_check = (
            "passed"
            if annotation_diff_pixels > 0
            else "failed_no_visual_difference"
        )

        return (
            detections,
            annotated_image_key,
            annotated_image_uri,
            latency,
            annotation_check,
            annotation_diff_pixels,
        )

    def _build_events_and_alerts(
        self,
        *,
        detections: list[dict[str, Any]],
        frame_id: str,
        captured_at: str,
        received_at: str,
        sensor_node_id: str,
        camera_location: str | None,
        raw_image_key: str,
        annotated_image_key: str | None,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        events: list[dict[str, Any]] = []
        alerts: list[dict[str, Any]] = []

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
                "event_type": detection.get(
                    "class_name",
                    "unknown",
                ),
                "severity": detection.get(
                    "severity",
                    "unknown",
                ),
                "confidence": detection.get("confidence"),
                "confidence_percent": detection.get(
                    "confidence_percent"
                ),
                "node_name": sensor_node_id,
                "sensor_node_id": sensor_node_id,
                "camera_location": camera_location,
                "detection": detection,
                "detections": [detection],
                "raw_image_id": frame_id,
                "annotated_image_id": (
                    frame_id if annotated_image_key else None
                ),
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

        return events, alerts

    def _send_telegram_alerts(
        self,
        *,
        alerts: list[dict[str, Any]],
        events: list[dict[str, Any]],
        raw_image_url: str,
    ) -> None:
        events_by_id = {
            event.get("event_id"): event
            for event in events
        }

        for alert in alerts:
            telegram_result = telegram_service.send_alert(
                alert,
                raw_image_url=raw_image_url,
            )

            alert["telegram_sent"] = telegram_result[
                "telegram_sent"
            ]
            alert["telegram_sent_at"] = telegram_result[
                "telegram_sent_at"
            ]
            alert["telegram_error"] = telegram_result[
                "telegram_error"
            ]

            related_event = events_by_id.get(
                alert.get("event_id")
            )

            if related_event is not None:
                related_event["telegram_sent"] = telegram_result[
                    "telegram_sent"
                ]
                related_event["telegram_sent_at"] = telegram_result[
                    "telegram_sent_at"
                ]
                related_event["telegram_error"] = telegram_result[
                    "telegram_error"
                ]

    def _store_frame_metadata(
        self,
        *,
        frame_id: str,
        received_at: str,
        metadata: dict[str, Any],
        detections: list[dict[str, Any]],
        events: list[dict[str, Any]],
        alerts: list[dict[str, Any]],
        raw_image_key: str,
        annotated_image_key: str | None,
        annotation_check: str,
        annotation_diff_pixels: int,
    ) -> tuple[str, str]:
        metadata_key = storage_service.build_frame_metadata_key(
            frame_id
        )

        metadata_uri = storage_service.upload_metadata_json(
            metadata=metadata,
            object_key=metadata_key,
        )

        return metadata_key, metadata_uri

    @staticmethod
    def _store_events(events: list[dict[str, Any]]) -> None:
        for event in events:
            event_key = storage_service.build_event_metadata_key(
                event["event_id"]
            )

            storage_service.upload_metadata_json(
                metadata=event,
                object_key=event_key,
            )

    @staticmethod
    def _store_alerts(alerts: list[dict[str, Any]]) -> None:
        for alert in alerts:
            alert_key = storage_service.build_alert_metadata_key(
                alert["alert_id"]
            )

            storage_service.upload_metadata_json(
                metadata=alert,
                object_key=alert_key,
            )


frame_processing_service = FrameProcessingService()
