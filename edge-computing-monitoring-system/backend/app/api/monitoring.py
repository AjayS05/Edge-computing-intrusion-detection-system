import json
import os
import subprocess
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1/monitoring", tags=["monitoring"])

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://127.0.0.1:9090")

TEMP_WARNING = 60.0
TEMP_CRITICAL = 70.0


def prometheus_query(query: str, timeout: int = 4):
    url = f"{PROMETHEUS_URL}/api/v1/query?{urlencode({'query': query})}"

    try:
        with urlopen(url, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))

        if data.get("status") != "success":
            return [], "Prometheus query unsuccessful"

        return data.get("data", {}).get("result", []), None

    except Exception as exc:
        return [], str(exc)


def get_metric_name(metric: dict) -> str:
    return (
        metric.get("nodename")
        or metric.get("instance")
        or metric.get("node")
        or metric.get("job")
        or "unknown-node"
    )


def classify_node(instance: str, nodename: str):
    value = f"{instance} {nodename}".lower()

    if "pi5" in value or "rpi5" in value or "192.168.50.1" in value:
        return "pi5_master"

    if "pi4" in value or "rpi4" in value:
        return "pi4_sensor"

    if "pi3" in value or "rpi3" in value:
        return "pi3_worker"

    if "192.168.50.10" in value:
        return "pi3_worker"

    return "unknown"


def get_service_status_from_systemd(service_name: str | None):
    if not service_name:
        return "unknown"

    try:
        result = subprocess.run(
            ["systemctl", "is-active", service_name],
            capture_output=True,
            text=True,
            timeout=3,
        )

        status = result.stdout.strip()

        if status == "active":
            return "running"

        if status in ["inactive", "failed", "deactivating"]:
            return status

        return "unknown"

    except Exception:
        return "unknown"


def get_cluster_nodes():
    queries = [
        'up{job=~".*node.*|.*node_exporter.*|.*node-exporter.*"}',
        "up",
    ]

    results = []
    prometheus_error = None

    for query in queries:
        results, prometheus_error = prometheus_query(query)
        if results:
            break

    nodes = []

    for item in results:
        metric = item.get("metric", {})
        value = item.get("value", [None, "0"])

        instance = metric.get("instance", "unknown")
        nodename = metric.get("nodename", get_metric_name(metric))
        job = metric.get("job", "unknown")
        is_online = str(value[1]) == "1"

        nodes.append(
            {
                "name": nodename,
                "instance": instance,
                "job": job,
                "role": classify_node(instance, nodename),
                "status": "online" if is_online else "offline",
            }
        )

    pi3_workers = [node for node in nodes if node["role"] == "pi3_worker"]

    return {
        "prometheus_error": prometheus_error,
        "nodes": nodes,
        "pi5_master": [
            node for node in nodes if node["role"] == "pi5_master"
        ],
        "pi4_sensor": [
            node for node in nodes if node["role"] == "pi4_sensor"
        ],
        "pi3_workers": {
            "total": len(pi3_workers),
            "online": len([node for node in pi3_workers if node["status"] == "online"]),
            "offline": len([node for node in pi3_workers if node["status"] == "offline"]),
            "nodes": pi3_workers,
        },
    }


def get_temperatures():
    queries = [
        "max by(instance) (node_hwmon_temp_celsius)",
        "max by(instance) (node_thermal_zone_temp)",
        "max by(instance) (raspberry_pi_temperature_celsius)",
    ]

    results = []
    used_query = None
    error = None

    for query in queries:
        results, error = prometheus_query(query)
        if results:
            used_query = query
            break

    temperatures = []

    for item in results:
        metric = item.get("metric", {})
        value = item.get("value", [None, "0"])

        try:
            temp_value = float(value[1])
        except Exception:
            continue

        if temp_value >= TEMP_CRITICAL:
            status = "critical"
        elif temp_value >= TEMP_WARNING:
            status = "warning"
        else:
            status = "normal"

        temperatures.append(
            {
                "instance": metric.get("instance", "unknown"),
                "temperature_celsius": round(temp_value, 2),
                "status": status,
            }
        )

    return {
        "metric_found": bool(results),
        "query_used": used_query,
        "error": error,
        "temperatures": temperatures,
    }


@router.get("/overview")
def monitoring_overview():
    cluster = get_cluster_nodes()
    temperature_data = get_temperatures()

    yolo_service_name = os.getenv("YOLO_SERVICE_NAME")
    telegram_service_name = os.getenv("TELEGRAM_SERVICE_NAME")

    alerts = []

    for node in cluster["nodes"]:
        if node["status"] == "offline":
            alerts.append(
                {
                    "type": "critical",
                    "title": "Node down",
                    "message": f'{node["name"]} ({node["instance"]}) is offline.',
                }
            )

    for temp in temperature_data["temperatures"]:
        if temp["status"] == "critical":
            alerts.append(
                {
                    "type": "critical",
                    "title": "High temperature",
                    "message": f'{temp["instance"]} is at {temp["temperature_celsius"]}°C.',
                }
            )
        elif temp["status"] == "warning":
            alerts.append(
                {
                    "type": "warning",
                    "title": "Temperature warning",
                    "message": f'{temp["instance"]} is at {temp["temperature_celsius"]}°C.',
                }
            )

    if not temperature_data["metric_found"]:
        alerts.append(
            {
                "type": "info",
                "title": "Temperature metric unavailable",
                "message": "Prometheus is working, but no Raspberry Pi temperature metric was found.",
            }
        )

    if not alerts:
        alerts.append(
            {
                "type": "ok",
                "title": "No active monitoring alerts",
                "message": "All monitored nodes appear healthy.",
            }
        )

    return {
        "backend": {
            "status": "online",
        },
        "services": {
            "yolo": get_service_status_from_systemd(yolo_service_name),
            "telegram_bot": get_service_status_from_systemd(telegram_service_name),
        },
        "cluster": cluster,
        "temperatures": temperature_data,
        "alerts": alerts,
    }
