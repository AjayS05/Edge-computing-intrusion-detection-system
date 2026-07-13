from __future__ import annotations

from fastapi import APIRouter

from app.services.telegram_service import telegram_service

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


@router.get("/status")
def telegram_status():
    return telegram_service.status()
