import json
import os
import subprocess
import time
from urllib.parse import urlencode
from urllib.request import urlopen

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/v1/monitoring", tags=["monitoring"])

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://127.0.0.1:9090")

YOLO_SERVICE_NAME = os.getenv("YOLO_SERVICE_NAME", "yolo")
TELEGRAM_SERVICE_NAME = os.getenv("TELEGRAM_SERVICE_NAME", "telegram-bot")

TEMP_WARNING = 60.0
TEMP_CRITICAL = 70.0

CPU_WARNING = 80.0
CPU_CRITICAL = 90.0

MEMORY_WARNING = 80.0
MEMORY_CRITICAL = 90.0

DISK_WARNING = 80.0
DISK_CRITICAL = 90.0


def env_set(name: str, default: str = ""):
    return {
        item.strip()
        for item in os.getenv(name, default).split(",")
        if item.strip()
    }


PI5_IPS = env_set(
    "PI5_IPS",
    "127.0.0.1,localhost,192.168.178.200,192.168.50.1",
)

PI4_IPS = env_set("PI4_IPS", "")


def clean_query(query: str) -> str:
    return " ".join(query.strip().split())


def prometheus_query(query: str, timeout: int = 4):
    url = f"{PROMETHEUS_URL}/api/v1/query?{urlencode({'query': clean_query(query)})}"

    try:
        with urlopen(url, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))

        if body.get("status") != "success":
            return [], body.get("error", "Prometheus query failed")

        return body.get("data", {}).get("result", []), None

    except Exception as e:
        return [], str(e)


def prometheus_range_query(
    query: str,
    minutes: int = 30,
    step: str = "60s",
    timeout: int = 6,
):
    end = int(time.time())
    start = end - minutes * 60

    params = urlencode(
        {
            "query": clean_query(query),
            "start": start,
            "end": end,
            "step": step,
        }
    )

    url = f"{PROMETHEUS_URL}/api/v1/query_range?{params}"

    try:
        with urlopen(url, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))

        if body.get("status") != "success":
            return [], body.get("error", "Prometheus range query failed")

        return body.get("data", {}).get("result", []), None

    except Exception as e:
        return [], str(e)


def value_to_float(item):
    try:
        return float(item["value"][1])
    except Exception:
        return None


def round_or_none(value, digits=2):
    if value is None:
        return None
    return round(value, digits)


def result_to_instance_map(result):
    data = {}

    for item in result:
        instance = item.get("metric", {}).get("instance")
        value = value_to_float(item)

        if instance and value is not None:
            data[instance] = value

    return data


def result_to_node_info_map(result):
    data = {}

    for item in result:
        metric = item.get("metric", {})
        instance = metric.get("instance")

        if not instance:
            continue

        data[instance] = {
            "nodename": metric.get("nodename"),
            "machine": metric.get("machine"),
            "release": metric.get("release"),
            "sysname": metric.get("sysname"),
            "version": metric.get("version"),
        }

    return data


def average(values):
    valid = [value for value in values if value is not None]

    if not valid:
        return None

    return sum(valid) / len(valid)


def max_or_none(values):
    valid = [value for value in values if value is not None]

    if not valid:
        return None

    return max(valid)


def extract_ip(instance: str):
    if not instance:
        return "unknown"

    if instance.startswith("[") and "]" in instance:
        return instance.split("]")[0].replace("[", "")

    return instance.split(":")[0]


def guess_role(instance: str, metric: dict | None = None):
    metric = metric or {}

    if metric.get("role"):
        return metric.get("role")

    ip = extract_ip(instance)

    if ip in PI5_IPS:
        return "pi5_master"

    if ip in PI4_IPS:
        return "pi4_camera"

    if ip.startswith("192.168.50.10"):
        return "pi_worker"

    return "unknown"


def status_from_percent(value, warning, critical):
    if value is None:
        return "unknown"

    if value >= critical:
        return "critical"

    if value >= warning:
        return "warning"

    return "normal"


def temperature_status(temp_c):
    return status_from_percent(temp_c, TEMP_WARNING, TEMP_CRITICAL)


def cpu_status(cpu_percent):
    return status_from_percent(cpu_percent, CPU_WARNING, CPU_CRITICAL)


def memory_status(memory_percent):
    return status_from_percent(memory_percent, MEMORY_WARNING, MEMORY_CRITICAL)


def disk_status(disk_percent):
    return status_from_percent(disk_percent, DISK_WARNING, DISK_CRITICAL)


def service_status(service_name: str):
    try:
        result = subprocess.run(
            ["systemctl", "is-active", service_name],
            capture_output=True,
            text=True,
            timeout=2,
        )

        status = result.stdout.strip()

        if status == "active":
            return "online"

        if status in ["inactive", "failed"]:
            return "offline"

        return "unknown"

    except Exception:
        return "unknown"


def make_alert(alerts, severity, alert_type, message, instance=None):
    alerts.append(
        {
            "severity": severity,
            "type": alert_type,
            "message": message,
            "instance": instance,
            "timestamp": int(time.time()),
        }
    )


def add_threshold_alert(
    alerts,
    node_name,
    instance,
    metric_name,
    value,
    warning_threshold,
    critical_threshold,
    unit,
):
    if value is None:
        return

    rounded = round(value, 1)

    if value >= critical_threshold:
        make_alert(
            alerts,
            "critical",
            metric_name,
            f"{node_name} {metric_name} is critical: {rounded}{unit}",
            instance,
        )

    elif value >= warning_threshold:
        make_alert(
            alerts,
            "warning",
            metric_name,
            f"{node_name} {metric_name} is high: {rounded}{unit}",
            instance,
        )


def range_result_to_chart(result):
    series = []

    for item in result:
        instance = item.get("metric", {}).get("instance", "unknown")
        values = item.get("values", [])

        points = []

        for timestamp, value in values:
            try:
                points.append(
                    {
                        "time": int(float(timestamp)),
                        "value": round(float(value), 2),
                    }
                )
            except Exception:
                continue

        series.append(
            {
                "instance": instance,
                "points": points,
            }
        )

    return series


@router.get("/overview")
def monitoring_overview(
    include_charts: bool = Query(True),
    chart_minutes: int = Query(30, ge=5, le=360),
    chart_step: str = Query("60s"),
):
    query_errors = []
    alerts = []

    # -----------------------------
    # Node online/offline status
    # -----------------------------
    up_result, up_error = prometheus_query('up{job="node"}')

    if up_error or not up_result:
        up_result, up_error = prometheus_query('up{instance=~".*:9100"}')

    if up_error:
        query_errors.append({"query": "up", "error": up_error})

    # -----------------------------
    # Node system info
    # -----------------------------
    node_info_result, node_info_error = prometheus_query("node_uname_info")

    if node_info_error:
        query_errors.append({"query": "node_uname_info", "error": node_info_error})

    node_info_by_instance = result_to_node_info_map(node_info_result)

    # -----------------------------
    # CPU usage percentage
    # -----------------------------
    cpu_query = """
    100 - (
      avg by(instance) (
        rate(node_cpu_seconds_total{mode="idle"}[2m])
      ) * 100
    )
    """

    cpu_result, cpu_error = prometheus_query(cpu_query)

    if cpu_error:
        query_errors.append({"query": "cpu", "error": cpu_error})

    cpu_by_instance = result_to_instance_map(cpu_result)

    # -----------------------------
    # Memory usage percentage
    # -----------------------------
    memory_query = """
    100 * (
      1 - (
        node_memory_MemAvailable_bytes
        /
        node_memory_MemTotal_bytes
      )
    )
    """

    memory_result, memory_error = prometheus_query(memory_query)

    if memory_error:
        query_errors.append({"query": "memory", "error": memory_error})

    memory_by_instance = result_to_instance_map(memory_result)

    # -----------------------------
    # Disk usage percentage for root filesystem
    # -----------------------------
    disk_query = """
    max by(instance) (
      100 * (
        1 - (
          node_filesystem_avail_bytes{
            mountpoint="/",
            fstype!~"tmpfs|overlay|squashfs"
          }
          /
          node_filesystem_size_bytes{
            mountpoint="/",
            fstype!~"tmpfs|overlay|squashfs"
          }
        )
      )
    )
    """

    disk_result, disk_error = prometheus_query(disk_query)

    if disk_error:
        query_errors.append({"query": "disk", "error": disk_error})

    disk_by_instance = result_to_instance_map(disk_result)

    # -----------------------------
    # Raspberry Pi temperature
    # Your screenshot confirms these metrics exist:
    # node_hwmon_temp_celsius
    # node_thermal_zone_temp
    # -----------------------------
    temperature_query = """
    max by(instance) (node_hwmon_temp_celsius)
    or
    max by(instance) (node_thermal_zone_temp)
    or
    max by(instance) (raspberry_pi_temperature_celsius)
    """

    temperature_result, temperature_error = prometheus_query(temperature_query)

    if temperature_error:
        query_errors.append({"query": "temperature", "error": temperature_error})

    temperature_by_instance = result_to_instance_map(temperature_result)

    # -----------------------------
    # Network receive bytes/sec
    # -----------------------------
    network_rx_query = """
    sum by(instance) (
      rate(node_network_receive_bytes_total{
        device!~"lo|veth.*|docker.*|cni.*|flannel.*"
      }[2m])
    )
    """

    network_rx_result, network_rx_error = prometheus_query(network_rx_query)

    if network_rx_error:
        query_errors.append({"query": "network_rx", "error": network_rx_error})

    network_rx_by_instance = result_to_instance_map(network_rx_result)

    # -----------------------------
    # Network transmit bytes/sec
    # -----------------------------
    network_tx_query = """
    sum by(instance) (
      rate(node_network_transmit_bytes_total{
        device!~"lo|veth.*|docker.*|cni.*|flannel.*"
      }[2m])
    )
    """

    network_tx_result, network_tx_error = prometheus_query(network_tx_query)

    if network_tx_error:
        query_errors.append({"query": "network_tx", "error": network_tx_error})

    network_tx_by_instance = result_to_instance_map(network_tx_result)

    # -----------------------------
    # Load average
    # -----------------------------
    load1_result, load1_error = prometheus_query("node_load1")
    load5_result, load5_error = prometheus_query("node_load5")
    load15_result, load15_error = prometheus_query("node_load15")

    if load1_error:
        query_errors.append({"query": "node_load1", "error": load1_error})
    if load5_error:
        query_errors.append({"query": "node_load5", "error": load5_error})
    if load15_error:
        query_errors.append({"query": "node_load15", "error": load15_error})

    load1_by_instance = result_to_instance_map(load1_result)
    load5_by_instance = result_to_instance_map(load5_result)
    load15_by_instance = result_to_instance_map(load15_result)

    # -----------------------------
    # Uptime seconds
    # -----------------------------
    uptime_query = """
    time() - node_boot_time_seconds
    """

    uptime_result, uptime_error = prometheus_query(uptime_query)

    if uptime_error:
        query_errors.append({"query": "uptime", "error": uptime_error})

    uptime_by_instance = result_to_instance_map(uptime_result)

    # -----------------------------
    # Build frontend-ready nodes
    # -----------------------------
    nodes = []

    for item in up_result:
        metric = item.get("metric", {})
        instance = metric.get("instance", "unknown")

        up_value = value_to_float(item)
        status = "online" if up_value == 1 else "offline"

        node_info = node_info_by_instance.get(instance, {})

        node_name = (
            metric.get("nodename")
            or node_info.get("nodename")
            or metric.get("name")
            or instance
        )

        cpu_percent = cpu_by_instance.get(instance)
        memory_percent = memory_by_instance.get(instance)
        disk_percent = disk_by_instance.get(instance)
        temperature_c = temperature_by_instance.get(instance)

        network_rx_bps = network_rx_by_instance.get(instance)
        network_tx_bps = network_tx_by_instance.get(instance)

        load1 = load1_by_instance.get(instance)
        load5 = load5_by_instance.get(instance)
        load15 = load15_by_instance.get(instance)

        uptime_seconds = uptime_by_instance.get(instance)

        node = {
            "name": node_name,
            "instance": instance,
            "ip": extract_ip(instance),
            "job": metric.get("job", "node"),
            "role": guess_role(instance, metric),
            "status": status,

            "cpu_percent": round_or_none(cpu_percent),
            "cpu_status": cpu_status(cpu_percent),

            "memory_percent": round_or_none(memory_percent),
            "memory_status": memory_status(memory_percent),

            "disk_percent": round_or_none(disk_percent),
            "disk_status": disk_status(disk_percent),

            "temperature_c": round_or_none(temperature_c),
            "temperature_status": temperature_status(temperature_c),

            "network_rx_bps": round_or_none(network_rx_bps),
            "network_tx_bps": round_or_none(network_tx_bps),

            "load": {
                "load1": round_or_none(load1),
                "load5": round_or_none(load5),
                "load15": round_or_none(load15),
            },

            "uptime_seconds": round_or_none(uptime_seconds, 0),

            "system": {
                "nodename": node_info.get("nodename"),
                "machine": node_info.get("machine"),
                "release": node_info.get("release"),
                "sysname": node_info.get("sysname"),
            },
        }

        nodes.append(node)

        if status == "offline":
            make_alert(
                alerts,
                "critical",
                "node_down",
                f"{node_name} is offline",
                instance,
            )

        add_threshold_alert(
            alerts,
            node_name,
            instance,
            "temperature",
            temperature_c,
            TEMP_WARNING,
            TEMP_CRITICAL,
            "°C",
        )

        add_threshold_alert(
            alerts,
            node_name,
            instance,
            "cpu",
            cpu_percent,
            CPU_WARNING,
            CPU_CRITICAL,
            "%",
        )

        add_threshold_alert(
            alerts,
            node_name,
            instance,
            "memory",
            memory_percent,
            MEMORY_WARNING,
            MEMORY_CRITICAL,
            "%",
        )

        add_threshold_alert(
            alerts,
            node_name,
            instance,
            "disk",
            disk_percent,
            DISK_WARNING,
            DISK_CRITICAL,
            "%",
        )

    online_nodes = len([node for node in nodes if node["status"] == "online"])
    offline_nodes = len([node for node in nodes if node["status"] == "offline"])

    cpu_values = [node["cpu_percent"] for node in nodes]
    memory_values = [node["memory_percent"] for node in nodes]
    disk_values = [node["disk_percent"] for node in nodes]
    temperature_values = [node["temperature_c"] for node in nodes]

    yolo_status = service_status(YOLO_SERVICE_NAME)
    telegram_status = service_status(TELEGRAM_SERVICE_NAME)

    charts = {}

    if include_charts:
        cpu_range_result, cpu_range_error = prometheus_range_query(
            cpu_query,
            minutes=chart_minutes,
            step=chart_step,
        )

        memory_range_result, memory_range_error = prometheus_range_query(
            memory_query,
            minutes=chart_minutes,
            step=chart_step,
        )

        temperature_range_result, temperature_range_error = prometheus_range_query(
            temperature_query,
            minutes=chart_minutes,
            step=chart_step,
        )

        load_range_result, load_range_error = prometheus_range_query(
            "node_load1",
            minutes=chart_minutes,
            step=chart_step,
        )

        if cpu_range_error:
            query_errors.append({"query": "cpu_chart", "error": cpu_range_error})
        if memory_range_error:
            query_errors.append({"query": "memory_chart", "error": memory_range_error})
        if temperature_range_error:
            query_errors.append(
                {"query": "temperature_chart", "error": temperature_range_error}
            )
        if load_range_error:
            query_errors.append({"query": "load_chart", "error": load_range_error})

        charts = {
            "cpu_percent": range_result_to_chart(cpu_range_result),
            "memory_percent": range_result_to_chart(memory_range_result),
            "temperature_c": range_result_to_chart(temperature_range_result),
            "load1": range_result_to_chart(load_range_result),
        }

    cluster_status = "healthy"

    if offline_nodes > 0:
        cluster_status = "degraded"

    if len(nodes) == 0:
        cluster_status = "unknown"

    return {
        "backend": {
            "status": "online",
            "timestamp": int(time.time()),
            "prometheus_url": PROMETHEUS_URL,
        },

        "services": {
            "yolo": yolo_status,
            "telegram_bot": telegram_status,
        },

        "summary": {
            "total_nodes": len(nodes),
            "online_nodes": online_nodes,
            "offline_nodes": offline_nodes,

            "avg_cpu_percent": round_or_none(average(cpu_values)),
            "avg_memory_percent": round_or_none(average(memory_values)),
            "avg_disk_percent": round_or_none(average(disk_values)),
            "max_temperature_c": round_or_none(max_or_none(temperature_values)),

            "critical_alerts": len(
                [alert for alert in alerts if alert["severity"] == "critical"]
            ),
            "warning_alerts": len(
                [alert for alert in alerts if alert["severity"] == "warning"]
            ),
        },

        "cluster": {
            "status": cluster_status,
            "nodes": nodes,
        },

        "alerts": alerts,

        "charts": charts,

        "debug": {
            "prometheus_errors": query_errors,
        },
    }


@router.get("/metric-names")
def metric_names():
    result, error = prometheus_query('group by (__name__) ({job="node"})')

    names = []

    for item in result:
        name = item.get("metric", {}).get("__name__")

        if name:
            names.append(name)

    return {
        "error": error,
        "count": len(names),
        "metrics": sorted(names),
    }


@router.get("/raw")
def raw_node_metrics():
    result, error = prometheus_query('{job="node"}')

    return {
        "error": error,
        "count": len(result),
        "metrics": result,
    }
