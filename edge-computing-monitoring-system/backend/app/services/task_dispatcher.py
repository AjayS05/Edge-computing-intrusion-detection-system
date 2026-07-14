from __future__ import annotations

import base64
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

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

    worker_processing_latency_seconds: float
    round_trip_latency_seconds: float

    used_fallback: bool
    error: str | None


@dataclass(frozen=True)
class DistributedProcessingResult:
    processed_image_bytes: bytes
    processed_content_type: str

    distributed_processing_used: bool

    active_worker_count: int
    tile_count: int
    layout: str

    total_latency_seconds: float
    worker_processing_latency_seconds: float

    fallback_tile_count: int
    failed_tile_count: int

    workers_used: list[str]
    tile_results: list[TileDispatchResult]


class TaskDispatcher:
    """Sends image tiles to workers and reconstructs the result."""

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

        payload = response.json()

        encoded_image = payload.get(
            "processed_image_base64"
        )

        if not encoded_image:
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

        return TileDispatchResult(
            tile_id=tile.tile_id,
            worker_id=str(
                payload.get(
                    "worker_id",
                    worker.worker_id,
                )
            ),
            worker_url=worker.base_url,
            processed_image_bytes=(
                processed_image_bytes
            ),
            worker_processing_latency_seconds=float(
                payload.get(
                    "processing_latency_seconds",
                    0.0,
                )
            ),
            round_trip_latency_seconds=(
                round_trip_latency
            ),
            used_fallback=False,
            error=None,
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
        errors: list[str] = []

        ordered_workers = (
            workers[preferred_worker_index:]
            + workers[:preferred_worker_index]
        )

        for worker in ordered_workers:
            try:
                return self._post_tile(
                    worker=worker,
                    tile=tile,
                    original_width=original_width,
                    original_height=original_height,
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

                errors.append(error_message)

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
            worker_processing_latency_seconds=0.0,
            round_trip_latency_seconds=0.0,
            used_fallback=True,
            error="; ".join(errors),
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
                layout="1x1",
                total_latency_seconds=0.0,
                worker_processing_latency_seconds=0.0,
                fallback_tile_count=0,
                failed_tile_count=0,
                workers_used=[],
                tile_results=[],
            )

        active_workers = (
            worker_registry.discover_active_workers()
        )

        if len(active_workers) < 2:
            total_latency = (
                time.perf_counter() - start_time
            )

            return DistributedProcessingResult(
                processed_image_bytes=image_bytes,
                processed_content_type=content_type,
                distributed_processing_used=False,
                active_worker_count=len(active_workers),
                tile_count=0,
                layout="1x1",
                total_latency_seconds=total_latency,
                worker_processing_latency_seconds=0.0,
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
            result.tile_id:
                result.processed_image_bytes
            for result in tile_results
        }

        reconstructed_image = (
            image_splitter.reconstruct(
                split_result=split_result,
                processed_tiles=processed_tiles,
            )
        )

        total_latency = (
            time.perf_counter() - start_time
        )

        fallback_tile_count = sum(
            result.used_fallback
            for result in tile_results
        )

        failed_tile_count = sum(
            result.error is not None
            for result in tile_results
        )

        worker_processing_latency = sum(
            result.worker_processing_latency_seconds
            for result in tile_results
        )

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
            distributed_processing_used=True,
            active_worker_count=len(active_workers),
            tile_count=len(split_result.tiles),
            layout=split_result.layout,
            total_latency_seconds=total_latency,
            worker_processing_latency_seconds=(
                worker_processing_latency
            ),
            fallback_tile_count=fallback_tile_count,
            failed_tile_count=failed_tile_count,
            workers_used=workers_used,
            tile_results=tile_results,
        )


task_dispatcher = TaskDispatcher()
