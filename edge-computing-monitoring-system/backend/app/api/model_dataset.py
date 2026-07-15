from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(prefix="/api/v1/model", tags=["model"])


class ModelClassItem(BaseModel):
    name: str
    count: int = 0
    percentage: int = 0


class ModelInfoResponse(BaseModel):
    model_name: str
    model_file: str
    model_path: str
    model_exists: bool

    architecture: str
    framework: str
    runtime: str

    confidence_threshold: float
    inference_time_ms: int

    map50: float
    map5095: float

    training_images: int
    validation_images: int

    classes: List[ModelClassItem]


def _get_float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def _get_int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _get_model_classes() -> list[ModelClassItem]:
    """
    Use MODEL_CLASSES from environment if available.

    Example:
    MODEL_CLASSES=person,weapon,fire,container
    """

    class_names = os.getenv(
        "MODEL_CLASSES",
        "person,weapon,fire,container",
    )

    names = [
        name.strip()
        for name in class_names.split(",")
        if name.strip()
    ]

    if not names:
        names = ["person", "weapon", "fire", "container"]

    percentage = round(100 / len(names))

    return [
        ModelClassItem(
            name=name,
            count=0,
            percentage=percentage,
        )
        for name in names
    ]


@router.get("/info", response_model=ModelInfoResponse)
def get_model_info() -> ModelInfoResponse:
    model_file = os.getenv("MODEL_FILE", "best_final.pt")

    model_path = os.getenv(
        "MODEL_PATH",
        f"app/models/{model_file}",
    )

    resolved_model_path = Path(model_path)

    return ModelInfoResponse(
        model_name=os.getenv(
            "MODEL_NAME",
            "Custom YOLOv8 Threat Detector",
        ),
        model_file=model_file,
        model_path=str(resolved_model_path),
        model_exists=resolved_model_path.exists(),

        architecture=os.getenv("MODEL_ARCHITECTURE", "YOLOv8"),
        framework=os.getenv("MODEL_FRAMEWORK", "Ultralytics"),
        runtime=os.getenv("MODEL_RUNTIME", "PyTorch"),

        confidence_threshold=_get_float_env(
            "MODEL_CONFIDENCE_THRESHOLD",
            0.55,
        ),
        inference_time_ms=_get_int_env(
            "MODEL_INFERENCE_TIME_MS",
            38,
        ),

        map50=_get_float_env("MODEL_MAP50", 0.0),
        map5095=_get_float_env("MODEL_MAP5095", 0.0),

        training_images=_get_int_env("MODEL_TRAINING_IMAGES", 0),
        validation_images=_get_int_env("MODEL_VALIDATION_IMAGES", 0),

        classes=_get_model_classes(),
    )
