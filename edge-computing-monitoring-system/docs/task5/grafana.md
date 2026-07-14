# Grafana Dashboard and Visualization

> Grafana configuration and dashboard guide for the Raspberry Pi monitoring stack.

**Namespace:** `monitoring`  
**Service:** `prometheus-grafana`  
**Dashboard:** Node Exporter Full  
**Dashboard ID:** `1860`  
**Related documentation:** [Monitoring overview](monitoring.md) · [Prometheus](prometheus.md)

---

## 1. Purpose

Grafana visualizes the metrics stored by Prometheus. It provides real-time graphs and historical trends for CPU, memory, disk, network, uptime, load, temperature, and node availability.

Grafana is useful during demonstrations and performance experiments because it shows the effect of inference and image-processing workloads on the Raspberry Pi cluster.

---

## 2. Deployment

Grafana is enabled through `prometheus-k3s-values.yaml`:

```yaml
grafana:
  enabled: true
  replicas: 1
```

The complete stack is deployed with:

```bash
helm upgrade --install prometheus \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f prometheus-k3s-values.yaml \
  --set nodeExporter.enabled=false \
  --timeout 30m
```

Verify Grafana:

```bash
kubectl get pods -n monitoring | grep grafana
kubectl get svc -n monitoring | grep grafana
```

Expected pod state:

```text
3/3 Running
```

> **IMAGE PLACEHOLDER — Grafana pod**  
> Suggested file: `images/monitoring/grafana-pod-running.png`

---

## 3. Access Grafana

Create a temporary port forward:

```bash
kubectl port-forward --address 0.0.0.0 \
  -n monitoring \
  svc/prometheus-grafana \
  3001:80
```

Open:

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

Login username:

```text
admin
```

Do not store the administrator password in documentation, screenshots, or Git.

---

## 4. Prometheus data source

The Helm chart normally provisions Prometheus automatically as a Grafana data source.

Verify it in Grafana:

1. Open **Connections**.
2. Select **Data sources**.
3. Open **Prometheus**.
4. Confirm that the URL points to the Kubernetes Prometheus service.
5. Select **Save & test**.
6. Confirm that the data-source test succeeds.

The Kubernetes service URL is:

```text
http://prometheus-operated.monitoring.svc.cluster.local:9090
```

> **IMAGE PLACEHOLDER — Prometheus data source**  
> Suggested file: `images/monitoring/grafana-prometheus-datasource.png`  
> Show the successful **Save & test** result without exposing credentials.

---

## 5. Import Node Exporter Full

1. Open **Dashboards**.
2. Select **New** or **Import**.
3. Enter dashboard ID `1860`.
4. Load the dashboard definition.
5. Select the Prometheus data source.
6. Select **Import**.

The imported dashboard is named **Node Exporter Full**.

---

## 6. Dashboard configuration

Select:

- **Datasource:** Prometheus
- **Job:** `raspberry-pi-nodes`
- **Nodename/Instance:** required Raspberry Pi
- **Time range:** Last 15 minutes
- **Refresh interval:** 10 seconds

The dashboard displays:

- CPU usage
- Memory usage
- Disk usage and capacity
- Network receive and transmit rates
- System uptime
- Load average
- Node availability
- Temperature where available
- Historical resource trends

Some panels may display `N/A` when a metric is not supported by the Raspberry Pi hardware, operating system, filesystem, or Node Exporter version. The dashboard is considered valid when the primary CPU, memory, disk, uptime, load, and availability panels display live data.

> **IMAGE PLACEHOLDER — Node Exporter Full dashboard**  
> Suggested file: `images/monitoring/grafana-node-exporter-dashboard.png`  
> Show the selected Raspberry Pi and visible CPU, memory, disk, network, and uptime panels.

---

## 7. Useful dashboard queries

### CPU

```promql
100 - (
  avg by(instance) (
    rate(node_cpu_seconds_total{mode="idle"}[2m])
  ) * 100
)
```

### Memory

```promql
100 * (
  1 - (
    node_memory_MemAvailable_bytes
    /
    node_memory_MemTotal_bytes
  )
)
```

### Temperature

```promql
max by(instance) (node_hwmon_temp_celsius)
```

### Node state

```promql
up{job="raspberry-pi-nodes"}
```

---

## 8. Alert visualization

Prometheus evaluates the custom `raspberry-pi-cluster` rules and sends firing alerts to Alertmanager. Grafana can be used alongside the Prometheus and Alertmanager interfaces to visualize the affected resource metrics before and during an alert.

Custom alerts include:

- Raspberry Pi node down
- High CPU usage
- High memory usage
- High disk usage
- High temperature
- Critical temperature

Prometheus rules:

```text
http://192.168.178.200:30090/rules
```

Prometheus alerts:

```text
http://192.168.178.200:30090/alerts
```

> **IMAGE PLACEHOLDER — Alert and matching Grafana metric**  
> Suggested file: `images/monitoring/grafana-alert-metric.png`  
> Show an alert condition together with the relevant Grafana resource graph.

---

## 9. Validation checklist

- [x] Grafana pod is `3/3 Running`.
- [x] Grafana service is available.
- [x] Login works with the Kubernetes secret.
- [x] Prometheus data source passes validation.
- [x] Node Exporter Full dashboard is imported.
- [x] `raspberry-pi-nodes` is selectable.
- [x] Raspberry Pi instances can be selected.
- [x] CPU, memory, disk, network, uptime, and load data are visible.
- [x] Dashboard refresh is configured.
- [x] Grafana data matches Prometheus results.

---

## 10. Result

Grafana is successfully deployed in K3s and connected to Prometheus. The Node Exporter Full dashboard displays live and historical metrics for the Raspberry Pi cluster, supporting system-health monitoring, performance evaluation, demonstrations, and evidence collection for the project submission.
