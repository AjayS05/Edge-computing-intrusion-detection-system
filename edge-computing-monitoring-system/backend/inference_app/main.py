from __future__ import annotations

import base64
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.services.inference_service import inference_service
from inference_app.schemas import (
    HealthResponse,
    InferenceResponse,
    ModelInfoResponse,
)


LOGGER = logging.getLogger("edge_inference")

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    LOGGER.info(
        "Loading YOLO model from %s",
        settings.yolo_model_path,
    )

    inference_service.load_model()

    LOGGER.info("YOLO model loaded successfully")
    yield


app = FastAPI(
    title="Edge YOLO Inference Service",
    version=settings.app_version,
    lifespan=lifespan,
)


@app.get(
    "/health",
    response_model=HealthResponse,
)
def health() -> HealthResponse:
    return HealthResponse(
        status="healthy",
        service="edge-inference",
        model_loaded=inference_service.model_loaded,
    )


@app.get(
    "/model-info",
    response_model=ModelInfoResponse,
)
def model_info() -> ModelInfoResponse:
    try:
        information = inference_service.get_model_info()
        return ModelInfoResponse(**information)

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Model unavailable: {exc}",
        ) from exc


@app.post(
    "/infer",
    response_model=InferenceResponse,
)
async def infer(
    image: UploadFile = File(...),
) -> InferenceResponse:
    content_type = (
        image.content_type or "application/octet-stream"
    ).lower()

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {content_type}",
        )

    image_bytes = await image.read()

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded inference image is empty",
        )

    if len(image_bytes) > settings.max_upload_size_bytes:
        raise HTTPException(
            status_code=413,
            detail="Uploaded inference image is too large",
        )

    try:
        result = await run_in_threadpool(
            inference_service.run_on_image_bytes,
            image_bytes,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        LOGGER.exception("YOLO inference failed")

        raise HTTPException(
            status_code=500,
            detail=f"Inference failed: {exc}",
        ) from exc

    annotated_image_base64: str | None = None

    if result.annotated_image_bytes is not None:
        annotated_image_base64 = base64.b64encode(
            result.annotated_image_bytes
        ).decode("ascii")

    return InferenceResponse(
        detections=result.detections,
        detection_count=len(result.detections),
        annotated_image_base64=annotated_image_base64,
        inference_latency_seconds=round(
            result.inference_latency_seconds,
            6,
        ),
        annotation_saved=result.annotation_saved,
        annotation_diff_pixels=(
            result.annotation_diff_pixels
        ),
    )
