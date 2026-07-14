from __future__ import annotations

import base64
import hashlib
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from typing import Any

import requests

from app.core.config import settings
from app.services.image_splitter import (
    ImageTile,
    image_splitter,
)
from app.services.worker_registry import (
    WorkerEndpoint,
    worker_registry,
)


LOGGER = logging.getLogger("task_dispatcher")


@dataclass(frozen=True)
class TileDispatchResult:
    tile_id: str
    worker_id: str | None
    worker_url: str | None

    processed_image_bytes: bytes
    processed_content_type: str

    worker_processing_latency_seconds: float
    round_trip_latency_seconds: float

    attempt_count: int
    used_fallback: bool
    error: str | None
    attempt_errors: tuple[str, ...]

    def to_metadata(self) -> dict[str, Any]:
        return {
            "tile_id": self.tile_id,
            "worker_id": self.worker_id,
            "worker_url": self.worker_url,
            "processed_content_type": self.processed_content_type,
            "worker_processing_latency_seconds": round(
                self.worker_processing_latency_seconds,
                6,
            ),
            "round_trip_latency_seconds": round(
                self.round_trip_latency_seconds,
                6,
            ),
            "attempt_count": self.attempt_count,
            "used_fallback": self.used_fallback,
            "error": self.error,
            "attempt_errors": list(self.attempt_errors),
        }


@dataclass(frozen=True)
class DistributedProcessingResult:
    processed_image_bytes: bytes
    processed_content_type: str

    distributed_processing_used: bool

    active_worker_count: int
    tile_count: int
    successful_tile_count: int
    layout: str

    total_latency_seconds: float
    worker_processing_latency_seconds: float
    max_worker_processing_latency_seconds: float
    max_round_trip_latency_seconds: float

    fallback_tile_count: int
    failed_tile_count: int

    workers_used: list[str]
    tile_results: list[TileDispatchResult]


class TaskDispatcher:
    """Sends image tiles to workers and reconstructs the frame."""

    @staticmethod
    def _post_tile(
        *,
        worker: WorkerEndpoint,
        tile: ImageTile,
        original_width: int,
        original_height: int,
    ) -> TileDispatchResult:
        start_time = time.perf_counter()

        response = requests.post(
            f"{worker.base_url}/process-tile",
            files={
                "image": (
                    f"{tile.tile_id}.jpg",
                    tile.image_bytes,
                    tile.content_type,
                )
            },
            data={
                "frame_id": tile.frame_id,
                "tile_id": tile.tile_id,
                "row": str(tile.row),
                "column": str(tile.column),
                "x": str(tile.crop_x),
                "y": str(tile.crop_y),
                "original_width": str(original_width),
                "original_height": str(original_height),
            },
            timeout=settings.worker_request_timeout_seconds,
        )

        round_trip_latency = (
            time.perf_counter() - start_time
        )

        response.raise_for_status()

        try:
            payload: Any = response.json()
        except ValueError as exc:
            raise RuntimeError(
                "Worker returned invalid JSON"
            ) from exc

        if not isinstance(payload, dict):
            raise RuntimeError(
                "Worker returned an invalid response object"
            )

        if payload.get("frame_id") not in {
            None,
            tile.frame_id,
        }:
            raise RuntimeError(
                "Worker response frame_id does not match"
            )

        if payload.get("tile_id") not in {
            None,
            tile.tile_id,
        }:
            raise RuntimeError(
                "Worker response tile_id does not match"
            )

        encoded_image = payload.get(
            "processed_image_base64"
        )

        if not isinstance(encoded_image, str) or not encoded_image:
            raise RuntimeError(
                "Worker response did not contain "
                "processed_image_base64"
            )

        try:
            processed_image_bytes = base64.b64decode(
                encoded_image,
                validate=True,
            )
        except (ValueError, TypeError) as exc:
            raise RuntimeError(
                "Worker returned invalid Base64 image data"
            ) from exc

        expected_checksum = payload.get(
            "processed_image_sha256"
        )

        if (
            settings.worker_verify_checksum
            and expected_checksum
        ):
            actual_checksum = hashlib.sha256(
                processed_image_bytes
            ).hexdigest()

            if actual_checksum != str(expected_checksum):
                raise RuntimeError(
                    "Worker image checksum verification failed"
                )

        return TileDispatchResult(
            tile_id=tile.tile_id,
            worker_id=str(
                payload.get("worker_id", worker.worker_id)
            ),
            worker_url=worker.base_url,
            processed_image_bytes=processed_image_bytes,
            processed_content_type=str(
                payload.get(
                    "processed_content_type",
                    "image/png",
                )
            ),
            worker_processing_latency_seconds=float(
                payload.get(
                    "processing_latency_seconds",
                    0.0,
                )
            ),
            round_trip_latency_seconds=round_trip_latency,
            attempt_count=1,
            used_fallback=False,
            error=None,
            attempt_errors=(),
        )

    def _dispatch_tile_with_retry(
        self,
        *,
        tile: ImageTile,
        preferred_worker_index: int,
        workers: list[WorkerEndpoint],
        original_width: int,
        original_height: int,
    ) -> TileDispatchResult:
        dispatch_started = time.perf_counter()
        attempt_errors: list[str] = []

        ordered_workers = (
            workers[preferred_worker_index:]
            + workers[:preferred_worker_index]
        )

        for attempt_count, worker in enumerate(
            ordered_workers,
            start=1,
        ):
            try:
                result = self._post_tile(
                    worker=worker,
                    tile=tile,
                    original_width=original_width,
                    original_height=original_height,
                )

                return replace(
                    result,
                    round_trip_latency_seconds=(
                        time.perf_counter()
                        - dispatch_started
                    ),
                    attempt_count=attempt_count,
                    attempt_errors=tuple(attempt_errors),
                )

            except (
                requests.RequestException,
                RuntimeError,
                ValueError,
                TypeError,
            ) as exc:
                error_message = (
                    f"{worker.worker_id}: {exc}"
                )
                attempt_errors.append(error_message)

                LOGGER.warning(
                    "Tile %s failed on worker %s: %s",
                    tile.tile_id,
                    worker.worker_id,
                    exc,
                )

        return TileDispatchResult(
            tile_id=tile.tile_id,
            worker_id=None,
            worker_url=None,
            processed_image_bytes=tile.image_bytes,
            processed_content_type=tile.content_type,
            worker_processing_latency_seconds=0.0,
            round_trip_latency_seconds=(
                time.perf_counter() - dispatch_started
            ),
            attempt_count=len(ordered_workers),
            used_fallback=True,
            error="; ".join(attempt_errors),
            attempt_errors=tuple(attempt_errors),
        )

    def process_frame(
        self,
        *,
        frame_id: str,
        image_bytes: bytes,
        content_type: str,
    ) -> DistributedProcessingResult:
        start_time = time.perf_counter()

        if not settings.distributed_processing_enabled:
            return DistributedProcessingResult(
                processed_image_bytes=image_bytes,
                processed_content_type=content_type,
                distributed_processing_used=False,
                active_worker_count=0,
                tile_count=0,
                successful_tile_count=0,
                layout="1x1",
                total_latency_seconds=0.0,
                worker_processing_latency_seconds=0.0,
                max_worker_processing_latency_seconds=0.0,
                max_round_trip_latency_seconds=0.0,
                fallback_tile_count=0,
                failed_tile_count=0,
                workers_used=[],
                tile_results=[],
            )

        active_workers = (
            worker_registry.discover_active_workers()
        )

        if len(active_workers) < settings.distributed_min_workers:
            total_latency = (
                time.perf_counter() - start_time
            )

            return DistributedProcessingResult(
                processed_image_bytes=image_bytes,
                processed_content_type=content_type,
                distributed_processing_used=False,
                active_worker_count=len(active_workers),
                tile_count=0,
                successful_tile_count=0,
                layout="1x1",
                total_latency_seconds=total_latency,
                worker_processing_latency_seconds=0.0,
                max_worker_processing_latency_seconds=0.0,
                max_round_trip_latency_seconds=0.0,
                fallback_tile_count=0,
                failed_tile_count=0,
                workers_used=[
                    worker.worker_id
                    for worker in active_workers
                ],
                tile_results=[],
            )

        split_result = image_splitter.split(
            frame_id=frame_id,
            image_bytes=image_bytes,
            active_worker_count=len(active_workers),
            overlap_pixels=(
                settings.worker_tile_overlap_pixels
            ),
            jpeg_quality=(
                settings.worker_tile_jpeg_quality
            ),
        )

        max_parallel_tasks = min(
            len(split_result.tiles),
            len(active_workers),
        )

        with ThreadPoolExecutor(
            max_workers=max_parallel_tasks
        ) as executor:
            futures = []

            for tile_index, tile in enumerate(
                split_result.tiles
            ):
                preferred_worker_index = (
                    tile_index % len(active_workers)
                )

                futures.append(
                    executor.submit(
                        self._dispatch_tile_with_retry,
                        tile=tile,
                        preferred_worker_index=(
                            preferred_worker_index
                        ),
                        workers=active_workers,
                        original_width=(
                            split_result.original_width
                        ),
                        original_height=(
                            split_result.original_height
                        ),
                    )
                )

            tile_results = [
                future.result()
                for future in futures
            ]

        processed_tiles = {
            result.tile_id: result.processed_image_bytes
            for result in tile_results
        }

        reconstructed_image = image_splitter.reconstruct(
            split_result=split_result,
            processed_tiles=processed_tiles,
        )

        total_latency = (
            time.perf_counter() - start_time
        )

        fallback_tile_count = sum(
            1
            for result in tile_results
            if result.used_fallback
        )
        failed_tile_count = fallback_tile_count
        successful_tile_count = (
            len(tile_results) - fallback_tile_count
        )

        worker_latencies = [
            result.worker_processing_latency_seconds
            for result in tile_results
            if not result.used_fallback
        ]
        round_trip_latencies = [
            result.round_trip_latency_seconds
            for result in tile_results
        ]

        workers_used = sorted(
            {
                result.worker_id
                for result in tile_results
                if result.worker_id is not None
            }
        )

        return DistributedProcessingResult(
            processed_image_bytes=reconstructed_image,
            processed_content_type="image/png",
            distributed_processing_used=(
                successful_tile_count > 0
            ),
            active_worker_count=len(active_workers),
            tile_count=len(split_result.tiles),
            successful_tile_count=successful_tile_count,
            layout=split_result.layout,
            total_latency_seconds=total_latency,
            worker_processing_latency_seconds=sum(
                worker_latencies
            ),
            max_worker_processing_latency_seconds=max(
                worker_latencies,
                default=0.0,
            ),
            max_round_trip_latency_seconds=max(
                round_trip_latencies,
                default=0.0,
            ),
            fallback_tile_count=fallback_tile_count,
            failed_tile_count=failed_tile_count,
            workers_used=workers_used,
            tile_results=tile_results,
        )


task_dispatcher = TaskDispatcher()
