from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import requests
from fastapi import APIRouter


router = APIRouter(
    prefix="/api/v1/cluster-performance",
    tags=["cluster-performance"],
)


PROMETHEUS_URL = os.getenv(
    "PROMETHEUS_URL",
    "http://prometheus-operated.monitoring.svc.cluster.local:9090",
)

KUBERNETES_NAMESPACE = os.getenv("KUBERNETES_NAMESPACE", "edge-monitoring")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _query_prometheus(query: str) -> list[dict[str, Any]]:
    try:
        response = requests.get(
            f"{PROMETHEUS_URL}/api/v1/query",
            params={"query": query},
            timeout=5,
        )

        response.raise_for_status()

        payload = response.json()

        if payload.get("status") != "success":
            return []

        return payload.get("data", {}).get("result", [])

    except Exception:
        return []


def _metric_by_instance(query: str) -> dict[str, float]:
    results = _query_prometheus(query)
    values: dict[str, float] = {}

    for item in results:
        metric = item.get("metric", {})
        value = item.get("value", [])

        instance = metric.get("instance")

        if not instance or len(value) < 2:
            continue

        number = _safe_float(value[1])

        if number is not None:
            values[instance] = number

    return values


def _get_node_metrics() -> list[dict[str, Any]]:
    up = _metric_by_instance('up{job=~".*node.*|node-exporter"}')

    cpu = _metric_by_instance(
        '100 * (1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))'
    )

    memory = _metric_by_instance(
        "100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))"
    )

    disk = _metric_by_instance(
        '100 * (1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}))'
    )

    load1 = _metric_by_instance("node_load1")

    temperature = _metric_by_instance(
        'node_thermal_zone_temp or node_hwmon_temp_celsius or raspberry_pi_temperature_celsius'
    )

    all_instances = set()
    all_instances.update(up.keys())
    all_instances.update(cpu.keys())
    all_instances.update(memory.keys())
    all_instances.update(disk.keys())
    all_instances.update(load1.keys())
    all_instances.update(temperature.keys())

    nodes: list[dict[str, Any]] = []

    for instance in sorted(all_instances):
        node_name = instance.replace(":9100", "")

        is_online = up.get(instance, 0) == 1

        temp_value = temperature.get(instance)

        nodes.append(
            {
                "name": node_name,
                "instance": instance,
                "status": "online" if is_online else "offline",
                "cpu_percent": round(cpu[instance], 2) if instance in cpu else None,
                "memory_percent": round(memory[instance], 2)
                if instance in memory
                else None,
                "disk_percent": round(disk[instance], 2) if instance in disk else None,
                "load1": round(load1[instance], 2) if instance in load1 else None,
                "temperature_c": round(temp_value, 2)
                if temp_value is not None
                else None,
            }
        )

    return nodes


def _average(values: list[float | None]) -> float | None:
    clean_values = [value for value in values if value is not None]

    if not clean_values:
        return None

    return round(sum(clean_values) / len(clean_values), 2)


def _maximum(values: list[float | None]) -> float | None:
    clean_values = [value for value in values if value is not None]

    if not clean_values:
        return None

    return round(max(clean_values), 2)


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
        "app": app_name,
        "status": pod.status.phase or "Unknown",
        "ready": f"{ready_containers}/{total_containers}",
        "ready_bool": total_containers > 0 and ready_containers == total_containers,
        "restarts": restarts,
        "node": pod.spec.node_name,
        "age_seconds": _pod_age_seconds(pod.metadata.creation_timestamp),
        "labels": labels,
    }


def _get_kubernetes_pods() -> tuple[list[dict[str, Any]], str | None]:
    try:
        from kubernetes import client

        _load_kubernetes_config()

        core_v1 = client.CoreV1Api()
        pod_list = core_v1.list_namespaced_pod(namespace=KUBERNETES_NAMESPACE)

        pods = [_format_pod(pod) for pod in pod_list.items]
        pods = sorted(pods, key=lambda item: item["name"])

        return pods, None

    except Exception as exc:
        return [], str(exc)


def _count_workload(pods: list[dict[str, Any]], keywords: list[str]) -> int:
    count = 0

    for pod in pods:
        searchable = " ".join(
            [
                pod.get("name", ""),
                pod.get("app", ""),
                " ".join(str(value) for value in pod.get("labels", {}).values()),
            ]
        ).lower()

        if any(keyword in searchable for keyword in keywords):
            count += 1

    return count


def _get_cluster_score(
    online_nodes: int,
    total_nodes: int,
    ready_pods: int,
    total_pods: int,
    total_restarts: int,
) -> int:
    if total_nodes == 0 and total_pods == 0:
        return 0

    node_score = (online_nodes / total_nodes) * 50 if total_nodes else 0
    pod_score = (ready_pods / total_pods) * 50 if total_pods else 0

    restart_penalty = min(total_restarts * 2, 20)

    score = round(node_score + pod_score - restart_penalty)

    return max(0, min(score, 100))


@router.get("/overview")
def get_cluster_performance_overview():
    nodes = _get_node_metrics()
    pods, kubernetes_error = _get_kubernetes_pods()

    total_nodes = len(nodes)
    online_nodes = len([node for node in nodes if node["status"] == "online"])
    offline_nodes = total_nodes - online_nodes

    total_pods = len(pods)
    running_pods = len([pod for pod in pods if pod["status"] == "Running"])
    ready_pods = len([pod for pod in pods if pod["ready_bool"]])
    total_restarts = sum(pod["restarts"] for pod in pods)

    avg_cpu = _average([node["cpu_percent"] for node in nodes])
    avg_memory = _average([node["memory_percent"] for node in nodes])
    avg_disk = _average([node["disk_percent"] for node in nodes])
    avg_load1 = _average([node["load1"] for node in nodes])
    max_temperature = _maximum([node["temperature_c"] for node in nodes])

    hottest_nodes = sorted(
        [node for node in nodes if node["temperature_c"] is not None],
        key=lambda node: node["temperature_c"],
        reverse=True,
    )[:5]

    most_restarted_pods = sorted(
        pods,
        key=lambda pod: pod["restarts"],
        reverse=True,
    )[:5]

    cluster_score = _get_cluster_score(
        online_nodes=online_nodes,
        total_nodes=total_nodes,
        ready_pods=ready_pods,
        total_pods=total_pods,
        total_restarts=total_restarts,
    )

    if cluster_score >= 85:
        cluster_status = "healthy"
    elif cluster_score >= 60:
        cluster_status = "degraded"
    else:
        cluster_status = "critical"

    return {
        "timestamp": _now_iso(),
        "status": cluster_status,
        "cluster_score": cluster_score,
        "prometheus_url": PROMETHEUS_URL,
        "namespace": KUBERNETES_NAMESPACE,
        "summary": {
            "total_nodes": total_nodes,
            "online_nodes": online_nodes,
            "offline_nodes": offline_nodes,
            "total_pods": total_pods,
            "running_pods": running_pods,
            "ready_pods": ready_pods,
            "total_restarts": total_restarts,
        },
        "resources": {
            "avg_cpu_percent": avg_cpu,
            "avg_memory_percent": avg_memory,
            "avg_disk_percent": avg_disk,
            "avg_load1": avg_load1,
            "max_temperature_c": max_temperature,
        },
        "workloads": {
            "backend_pods": _count_workload(pods, ["backend"]),
            "inference_pods": _count_workload(pods, ["inference", "yolo", "model"]),
            "image_worker_pods": _count_workload(pods, ["image-worker", "worker"]),
            "telegram_pods": _count_workload(pods, ["telegram"]),
            "storage_pods": _count_workload(pods, ["seaweed", "storage", "s3"]),
        },
        "nodes": nodes,
        "pods": pods,
        "hottest_nodes": hottest_nodes,
        "most_restarted_pods": most_restarted_pods,
        "errors": {
            "kubernetes": kubernetes_error,
        },
    }
