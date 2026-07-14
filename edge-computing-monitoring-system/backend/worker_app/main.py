from __future__ import annotations

import base64
import logging

from fastapi import (
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from starlette.concurrency import run_in_threadpool

from worker_app.config import worker_settings
from worker_app.processing import tile_processor
from worker_app.schemas import (
    TileProcessingResponse,
    WorkerHealthResponse,
)

LOGGER = logging.getLogger("edge_image_worker")

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
}


app = FastAPI(
    title="Edge Image Worker",
    version="0.1.0",
)


@app.get(
    "/health",
    response_model=WorkerHealthResponse,
)
def health() -> WorkerHealthResponse:
    return WorkerHealthResponse(
        status="healthy",
        service=worker_settings.service_name,
        worker_id=worker_settings.worker_id,
        processing_mode=worker_settings.processing_mode,
    )


@app.post(
    "/process-tile",
    response_model=TileProcessingResponse,
)
async def process_tile(
    image: UploadFile = File(...),

    frame_id: str = Form(...),
    tile_id: str = Form(...),

    row: int = Form(...),
    column: int = Form(...),

    x: int = Form(...),
    y: int = Form(...),

    original_width: int = Form(...),
    original_height: int = Form(...),
) -> TileProcessingResponse:
    content_type = (
        image.content_type or "application/octet-stream"
    ).lower()

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {content_type}",
        )

    if row < 0 or column < 0:
        raise HTTPException(
            status_code=422,
            detail="Tile row and column cannot be negative",
        )

    if x < 0 or y < 0:
        raise HTTPException(
            status_code=422,
            detail="Tile x and y coordinates cannot be negative",
        )

    if original_width <= 0 or original_height <= 0:
        raise HTTPException(
            status_code=422,
            detail="Original image dimensions must be positive",
        )

    image_bytes = await image.read()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image tile is empty",
        )

    if (
        len(image_bytes)
        > worker_settings.max_upload_size_bytes
    ):
        raise HTTPException(
            status_code=413,
            detail="Uploaded image tile is too large",
        )

    try:
        result = await run_in_threadpool(
            tile_processor.process,
            image_bytes,
            content_type,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        LOGGER.exception(
            "Image tile processing failed"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Image tile processing failed: {exc}",
        ) from exc

    processed_image_base64 = base64.b64encode(
        result.image_bytes
    ).decode("ascii")

    return TileProcessingResponse(
        status="processed",
        worker_id=worker_settings.worker_id,
        frame_id=frame_id,
        tile_id=tile_id,
        row=row,
        column=column,
        x=x,
        y=y,
        width=result.width,
        height=result.height,
        original_width=original_width,
        original_height=original_height,
        processing_mode=worker_settings.processing_mode,
        processing_latency_seconds=round(
            result.processing_latency_seconds,
            6,
        ),
        processed_content_type=result.content_type,
        processed_image_base64=processed_image_base64,
        processed_image_sha256=result.sha256,
    )
