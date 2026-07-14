from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.services.task_dispatcher import task_dispatcher


LOGGER = logging.getLogger("distributed_frame_service")


@dataclass(frozen=True)
class DistributedFrameOutcome:
    image_bytes: bytes
    content_type: str

    distributed_processing_used: bool
    active_worker_count: int
    tile_count: int
    layout: str

    total_latency_seconds: float
    worker_processing_latency_seconds: float

    fallback_tile_count: int
    failed_tile_count: int

    workers_used: tuple[str, ...]
    error: str | None

    def to_metadata(self) -> dict[str, Any]:
        return {
            "enabled": settings.distributed_processing_enabled,
            "used": self.distributed_processing_used,
            "active_worker_count": self.active_worker_count,
            "tile_count": self.tile_count,
            "layout": self.layout,
            "total_latency_seconds": round(
                self.total_latency_seconds,
                6,
            ),
            "worker_processing_latency_seconds": round(
                self.worker_processing_latency_seconds,
                6,
            ),
            "fallback_tile_count": self.fallback_tile_count,
            "failed_tile_count": self.failed_tile_count,
            "workers_used": list(self.workers_used),
            "error": self.error,
        }


class DistributedFrameService:
    """
    Prepares a frame for inference using available image workers.

    Any unexpected distributed-processing error falls back to the
    original image so that frame ingestion and inference can continue.
    """

    def prepare_for_inference(
        self,
        *,
        frame_id: str,
        image_bytes: bytes,
        content_type: str,
    ) -> DistributedFrameOutcome:
        if not settings.distributed_processing_enabled:
            return self._original_frame_outcome(
                image_bytes=image_bytes,
                content_type=content_type,
            )

        try:
            result = task_dispatcher.process_frame(
                frame_id=frame_id,
                image_bytes=image_bytes,
                content_type=content_type,
            )

            LOGGER.info(
                (
                    "Distributed processing completed: "
                    "frame_id=%s used=%s workers=%s "
                    "tiles=%s layout=%s fallback_tiles=%s "
                    "latency=%.6f"
                ),
                frame_id,
                result.distributed_processing_used,
                result.active_worker_count,
                result.tile_count,
                result.layout,
                result.fallback_tile_count,
                result.total_latency_seconds,
            )

            return DistributedFrameOutcome(
                image_bytes=result.processed_image_bytes,
                content_type=result.processed_content_type,
                distributed_processing_used=(
                    result.distributed_processing_used
                ),
                active_worker_count=result.active_worker_count,
                tile_count=result.tile_count,
                layout=result.layout,
                total_latency_seconds=result.total_latency_seconds,
                worker_processing_latency_seconds=(
                    result.worker_processing_latency_seconds
                ),
                fallback_tile_count=result.fallback_tile_count,
                failed_tile_count=result.failed_tile_count,
                workers_used=tuple(result.workers_used),
                error=None,
            )

        except Exception as exc:
            LOGGER.exception(
                (
                    "Distributed processing failed for frame %s. "
                    "Continuing with the original image."
                ),
                frame_id,
            )

            return self._original_frame_outcome(
                image_bytes=image_bytes,
                content_type=content_type,
                error=str(exc),
            )

    @staticmethod
    def _original_frame_outcome(
        *,
        image_bytes: bytes,
        content_type: str,
        error: str | None = None,
    ) -> DistributedFrameOutcome:
        return DistributedFrameOutcome(
            image_bytes=image_bytes,
            content_type=content_type,
            distributed_processing_used=False,
            active_worker_count=0,
            tile_count=0,
            layout="1x1",
            total_latency_seconds=0.0,
            worker_processing_latency_seconds=0.0,
            fallback_tile_count=0,
            failed_tile_count=0,
            workers_used=(),
            error=error,
        )


distributed_frame_service = DistributedFrameService()
