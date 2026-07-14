from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from ultralytics import YOLO

from app.core.config import settings


@dataclass(frozen=True)
class InferenceResult:
    detections: list[dict[str, Any]]
    annotated_image_bytes: bytes | None
    inference_latency_seconds: float
    annotation_saved: bool
    annotation_diff_pixels: int


class InferenceService:
    """Loads the YOLO model once and performs inference."""

    def __init__(self) -> None:
        self._model: YOLO | None = None
        self.model_path = Path(
            settings.yolo_model_path
        ).expanduser()

    @property
    def model_loaded(self) -> bool:
        return self._model is not None

    def load_model(self) -> YOLO:
        if self._model is not None:
            return self._model

        if not self.model_path.exists():
            raise FileNotFoundError(
                f"YOLO model not found: {self.model_path}"
            )

        self._model = YOLO(str(self.model_path))
        return self._model

    def get_model_info(self) -> dict[str, Any]:
        model = self.load_model()

        class_names = {
            int(class_id): str(class_name)
            for class_id, class_name in model.names.items()
        }

        return {
            "model_path": str(self.model_path),
            "model_filename": self.model_path.name,
            "model_loaded": self.model_loaded,
            "confidence_threshold": (
                settings.yolo_confidence_threshold
            ),
            "classes": class_names,
            "class_count": len(class_names),
        }

    @staticmethod
    def _severity_for_class(class_name: str) -> str:
        mapping = {
            "fire": "critical",
            "weapon": "critical",
            "person": "informational",
            "container": "informational",
        }

        return mapping.get(
            class_name.strip().lower(),
            "unknown",
        )

    def run_on_image_bytes(
        self,
        image_bytes: bytes,
    ) -> InferenceResult:
        if not image_bytes:
            raise ValueError("Inference image is empty")

        model = self.load_model()

        np_image = np.frombuffer(
            image_bytes,
            dtype=np.uint8,
        )

        frame = cv2.imdecode(
            np_image,
            cv2.IMREAD_COLOR,
        )

        if frame is None:
            raise ValueError(
                "Could not decode uploaded image for inference"
            )

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
                coordinates = box.xyxy[0].tolist()
                class_name = str(model.names[class_id])

                detections.append(
                    {
                        "class_id": class_id,
                        "class_name": class_name,
                        "confidence": round(confidence, 4),
                        "confidence_percent": round(
                            confidence * 100,
                            2,
                        ),
                        "severity": self._severity_for_class(
                            class_name
                        ),
                        "bounding_box": {
                            "x_min": round(
                                float(coordinates[0]),
                                2,
                            ),
                            "y_min": round(
                                float(coordinates[1]),
                                2,
                            ),
                            "x_max": round(
                                float(coordinates[2]),
                                2,
                            ),
                            "y_max": round(
                                float(coordinates[3]),
                                2,
                            ),
                        },
                    }
                )

        annotation_diff_pixels = int(
            np.count_nonzero(
                cv2.absdiff(
                    frame,
                    annotated_frame,
                )
            )
        )

        annotated_image_bytes: bytes | None = None
        annotation_saved = False

        if detections:
            success, encoded_image = cv2.imencode(
                ".jpg",
                annotated_frame,
            )

            if not success:
                raise RuntimeError(
                    "Failed to encode annotated image"
                )

            annotated_image_bytes = encoded_image.tobytes()
            annotation_saved = True

        return InferenceResult(
            detections=detections,
            annotated_image_bytes=annotated_image_bytes,
            inference_latency_seconds=latency,
            annotation_saved=annotation_saved,
            annotation_diff_pixels=annotation_diff_pixels,
        )


inference_service = InferenceService()
