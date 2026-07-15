from __future__ import annotations

import copy
import time
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Iterator
from uuid import NAMESPACE_URL, uuid5

from botocore.exceptions import ClientError

from app.core.config import settings
from app.services.alert_service import alert_service
from app.services.distributed_frame_service import (
    distributed_frame_service,
)
from app.services.inference_client import inference_client
from app.services.storage_service import storage_service
from app.services.telegram_service import telegram_service


@dataclass(frozen=True)
class FrameProcessingInput:
    image_bytes: bytes
    content_type: str
    sensor_node_id: str
    captured_at: str
    sequence_number: int | None
    camera_location: str | None
    api_base_url: str
    capture_id: str
    image_sha256: str
    upload_source: str


@dataclass(frozen=True)
class StoredInferenceOutcome:
    detections: list[dict[str, Any]]
    annotated_image_key: str | None
    annotated_image_uri: str | None
    model_latency_seconds: float
    round_trip_latency_seconds: float
    annotation_check: str
    annotation_diff_pixels: int


@dataclass(frozen=True)
class FrameProcessingResult:
    frame: dict[str, Any]
    metadata_key: str
    metadata_uri: str
    detection_key: str
    detection_uri: str
    events: list[dict[str, Any]]
    alerts: list[dict[str, Any]]
    distribution: dict[str, Any]
    duplicate: bool


@dataclass
class _CaptureLockEntry:
    lock: Lock
    users: int = 0


class FrameProcessingService:
    """Coordinates the complete frame-ingestion pipeline."""

    def __init__(self) -> None:
        self._capture_locks_guard = Lock()
        self._capture_locks: dict[str, _CaptureLockEntry] = {}

    @staticmethod
    def _raw_image_url(
        api_base_url: str,
        frame_id: str,
    ) -> str:
        return f"{api_base_url}/api/v1/images/raw/{frame_id}"

    @staticmethod
    def _annotated_image_url(
        api_base_url: str,
        frame_id: str,
        annotated_image_key: str | None,
    ) -> str | None:
        if not annotated_image_key:
            return None

        return (
            f"{api_base_url}/api/v1/images/annotated/"
            f"{frame_id}"
        )

    @staticmethod
    def _extension_for_content_type(
        content_type: str,
    ) -> str:
        return "png" if content_type == "image/png" else "jpg"

    @staticmethod
    def _default_distribution_metadata(
        *,
        status: str,
    ) -> dict[str, Any]:
        return {
            "enabled": settings.distributed_processing_enabled,
            "status": status,
            "used": False,
            "active_worker_count": 0,
            "tile_count": 0,
            "successful_tile_count": 0,
            "layout": "1x1",
            "total_latency_seconds": 0.0,
            "worker_processing_latency_seconds": 0.0,
            "max_worker_processing_latency_seconds": 0.0,
            "max_round_trip_latency_seconds": 0.0,
            "fallback_tile_count": 0,
            "failed_tile_count": 0,
            "workers_used": [],
            "tiles": [],
            "error": None,
        }

    @contextmanager
    def _capture_lock(
        self,
        capture_id: str,
    ) -> Iterator[None]:
        with self._capture_locks_guard:
            entry = self._capture_locks.get(capture_id)

            if entry is None:
                entry = _CaptureLockEntry(lock=Lock())
                self._capture_locks[capture_id] = entry

            entry.users += 1

        entry.lock.acquire()

        try:
            yield
        finally:
            entry.lock.release()

            with self._capture_locks_guard:
                entry.users -= 1

                if (
                    entry.users == 0
                    and self._capture_locks.get(capture_id)
                    is entry
                ):
                    self._capture_locks.pop(capture_id, None)

    @staticmethod
    def _metadata_uri(object_key: str) -> str:
        if settings.storage_backend.lower() == "s3":
            return (
                f"s3://{settings.s3_metadata_bucket}/"
                f"{object_key}"
            )

        return str(settings.data_directory / object_key)

    @staticmethod
    def _read_metadata_if_present(
        object_key: str,
    ) -> dict[str, Any] | None:
        try:
            return storage_service.read_metadata_json(
                object_key
            )

        except FileNotFoundError:
            return None

        except ClientError as exc:
            error_code = str(
                exc.response.get("Error", {}).get("Code", "")
            )

            if error_code in {
                "NoSuchKey",
                "NoSuchObject",
                "404",
                "NotFound",
            }:
                return None

            raise

    def _load_existing_result(
        self,
        payload: FrameProcessingInput,
    ) -> FrameProcessingResult | None:
        frame_id = payload.capture_id

        metadata_key = (
            storage_service.build_frame_metadata_key(
                frame_id
            )
        )

        existing = self._read_metadata_if_present(
            metadata_key
        )

        if existing is None:
            return None

        stored_hash = existing.get("image_sha256")

        if (
            stored_hash
            and stored_hash != payload.image_sha256
        ):
            raise ValueError(
                "capture_id already exists with different "
                "image content"
            )

        detection_key = (
            storage_service.build_detection_metadata_key(
                frame_id
            )
        )

        response_frame = copy.deepcopy(existing)
        response_frame["duplicate_upload"] = True
        response_frame["duplicate_request_received_at"] = (
            datetime.now(timezone.utc).isoformat()
        )
        response_frame["duplicate_upload_source"] = (
            payload.upload_source
        )

        return FrameProcessingResult(
            frame=response_frame,
            metadata_key=metadata_key,
            metadata_uri=self._metadata_uri(metadata_key),
            detection_key=detection_key,
            detection_uri=self._metadata_uri(detection_key),
            events=copy.deepcopy(
                existing.get("events", [])
            ),
            alerts=copy.deepcopy(
                existing.get("alerts", [])
            ),
            distribution=copy.deepcopy(
                existing.get(
                    "distributed_processing",
                    self._default_distribution_metadata(
                        status="unknown"
                    ),
                )
            ),
            duplicate=True,
        )

    def process(
        self,
        payload: FrameProcessingInput,
    ) -> FrameProcessingResult:
        # One backend replica is currently deployed. This lock prevents two
        # simultaneous retries of the same capture from running inference
        # twice. The metadata check also preserves idempotency across restarts.
        with self._capture_lock(payload.capture_id):
            existing = self._load_existing_result(payload)

            if existing is not None:
                return existing

            return self._process_new(payload)

    def _process_new(
        self,
        payload: FrameProcessingInput,
    ) -> FrameProcessingResult:
        pipeline_started = time.perf_counter()
        frame_id = payload.capture_id

        received_at = datetime.now(
            timezone.utc
        ).isoformat()

        extension = self._extension_for_content_type(
            payload.content_type
        )

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

        inference_outcome = StoredInferenceOutcome(
            detections=[],
            annotated_image_key=None,
            annotated_image_uri=None,
            model_latency_seconds=0.0,
            round_trip_latency_seconds=0.0,
            annotation_check="not_run",
            annotation_diff_pixels=0,
        )

        distribution_metadata = (
            self._default_distribution_metadata(
                status="skipped_inference_disabled"
            )
        )

        if settings.run_inference_on_upload:
            distributed_outcome = (
                distributed_frame_service.prepare_for_inference(
                    frame_id=frame_id,
                    image_bytes=payload.image_bytes,
                    content_type=payload.content_type,
                )
            )

            distribution_metadata = (
                distributed_outcome.to_metadata()
            )

            inference_outcome = self._run_inference(
                image_bytes=distributed_outcome.image_bytes,
                content_type=distributed_outcome.content_type,
                sensor_node_id=payload.sensor_node_id,
                frame_id=frame_id,
            )

            detections = inference_outcome.detections

            events, alerts = self._build_events_and_alerts(
                detections=detections,
                frame_id=frame_id,
                captured_at=payload.captured_at,
                received_at=received_at,
                sensor_node_id=payload.sensor_node_id,
                camera_location=payload.camera_location,
                raw_image_key=raw_image_key,
                annotated_image_key=(
                    inference_outcome.annotated_image_key
                ),
            )

        raw_image_url = self._raw_image_url(
            payload.api_base_url,
            frame_id,
        )

        annotated_image_url = self._annotated_image_url(
            payload.api_base_url,
            frame_id,
            inference_outcome.annotated_image_key,
        )

        self._send_telegram_alerts(
            alerts=alerts,
            events=events,
            raw_image_url=raw_image_url,
        )

        pipeline_latency_seconds = (
            time.perf_counter() - pipeline_started
        )

        inference_metadata = {
            "enabled": settings.run_inference_on_upload,
            "status": (
                "completed"
                if settings.run_inference_on_upload
                else "disabled"
            ),
            "model_latency_seconds": round(
                inference_outcome.model_latency_seconds,
                6,
            ),
            "round_trip_latency_seconds": round(
                inference_outcome.round_trip_latency_seconds,
                6,
            ),
            "detection_count": len(detections),
            "annotation_check": (
                inference_outcome.annotation_check
            ),
            "annotation_diff_pixels": (
                inference_outcome.annotation_diff_pixels
            ),
        }

        metadata = {
            "frame_id": frame_id,
            "capture_id": payload.capture_id,
            "image_sha256": payload.image_sha256,
            "upload_source": payload.upload_source,
            "duplicate_upload": False,
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
                frame_id
                if inference_outcome.annotated_image_key
                else None
            ),
            "raw_image_key": raw_image_key,
            "raw_image_uri": raw_image_uri,
            "annotated_image_key": (
                inference_outcome.annotated_image_key
            ),
            "annotated_image_uri": (
                inference_outcome.annotated_image_uri
            ),
            "raw_image_url": raw_image_url,
            "annotated_image_url": annotated_image_url,
            "storage_backend": settings.storage_backend,
            "status": (
                "processed"
                if settings.run_inference_on_upload
                else "stored"
            ),
            "detections": detections,
            "events": events,
            "alerts": alerts,
            "inference": inference_metadata,
            "distributed_processing": distribution_metadata,
            "pipeline_latency_seconds": round(
                pipeline_latency_seconds,
                6,
            ),
            "inference_latency_seconds": (
                inference_outcome.model_latency_seconds
                if settings.run_inference_on_upload
                else None
            ),
            "annotation_check": (
                inference_outcome.annotation_check
            ),
            "annotation_diff_pixels": (
                inference_outcome.annotation_diff_pixels
            ),
        }

        detection_key = (
            storage_service.build_detection_metadata_key(
                frame_id
            )
        )

        detection_uri = storage_service.upload_metadata_json(
            metadata={
                "frame_id": frame_id,
                "capture_id": payload.capture_id,
                "image_sha256": payload.image_sha256,
                "upload_source": payload.upload_source,
                "timestamp": received_at,
                "detections": detections,
                "events": events,
                "alerts": alerts,
                "inference": inference_metadata,
                "distributed_processing": (
                    distribution_metadata
                ),
                "annotation_check": (
                    inference_outcome.annotation_check
                ),
                "annotation_diff_pixels": (
                    inference_outcome.annotation_diff_pixels
                ),
                "raw_image_key": raw_image_key,
                "annotated_image_key": (
                    inference_outcome.annotated_image_key
                ),
            },
            object_key=detection_key,
        )

        self._store_events(events)
        self._store_alerts(alerts)

        # Frame metadata is the completion record used by duplicate
        # detection. Store it last so an interrupted first attempt is
        # retried instead of being mistaken for a completed frame.
        metadata_key = (
            storage_service.build_frame_metadata_key(
                frame_id
            )
        )

        metadata_uri = storage_service.upload_metadata_json(
            metadata=metadata,
            object_key=metadata_key,
        )

        return FrameProcessingResult(
            frame=metadata,
            metadata_key=metadata_key,
            metadata_uri=metadata_uri,
            detection_key=detection_key,
            detection_uri=detection_uri,
            events=events,
            alerts=alerts,
            distribution=distribution_metadata,
            duplicate=False,
        )

    def _run_inference(
        self,
        *,
        content_type: str,
        image_bytes: bytes,
        sensor_node_id: str,
        frame_id: str,
    ) -> StoredInferenceOutcome:
        extension = self._extension_for_content_type(
            content_type
        )

        inference_result = inference_client.infer(
            image_bytes=image_bytes,
            content_type=content_type,
            filename=f"{frame_id}.{extension}",
        )

        detections = inference_result.detections

        model_latency = round(
            inference_result.inference_latency_seconds,
            6,
        )

        round_trip_latency = round(
            inference_result.request_latency_seconds,
            6,
        )

        annotation_diff_pixels = (
            inference_result.annotation_diff_pixels
        )

        if inference_result.annotated_image_bytes is None:
            annotation_check = (
                "not_applicable_no_detections"
                if not detections
                else "failed_missing_annotation"
            )

            return StoredInferenceOutcome(
                detections=detections,
                annotated_image_key=None,
                annotated_image_uri=None,
                model_latency_seconds=model_latency,
                round_trip_latency_seconds=(
                    round_trip_latency
                ),
                annotation_check=annotation_check,
                annotation_diff_pixels=(
                    annotation_diff_pixels
                ),
            )

        annotated_image_key = (
            storage_service.build_annotated_image_key(
                sensor_node_id=sensor_node_id,
                frame_id=frame_id,
                extension="jpg",
            )
        )

        annotated_image_uri = (
            storage_service.upload_image_bytes(
                image_bytes=(
                    inference_result.annotated_image_bytes
                ),
                object_key=annotated_image_key,
                content_type="image/jpeg",
            )
        )

        annotation_check = (
            "passed"
            if annotation_diff_pixels > 0
            else "failed_no_visual_difference"
        )

        return StoredInferenceOutcome(
            detections=detections,
            annotated_image_key=annotated_image_key,
            annotated_image_uri=annotated_image_uri,
            model_latency_seconds=model_latency,
            round_trip_latency_seconds=(
                round_trip_latency
            ),
            annotation_check=annotation_check,
            annotation_diff_pixels=(
                annotation_diff_pixels
            ),
        )

    @staticmethod
    def _severity_rank(value: str | None) -> int:
        ranking = {
            "critical": 6,
            "high": 5,
            "medium": 4,
            "warning": 3,
            "informational": 2,
            "info": 2,
            "unknown": 1,
        }

        return ranking.get(
            str(value or "unknown").lower(),
            0,
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
        if not detections:
            return [], []

        ordered_detections = sorted(
            detections,
            key=lambda detection: (
                self._severity_rank(
                    detection.get("severity")
                ),
                float(detection.get("confidence") or 0.0),
            ),
            reverse=True,
        )

        primary_detection = ordered_detections[0]
        event_id = uuid5(
            NAMESPACE_URL,
            f"piwatch:event:{frame_id}",
        ).hex

        created_at = datetime.now(
            timezone.utc
        ).isoformat()

        detected_classes = sorted(
            {
                str(
                    detection.get(
                        "class_name",
                        "unknown",
                    )
                )
                for detection in detections
            }
        )

        event = {
            "event_id": event_id,
            "frame_id": frame_id,
            "timestamp": created_at,
            "created_at": created_at,
            "captured_at": captured_at,
            "received_at": received_at,
            "event_type": primary_detection.get(
                "class_name",
                "unknown",
            ),
            "severity": primary_detection.get(
                "severity",
                "unknown",
            ),
            "confidence": primary_detection.get(
                "confidence"
            ),
            "confidence_percent": primary_detection.get(
                "confidence_percent"
            ),
            "node_name": sensor_node_id,
            "sensor_node_id": sensor_node_id,
            "camera_location": camera_location,
            "detection": primary_detection,
            "detections": detections,
            "detection_count": len(detections),
            "detected_classes": detected_classes,
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

        alerts: list[dict[str, Any]] = []

        for detection_index, detection in enumerate(
            detections
        ):
            if not alert_service.should_create_alert(
                detection
            ):
                continue

            # alert_service reads event_type and severity from the supplied
            # event. Use a small alert-specific view so each alert describes
            # its own detection while still referring to the one frame event.
            alert_event = {
                **event,
                "event_type": detection.get(
                    "class_name",
                    "unknown",
                ),
                "severity": detection.get(
                    "severity",
                    "unknown",
                ),
                "confidence": detection.get(
                    "confidence"
                ),
                "confidence_percent": detection.get(
                    "confidence_percent"
                ),
                "detection": detection,
            }

            alert = alert_service.build_alert(
                frame_id=frame_id,
                event=alert_event,
                detection=detection,
                raw_image_key=raw_image_key,
                annotated_image_key=annotated_image_key,
            )

            alert["alert_id"] = uuid5(
                NAMESPACE_URL,
                (
                    f"piwatch:alert:{frame_id}:"
                    f"{detection_index}:"
                    f"{detection.get('class_name', 'unknown')}"
                ),
            ).hex

            alerts.append(alert)

        return [event], alerts

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
                if telegram_result["telegram_sent"]:
                    related_event["telegram_sent"] = True
                    related_event["telegram_sent_at"] = (
                        telegram_result[
                            "telegram_sent_at"
                        ]
                    )

                if telegram_result["telegram_error"]:
                    related_event["telegram_error"] = (
                        telegram_result[
                            "telegram_error"
                        ]
                    )

    @staticmethod
    def _store_events(
        events: list[dict[str, Any]],
    ) -> None:
        for event in events:
            event_key = (
                storage_service.build_event_metadata_key(
                    event["event_id"]
                )
            )

            storage_service.upload_metadata_json(
                metadata=event,
                object_key=event_key,
            )

    @staticmethod
    def _store_alerts(
        alerts: list[dict[str, Any]],
    ) -> None:
        for alert in alerts:
            alert_key = (
                storage_service.build_alert_metadata_key(
                    alert["alert_id"]
                )
            )

            storage_service.upload_metadata_json(
                metadata=alert,
                object_key=alert_key,
            )


frame_processing_service = FrameProcessingService()
