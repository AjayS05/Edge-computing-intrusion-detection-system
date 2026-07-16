from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool

from app.services.storage_status_service import (
    storage_status_service,
)

router = APIRouter(
    prefix="/api/v1/storage",
    tags=["storage"],
)


@router.get("/status")
async def get_storage_status(
    refresh: bool = Query(default=False),
):
    try:
        return await run_in_threadpool(
            storage_status_service.get_status,
            refresh=refresh,
        )

    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Storage status unavailable: {exc}",
        ) from exc
