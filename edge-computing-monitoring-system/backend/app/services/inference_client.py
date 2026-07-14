from __future__ import annotations

import base64
import time
from dataclasses import dataclass
from typing import Any

import requests

from app.core.config import settings


@dataclass(frozen=True)
class RemoteInferenceResult:
    detections: list[dict[str, Any]]
    annotated_image_bytes: bytes | None
    inference_latency_seconds: float
    request_latency_seconds: float
    annotation_saved: bool
    annotation_diff_pixels: int


class InferenceClient:
    """HTTP client used by the backend coordinator."""

    @property
    def base_url(self) -> str:
        return settings.inference_service_url.rstrip("/")

    def health(self) -> dict[str, Any]:
        try:
            response = requests.get(
                f"{self.base_url}/health",
                timeout=settings.inference_request_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
        except requests.RequestException as exc:
            raise RuntimeError(
                f"Could not contact inference service at "
                f"{self.base_url}: {exc}"
            ) from exc
        except ValueError as exc:
            raise RuntimeError(
                "Inference health endpoint returned invalid JSON"
            ) from exc

        if not isinstance(payload, dict):
            raise RuntimeError(
                "Inference health endpoint returned an invalid payload"
            )

        return payload

    def infer(
        self,
        *,
        image_bytes: bytes,
        content_type: str,
        filename: str = "frame.jpg",
    ) -> RemoteInferenceResult:
        if not image_bytes:
            raise ValueError("Cannot infer an empty image")

        request_started = time.perf_counter()

        try:
            response = requests.post(
                f"{self.base_url}/infer",
                files={
                    "image": (
                        filename,
                        image_bytes,
                        content_type,
                    )
                },
                timeout=settings.inference_request_timeout_seconds,
            )
        except requests.RequestException as exc:
            raise RuntimeError(
                f"Could not contact inference service at "
                f"{self.base_url}: {exc}"
            ) from exc

        request_latency_seconds = (
            time.perf_counter() - request_started
        )

        if not response.ok:
            raise RuntimeError(
                "Inference service returned "
                f"HTTP {response.status_code}: "
                f"{response.text[:1000]}"
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(
                "Inference service returned invalid JSON"
            ) from exc

        if not isinstance(payload, dict):
            raise RuntimeError(
                "Inference service returned an invalid response object"
            )

        detections = payload.get("detections", [])

        if not isinstance(detections, list) or not all(
            isinstance(detection, dict)
            for detection in detections
        ):
            raise RuntimeError(
                "Inference service returned invalid detections"
            )

        annotated_image_bytes: bytes | None = None
        encoded_annotation = payload.get(
            "annotated_image_base64"
        )

        if encoded_annotation:
            if not isinstance(encoded_annotation, str):
                raise RuntimeError(
                    "Inference service returned an invalid annotation"
                )

            try:
                annotated_image_bytes = base64.b64decode(
                    encoded_annotation,
                    validate=True,
                )
            except (ValueError, TypeError) as exc:
                raise RuntimeError(
                    "Inference service returned invalid Base64 image data"
                ) from exc

        return RemoteInferenceResult(
            detections=detections,
            annotated_image_bytes=annotated_image_bytes,
            inference_latency_seconds=float(
                payload.get("inference_latency_seconds", 0.0)
            ),
            request_latency_seconds=request_latency_seconds,
            annotation_saved=bool(
                payload.get("annotation_saved", False)
            ),
            annotation_diff_pixels=int(
                payload.get("annotation_diff_pixels", 0)
            ),
        )


inference_client = InferenceClient()
