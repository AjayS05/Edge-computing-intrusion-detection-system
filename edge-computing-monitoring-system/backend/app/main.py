from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from app.api.telegram import router as telegram_router
from app.api.alerts import router as alerts_router
from app.api.events import router as events_router
from app.api.frames import router as frames_router
from app.api.health import router as health_router
from app.api.images import router as images_router
from app.api.monitoring import router as monitoring_router
from app.core.config import settings
from app.services.frame_repository import FrameRepository
from app.services.storage_service import storage_service
from app.api.kubernetes import router as kubernetes_router
from app.api.model_dataset import router as model_router
from app.api.cluster_performance import router as cluster_performance_router
from app.api import events, storage
@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.raw_frames_directory.mkdir(parents=True, exist_ok=True)
    settings.annotated_frames_directory.mkdir(parents=True, exist_ok=True)
    settings.metadata_directory.mkdir(parents=True, exist_ok=True)
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    storage_service.ensure_buckets()
    FrameRepository(settings.database_path).initialize()

    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(events_router)
app.include_router(frames_router)
app.include_router(images_router)
app.include_router(monitoring_router)
app.include_router(alerts_router)
app.include_router(telegram_router)
app.include_router(storage.router)
app.include_router(kubernetes_router)
app.include_router(model_router)
app.include_router(cluster_performance_router)
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

