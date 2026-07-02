from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import make_asgi_app
from app.api.events import router as events_router
from app.api.frames import router as frames_router
from app.api.health import router as health_router
from app.api.images import router as images_router
from app.core.config import settings
from app.services.frame_repository import FrameRepository


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.raw_frames_directory.mkdir(parents=True, exist_ok=True)
    FrameRepository(settings.database_path).initialize()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(frames_router)
app.include_router(events_router)
app.include_router(images_router)


app.mount("/metrics", make_asgi_app())
