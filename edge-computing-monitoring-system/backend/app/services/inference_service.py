from __future__ import annotations

import io
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

from app.core.config import settings


@dataclass
class InferenceResult:
    detections: list[dict[str, Any]]
    annotated_image_bytes: bytes | None
    inference_latency_seconds: float
    annotation_saved: bool
    annotation_diff_pixels: int


class InferenceService:
    def __init__(self) -> None:
        self.model: YOLO | None = None
        self.model_path = Path(settings.yolo_model_path)

    def _load_model(self) -> YOLO:
        if self.model is None:
            if not self.model_path.exists():
                raise FileNotFoundError(f"YOLO model not found: {self.model_path}")

            self.model = YOLO(str(self.model_path))

        return self.model

    def _severity_for_class(self, class_name: str) -> str:
        mapping = {
            "fire": "critical",
            "weapon": "critical",
            "intruder": "critical",
            "smoke": "high",
            "liquid_spill": "medium",
            "person": "informational",
        }
        return mapping.get(class_name, "unknown")

    def run_on_image_bytes(self, image_bytes: bytes) -> InferenceResult:
        model = self._load_model()

        np_image = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(np_image, cv2.IMREAD_COLOR)

        if frame is None:
            raise ValueError("Could not decode uploaded image for inference")

        start_time = time.perf_counter()

        results = model.predict(
            source=frame,
            verbose=False,
            conf=settings.yolo_confidence_threshold,
        )

        latency = time.perf_counter() - start_time

        detections: list[dict[str, Any]] = []
        annotated_frame = frame.copy()

        for result in results:
            annotated_frame = result.plot()

            if result.boxes is None:
                continue

            for box in result.boxes:
                class_id = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                xyxy = box.xyxy[0].tolist()
                class_name = model.names[class_id]

                detections.append(
                    {
                        "class_id": class_id,
                        "class_name": class_name,
                        "confidence": round(confidence, 4),
                        "confidence_percent": round(confidence * 100, 2),
                        "severity": self._severity_for_class(class_name),
                        "bounding_box": {
                            "x_min": round(float(xyxy[0]), 2),
                            "y_min": round(float(xyxy[1]), 2),
                            "x_max": round(float(xyxy[2]), 2),
                            "y_max": round(float(xyxy[3]), 2),
                        },
                    }
                )

        annotation_diff_pixels = int(np.count_nonzero(cv2.absdiff(frame, annotated_frame)))

        annotated_image_bytes: bytes | None = None
        annotation_saved = False

        if detections:
            success, encoded = cv2.imencode(".jpg", annotated_frame)

            if not success:
                raise RuntimeError("Failed to encode annotated image")

            annotated_image_bytes = encoded.tobytes()
            annotation_saved = True

        return InferenceResult(
            detections=detections,
            annotated_image_bytes=annotated_image_bytes,
            inference_latency_seconds=latency,
            annotation_saved=annotation_saved,
            annotation_diff_pixels=annotation_diff_pixels,
        )


inference_service = InferenceService()
