from __future__ import annotations

from fastapi import APIRouter, HTTPException, Response

from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/images", tags=["images"])


@router.get("/raw/{frame_id}")
def get_raw_image(frame_id: str):
    frame_key = storage_service.build_frame_metadata_key(frame_id)

    try:
        frame = storage_service.read_metadata_json(frame_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Frame metadata not found: {frame_id}",
        ) from exc

    raw_image_key = frame.get("raw_image_key")

    if not raw_image_key:
        raise HTTPException(
            status_code=404,
            detail=f"Raw image key not found for frame: {frame_id}",
        )

    try:
        image_bytes = storage_service.download_image_bytes(raw_image_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Raw image not found for frame: {frame_id}",
        ) from exc

    content_type = frame.get("content_type") or "image/jpeg"

    return Response(
        content=image_bytes,
        media_type=content_type,
    )


@router.get("/annotated/{frame_id}")
def get_annotated_image(frame_id: str):
    frame_key = storage_service.build_frame_metadata_key(frame_id)

    try:
        frame = storage_service.read_metadata_json(frame_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Frame metadata not found: {frame_id}",
        ) from exc

    annotated_image_key = frame.get("annotated_image_key")

    if not annotated_image_key:
        raise HTTPException(
            status_code=404,
            detail=f"Annotated image not available for frame: {frame_id}",
        )

    try:
        image_bytes = storage_service.download_image_bytes(annotated_image_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Annotated image not found for frame: {frame_id}",
        ) from exc

    return Response(
        content=image_bytes,
        media_type="image/jpeg",
    )
