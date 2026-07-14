# Grafana Dashboards

> Grafana deployment and dashboard configuration for the Raspberry Pi edge-monitoring cluster.

**Namespace:** `monitoring`  
**Service:** `prometheus-grafana`  
**Data source:** Prometheus  
**Related documentation:** [Monitoring overview](monitoring.md) · [Prometheus](prometheus.md)

---

## Overview

Grafana provides real-time and historical visualization of the metrics collected by Prometheus from Pi5, Pi4, and the eight Pi3 workers. The dashboard helps the team observe cluster health while intrusion detection, image processing, storage, and inference workloads are running.

The dashboard displays:

- Node availability
- CPU utilization
- Memory utilization
- Disk utilization
- Network receive and transmit rates
- Raspberry Pi temperature
- System load and uptime

Grafana is also useful during performance experiments because it makes resource changes visible before, during, and after inference workloads.

> **IMAGE REQUIRED — Complete dashboard**  
> Save as: `images/monitoring/grafana-dashboard-overview.png`  
> Capture the complete dashboard with the Job set to `raspberry-pi-nodes`, several live panels, the selected time range, and no credentials visible. Replace this placeholder with:  
> `![Complete Raspberry Pi Grafana dashboard](images/monitoring/grafana-dashboard-overview.png)`

---

## Grafana Deployment

Grafana is installed as part of `kube-prometheus-stack`. It is enabled in `prometheus-k3s-values.yaml`:

```yaml
grafana:
  enabled: true
  replicas: 1
```

Deploy the monitoring stack:

```bash
helm upgrade --install prometheus \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f prometheus-k3s-values.yaml \
  --set nodeExporter.enabled=false \
  --timeout 30m
```

Check the Grafana pod and service:

```bash
kubectl get pods -n monitoring | grep grafana
kubectl get svc -n monitoring | grep grafana
```

The Grafana pod should show all containers ready:

```text
3/3 Running
```

![Grafana pod running in the monitoring namespace](images/monitoring/prometheus-grafana-pod.png)

The screenshot above is valid evidence: the Grafana pod reports `3/3` containers ready and `Running`.

![Grafana and Prometheus services in the monitoring namespace](images/monitoring/grafana-monitoring-services.png)

The service output confirms that Grafana is exposed as a NodePort service on port `30300` and Prometheus on port `30090`.

---

## Accessing Grafana

Grafana is exposed by the configured NodePort and can be accessed directly at:

```text
http://<K3S-NODE-IP>:30300
```

For this deployment, use:

```text
http://192.168.178.200:30300
```

If NodePort access is unavailable, use temporary port forwarding:

```bash
kubectl port-forward --address 0.0.0.0 \
  -n monitoring \
  svc/prometheus-grafana \
  3001:80
```

Then open:

```text
http://192.168.178.200:3001
```

Retrieve the administrator password:

```bash
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath='{.data.admin-password}' \
  | base64 -d

echo
```

Use the following username:

```text
admin
```

Do not add the administrator password to Git, screenshots, or documentation.

> **OPTIONAL IMAGE — Grafana login**  
> Save as: `images/monitoring/grafana-login.png`  
> Capture the login page without displaying credentials. Replace this placeholder with:  
> `![Grafana login page](images/monitoring/grafana-login.png)`

---

## Prometheus Data Source Configuration

The Helm chart normally provisions Prometheus automatically as a Grafana data source. Verify the configuration inside Grafana:

1. Open **Connections**.
2. Select **Data sources**.
3. Open **Prometheus**.
4. Confirm the Prometheus service URL.
5. Select **Save & test**.
6. Confirm that the connection succeeds.

Use the regular Prometheus service created by the Helm release:

```text
http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

Kubernetes service DNS is used because Grafana and Prometheus run inside the same K3s cluster.

> **IMAGE REQUIRED — Prometheus data source**  
> Save as: `images/monitoring/grafana-prometheus-datasource.png`  
> Capture the Prometheus URL and successful **Save & test** response. Do not expose credentials. Replace this placeholder with:  
> `![Successful Prometheus data-source connection](images/monitoring/grafana-prometheus-datasource.png)`

---

## Dashboard Creation

The dashboard can be created manually or initialized using the Node Exporter Full community dashboard.

### Import the base dashboard

1. Open **Dashboards**.
2. Select **New** and then **Import**.
3. Enter dashboard ID `1860`.
4. Select **Load**.
5. Choose the Prometheus data source.
6. Select **Import**.

The imported dashboard is named **Node Exporter Full**.

### Configure dashboard variables

Use the following selections:

- **Datasource:** Prometheus
- **Job:** `raspberry-pi-nodes`
- **Instance/Nodename:** required Raspberry Pi
- **Time range:** Last 15 minutes
- **Refresh interval:** 10 seconds

### Create a custom panel

For each panel described below:

1. Open the dashboard.
2. Select **Add** and then **Visualization**.
3. Choose the Prometheus data source.
4. Paste the provided PromQL expression.
5. Select the suggested visualization.
6. Configure the title, unit, legend, and thresholds.
7. Select **Apply**.
8. Save the dashboard.

> **OPTIONAL IMAGE — Dashboard editor**  
> Save as: `images/monitoring/grafana-dashboard-editor.png`  
> Capture one panel editor with its PromQL query and preview visible. Replace this placeholder with:  
> `![Grafana panel configuration](images/monitoring/grafana-dashboard-editor.png)`

---

## Node Availability Panel

This panel shows whether Prometheus can reach each Raspberry Pi Node Exporter.

```promql
up{job="raspberry-pi-nodes"}
```

Recommended settings:

| Setting | Value |
|---|---|
| Visualization | Stat or State timeline |
| Title | Node Availability |
| Unit | Short |
| Value `1` | Online / green |
| Value `0` | Offline / red |
| Legend | `{{instance}}` |

A stat panel is suitable for a compact cluster overview. A state timeline is useful when historical availability must be shown.

> **IMAGE REQUIRED — Node availability**  
> Save as: `images/monitoring/grafana-node-availability.png`  
> Replace this placeholder with: `![Node availability panel](images/monitoring/grafana-node-availability.png)`

---

## CPU Usage Panel

CPU utilization is calculated from the non-idle CPU time reported by Node Exporter.

```promql
100 - (
  avg by(instance) (
    rate(node_cpu_seconds_total{
      job="raspberry-pi-nodes",
      mode="idle"
    }[2m])
  ) * 100
)
```

Recommended settings:

| Setting | Value |
|---|---|
| Visualization | Time series |
| Title | CPU Usage by Node |
| Unit | Percent (0–100) |
| Minimum | `0` |
| Maximum | `100` |
| Warning threshold | `80` |
| Critical threshold | `90` |
| Legend | `{{instance}}` |

> **IMAGE REQUIRED — CPU panel**  
> Save as: `images/monitoring/grafana-cpu-panel.png`  
> Replace this placeholder with: `![CPU usage panel](images/monitoring/grafana-cpu-panel.png)`

---

## Memory Usage Panel

Memory utilization is calculated using total memory and currently available memory.

```promql
100 * (
  1 - (
    node_memory_MemAvailable_bytes{job="raspberry-pi-nodes"}
    /
    node_memory_MemTotal_bytes{job="raspberry-pi-nodes"}
  )
)
```

Recommended settings:

| Setting | Value |
|---|---|
| Visualization | Time series or Gauge |
| Title | Memory Usage by Node |
| Unit | Percent (0–100) |
| Minimum | `0` |
| Maximum | `100` |
| Warning threshold | `80` |
| Critical threshold | `90` |
| Legend | `{{instance}}` |

> **IMAGE REQUIRED — Memory panel**  
> Save as: `images/monitoring/grafana-memory-panel.png`  
> Replace this placeholder with: `![Memory usage panel](images/monitoring/grafana-memory-panel.png)`

---

## Disk Usage Panel

This query calculates root filesystem utilization while excluding temporary and container filesystems.

```promql
100 * (
  1 - (
    node_filesystem_avail_bytes{
      job="raspberry-pi-nodes",
      mountpoint="/",
      fstype!~"tmpfs|overlay|squashfs"
    }
    /
    node_filesystem_size_bytes{
      job="raspberry-pi-nodes",
      mountpoint="/",
      fstype!~"tmpfs|overlay|squashfs"
    }
  )
)
```

Recommended settings:

| Setting | Value |
|---|---|
| Visualization | Bar gauge or Gauge |
| Title | Root Disk Usage |
| Unit | Percent (0–100) |
| Minimum | `0` |
| Maximum | `100` |
| Warning threshold | `80` |
| Critical threshold | `90` |
| Legend | `{{instance}}` |

> **IMAGE REQUIRED — Disk panel**  
> Save as: `images/monitoring/grafana-disk-panel.png`  
> Replace this placeholder with: `![Disk usage panel](images/monitoring/grafana-disk-panel.png)`

---

## Network Traffic Panel

Create two queries in the same time-series panel.

### Query A — Receive rate

```promql
sum by(instance) (
  rate(node_network_receive_bytes_total{
    job="raspberry-pi-nodes",
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

### Query B — Transmit rate

```promql
sum by(instance) (
  rate(node_network_transmit_bytes_total{
    job="raspberry-pi-nodes",
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

Recommended settings:

| Setting | Value |
|---|---|
| Visualization | Time series |
| Title | Network Traffic by Node |
| Unit | Bytes/second (Bps) |
| Query A legend | `RX {{instance}}` |
| Query B legend | `TX {{instance}}` |

> **IMAGE REQUIRED — Network panel**  
> Save as: `images/monitoring/grafana-network-panel.png`  
> Replace this placeholder with: `![Network traffic panel](images/monitoring/grafana-network-panel.png)`

---

## Temperature Panel

Use the temperature metric exposed by the Raspberry Pi Node Exporter environment.

Primary query:

```promql
max by(instance) (
  node_hwmon_temp_celsius{job="raspberry-pi-nodes"}
)
```

Alternative query:

```promql
max by(instance) (
  node_thermal_zone_temp{job="raspberry-pi-nodes"}
)
```

Recommended settings:

| Setting | Value |
|---|---|
| Visualization | Time series or Gauge |
| Title | Raspberry Pi Temperature |
| Unit | Celsius (°C) |
| Warning threshold | `60` |
| Critical threshold | `70` |
| Legend | `{{instance}}` |

Use the query that returns temperature data in Prometheus. Some nodes may not expose the same temperature metric depending on hardware and operating-system support.

> **IMAGE REQUIRED — Temperature panel**  
> Save as: `images/monitoring/grafana-temperature-panel.png`  
> Replace this placeholder with: `![Raspberry Pi temperature panel](images/monitoring/grafana-temperature-panel.png)`

---

## Dashboard Verification

Confirm that Grafana is receiving live Prometheus data:

1. Select `raspberry-pi-nodes` from the Job variable.
2. Select individual Pi5, Pi4, and Pi3 instances.
3. Set the time range to **Last 15 minutes**.
4. Set refresh to `10s`.
5. Confirm that CPU, memory, disk, and network panels update.
6. Confirm that `up` displays `1` for reachable nodes.
7. Confirm that the values correspond with the same PromQL queries in Prometheus.

The dashboard is successfully verified when live values are visible for the selected nodes and new samples appear after each refresh interval.

Some panels may show `N/A` when a metric is not supported by a particular Raspberry Pi, operating system, filesystem, or Node Exporter version. This does not invalidate the dashboard when the core availability, CPU, memory, disk, network, uptime, and load metrics are present.

> **IMAGE REQUIRED — Verified dashboard**  
> Save as: `images/monitoring/grafana-dashboard-verified.png`  
> Capture the final dashboard showing several nodes, live values, the Job selection, and the time range. Replace this placeholder with:  
> `![Verified Grafana dashboard with live Raspberry Pi metrics](images/monitoring/grafana-dashboard-verified.png)`

---

## Results

Grafana is successfully deployed in K3s and connected to Prometheus. The dashboard displays live and historical availability, CPU, memory, disk, network, and temperature data for Pi5, Pi4, and the eight Pi3 workers.
