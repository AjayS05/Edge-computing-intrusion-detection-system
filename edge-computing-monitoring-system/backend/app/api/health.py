from fastapi import APIRouter

from app.core.config import settings
from app.models.frame import HealthResponse
from app.services.frame_repository import FrameRepository

router = APIRouter(tags=["health"])
repository = FrameRepository(settings.database_path)


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    repository.ping()
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        data_directory=str(settings.data_directory),
        database_status="ok",
    )
