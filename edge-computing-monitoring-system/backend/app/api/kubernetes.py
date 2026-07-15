from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/v1/kubernetes", tags=["kubernetes"])


def _load_kubernetes_config():
    from kubernetes import config
    from kubernetes.config.config_exception import ConfigException

    try:
        config.load_incluster_config()
    except ConfigException:
        config.load_kube_config()


def _pod_age_seconds(creation_timestamp) -> int | None:
    if creation_timestamp is None:
        return None

    now = datetime.now(timezone.utc)
    return int((now - creation_timestamp).total_seconds())


def _format_pod(pod) -> dict[str, Any]:
    labels = pod.metadata.labels or {}
    container_statuses = pod.status.container_statuses or []

    total_containers = len(container_statuses)
    ready_containers = sum(1 for container in container_statuses if container.ready)
    restarts = sum(container.restart_count for container in container_statuses)

    ready_text = f"{ready_containers}/{total_containers}" if total_containers else "0/0"
    ready_bool = total_containers > 0 and ready_containers == total_containers

    app_name = (
        labels.get("app.kubernetes.io/name")
        or labels.get("app")
        or labels.get("component")
        or labels.get("name")
        or "unknown"
    )

    return {
        "name": pod.metadata.name,
        "namespace": pod.metadata.namespace,
        "status": pod.status.phase or "Unknown",
        "ready": ready_text,
        "ready_bool": ready_bool,
        "restarts": restarts,
        "node": pod.spec.node_name,
        "age_seconds": _pod_age_seconds(pod.metadata.creation_timestamp),
        "app": app_name,
        "labels": labels,
    }


def _is_yolo_pod(pod_data: dict[str, Any]) -> bool:
    text = " ".join(
        [
            pod_data.get("name", ""),
            pod_data.get("app", ""),
            " ".join(str(value) for value in pod_data.get("labels", {}).values()),
        ]
    ).lower()

    return "yolo" in text or "inference" in text or "model" in text


def _get_yolo_status(yolo_pods: list[dict[str, Any]]) -> str:
    if not yolo_pods:
        return "offline"

    if any(
        pod["status"] == "Running" and pod["ready_bool"]
        for pod in yolo_pods
    ):
        return "online"

    return "warning"


@router.get("/pods")
def get_kubernetes_pods(
    namespace: str = Query(default_factory=lambda: os.getenv("KUBERNETES_NAMESPACE", "edge-monitoring")),
):
    try:
        from kubernetes import client

        _load_kubernetes_config()

        core_v1 = client.CoreV1Api()

        if namespace.lower() in {"all", "*"}:
            pod_list = core_v1.list_pod_for_all_namespaces()
            resolved_namespace = "all"
        else:
            pod_list = core_v1.list_namespaced_pod(namespace=namespace)
            resolved_namespace = namespace

        pods = [_format_pod(pod) for pod in pod_list.items]
        pods = sorted(pods, key=lambda item: (item["namespace"], item["name"]))

        yolo_pods = [pod for pod in pods if _is_yolo_pod(pod)]

        return {
            "namespace": resolved_namespace,
            "total_pods": len(pods),
            "running_pods": len([pod for pod in pods if pod["status"] == "Running"]),
            "yolo_status": _get_yolo_status(yolo_pods),
            "yolo_pods": yolo_pods,
            "pods": pods,
        }

    except Exception as exc:
        return {
            "namespace": namespace,
            "total_pods": 0,
            "running_pods": 0,
            "yolo_status": "unknown",
            "yolo_pods": [],
            "pods": [],
            "error": str(exc),
        }
