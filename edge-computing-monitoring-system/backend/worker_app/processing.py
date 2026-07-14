from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass

import cv2
import numpy as np

from worker_app.config import worker_settings


@dataclass(frozen=True)
class ProcessedTile:
    image_bytes: bytes
    width: int
    height: int
    content_type: str
    processing_latency_seconds: float
    sha256: str


class TileProcessor:
    """Performs lightweight preprocessing on one image tile."""

    def process(
        self,
        image_bytes: bytes,
        content_type: str,
    ) -> ProcessedTile:
        del content_type

        if not image_bytes:
            raise ValueError("Image tile is empty")

        encoded_array = np.frombuffer(
            image_bytes,
            dtype=np.uint8,
        )

        frame = cv2.imdecode(
            encoded_array,
            cv2.IMREAD_COLOR,
        )

        if frame is None:
            raise ValueError(
                "Could not decode the uploaded image tile"
            )

        start_time = time.perf_counter()
        processed_frame = self._apply_processing(frame)
        processing_latency_seconds = (
            time.perf_counter() - start_time
        )

        success, encoded_image = cv2.imencode(
            ".png",
            processed_frame,
        )

        if not success:
            raise RuntimeError(
                "Could not encode the processed image tile"
            )

        processed_bytes = encoded_image.tobytes()
        height, width = processed_frame.shape[:2]
        checksum = hashlib.sha256(
            processed_bytes
        ).hexdigest()

        return ProcessedTile(
            image_bytes=processed_bytes,
            width=width,
            height=height,
            content_type="image/png",
            processing_latency_seconds=(
                processing_latency_seconds
            ),
            sha256=checksum,
        )

    def _apply_processing(
        self,
        frame: np.ndarray,
    ) -> np.ndarray:
        processing_mode = worker_settings.processing_mode

        if processing_mode == "identity":
            return frame.copy()

        if processing_mode == "grayscale":
            grayscale = cv2.cvtColor(
                frame,
                cv2.COLOR_BGR2GRAY,
            )

            return cv2.cvtColor(
                grayscale,
                cv2.COLOR_GRAY2BGR,
            )

        if processing_mode == "clahe":
            return self._apply_clahe(frame)

        raise RuntimeError(
            f"Unsupported processing mode: {processing_mode}"
        )

    @staticmethod
    def _apply_clahe(
        frame: np.ndarray,
    ) -> np.ndarray:
        lab_image = cv2.cvtColor(
            frame,
            cv2.COLOR_BGR2LAB,
        )

        lightness, channel_a, channel_b = cv2.split(
            lab_image
        )

        clahe = cv2.createCLAHE(
            clipLimit=2.0,
            tileGridSize=(8, 8),
        )

        enhanced_lightness = clahe.apply(lightness)

        enhanced_lab = cv2.merge(
            (
                enhanced_lightness,
                channel_a,
                channel_b,
            )
        )

        return cv2.cvtColor(
            enhanced_lab,
            cv2.COLOR_LAB2BGR,
        )


tile_processor = TileProcessor()
