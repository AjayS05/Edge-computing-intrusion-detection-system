# Raspberry Pi Cluster Monitoring

> Complete implementation and deployment documentation for Prometheus, Grafana, Node Exporter, Alertmanager, the FastAPI monitoring API, and the React monitoring dashboard.

**Project:** Edge-Computing Intrusion Detection System  
**Platform:** Raspberry Pi 5 control plane, Raspberry Pi 4 sensor node, eight Raspberry Pi 3 worker nodes, and K3s  
**Status:** Completed and verified  
**Last updated:** 14 July 2026

---

## 1. Overview

The monitoring system observes the health and performance of the Raspberry Pi edge-computing cluster while intrusion detection, image processing, storage, and inference workloads are running. It provides two complementary monitoring views:

- **Grafana** provides infrastructure-level dashboards and historical trends.
- **The FastAPI monitoring API and React frontend** provide application-oriented cluster status and frontend-ready metrics.

The implementation began with Prometheus and Grafana running directly on the Raspberry Pi 5. Node Exporter was installed on the Raspberry Pi nodes using Ansible. The monitoring stack was later deployed to K3s while preserving the existing host-level Node Exporter services.

The completed system monitors:

- CPU utilization
- Memory utilization
- Disk utilization
- Network receive and transmit rates
- Device temperature
- System load averages
- System uptime
- Node availability
- Backend and application-service status
- Threshold-based health alerts

> **IMAGE PLACEHOLDER 1 — Project monitoring overview**  
> Suggested file: `images/monitoring/monitoring-overview.png`  
> Add a screenshot of the completed React Monitoring page showing status cards, graphs, node information, and alerts.

---

## 2. Monitoring objectives

Continuous monitoring is important because the project runs real-time object detection and image processing on resource-constrained Raspberry Pi hardware. Monitoring allows the team to identify:

- Node failure or loss of connectivity
- CPU or memory pressure
- Low disk capacity
- Abnormal temperature or overheating
- Network bottlenecks
- High system load
- Service and application failures
- Performance changes during inference experiments

This monitoring layer also supports the project's cluster-performance assessment by making resource usage and node health observable during demonstrations and experiments.

---

## 3. Components

| Component | Responsibility |
|---|---|
| Node Exporter | Exposes Linux system and hardware metrics on port `9100`. |
| Prometheus | Scrapes, stores, and queries time-series metrics. |
| Grafana | Displays current and historical metrics through dashboards. |
| Alertmanager | Receives and manages alerts produced by Prometheus rules. |
| kube-state-metrics | Exposes Kubernetes object and workload metrics. |
| Prometheus Operator | Manages Prometheus, Alertmanager, ServiceMonitor, and PrometheusRule resources. |
| FastAPI monitoring API | Queries Prometheus and returns normalized frontend-ready JSON. |
| React monitoring UI | Displays cluster health, node metrics, graphs, statuses, and alerts. |
| Ansible | Automates Node Exporter installation on the Raspberry Pi nodes. |

---

## 4. Architecture evolution

### 4.1 Initial host-based architecture

The original monitoring stack ran directly on the Raspberry Pi 5:

```text
Raspberry Pi 3 / Pi4 / Pi5
        │
        │ Node Exporter :9100
        ▼
Prometheus on Pi5 :9090
        │
        ▼
Grafana on Pi5 :3000
        │
        ▼
FastAPI monitoring API
        │
        ▼
React monitoring dashboard
```

### 4.2 Final Kubernetes architecture

The final monitoring stack is deployed to K3s:

```text
Pi5 + Pi4 + 8 × Pi3
Host Node Exporter :9100
        │
        ▼
Prometheus in K3s
Namespace: monitoring
Internal service: :9090
External NodePort: :30090
        │
        ├────────► Grafana
        ├────────► Alertmanager
        ├────────► Prometheus Operator
        └────────► kube-state-metrics
        │
        ▼
FastAPI backend
Namespace: edge-monitoring
        │
        ▼
React monitoring dashboard
```

The existing Ansible-installed Node Exporters were preserved. The Node Exporter included with `kube-prometheus-stack` was disabled because both versions attempted to use host port `9100`.

> **DIAGRAM PLACEHOLDER 2 — Final monitoring architecture**  
> Suggested file: `images/monitoring/monitoring-architecture.png`  
> Create a diagram based on the final Kubernetes architecture above. Show Pi nodes, Node Exporter, Prometheus, Grafana, Alertmanager, FastAPI, and React.

---

## 5. Node Exporter deployment using Ansible

Ansible was run from the Pi5 to install and start Node Exporter on the Pi3 worker nodes.

### 5.1 Example Ansible inventory

```ini
[rp3_nodes]
rpi3-01 ansible_host=192.168.50.101
rpi3-02 ansible_host=192.168.50.102
rpi3-03 ansible_host=192.168.50.103
rpi3-04 ansible_host=192.168.50.104
rpi3-05 ansible_host=192.168.50.105
rpi3-06 ansible_host=192.168.50.106
rpi3-07 ansible_host=192.168.50.107
rpi3-08 ansible_host=192.168.50.108

[rp3_nodes:vars]
ansible_user=pi
ansible_python_interpreter=/usr/bin/python3
```

### 5.2 Playbook responsibilities

The Node Exporter playbook:

1. Updates the apt package cache.
2. Installs `prometheus-node-exporter`.
3. Enables the service at boot.
4. Starts the service.

Example execution command:

```bash
ansible-playbook -i inventory.ini install-node-exporter.yml \
  --ask-pass \
  --ask-become-pass
```

### 5.3 Verify Node Exporter

Test one node:

```bash
curl -s http://192.168.50.101:9100/metrics | head
```

Test all Pi3 workers:

```bash
for ip in 192.168.50.{101..108}; do
  if curl -sf --connect-timeout 3 "http://$ip:9100/metrics" >/dev/null; then
    echo "$ip UP"
  else
    echo "$ip DOWN"
  fi
done
```

Expected result:

```text
192.168.50.101 UP
192.168.50.102 UP
...
192.168.50.108 UP
```

### 5.4 Pi4 verification

Pi4 uses IP address `192.168.50.144`:

```bash
curl -s http://192.168.50.144:9100/metrics | head
```

Returning Node Exporter metrics confirms that Pi4 is reachable and ready to be scraped.

### 5.5 Pi5 verification

```bash
sudo ss -lntp | grep ':9100'
curl -s http://127.0.0.1:9100/metrics | head
```

If the package service is stopped:

```bash
sudo systemctl enable --now prometheus-node-exporter
```

If the service name is unknown:

```bash
systemctl list-unit-files | grep -Ei 'node.?exporter|prometheus'
```

> **IMAGE PLACEHOLDER 3 — Node Exporter verification**  
> Suggested file: `images/monitoring/node-exporter-verification.png`  
> Add a terminal screenshot showing Pi4 or Pi3 Node Exporter metrics returned from port `9100`.

> **IMAGE PLACEHOLDER 4 — Ansible deployment result**  
> Suggested file: `images/monitoring/ansible-node-exporter-success.png`  
> Add the Ansible play recap showing successful installation across the Pi3 nodes.

---

## 6. Initial Prometheus configuration

Before the Kubernetes migration, Prometheus ran directly on Pi5 port `9090` and used static Node Exporter targets.

```yaml
scrape_configs:
  - job_name: prometheus
    scrape_interval: 5s
    scrape_timeout: 5s
    static_configs:
      - targets:
          - localhost:9090

  - job_name: node
    static_configs:
      - targets:
          - 192.168.50.101:9100
          - 192.168.50.102:9100
          - 192.168.50.103:9100
          - 192.168.50.104:9100
          - 192.168.50.105:9100
          - 192.168.50.106:9100
          - 192.168.50.107:9100
          - 192.168.50.108:9100
```

The configuration was validated and Prometheus restarted:

```bash
promtool check config /etc/prometheus/prometheus.yml
sudo systemctl restart prometheus
```

This host-based configuration is preserved here as implementation history. The final active Prometheus instance runs inside K3s.

---

## 7. Grafana setup

Grafana was connected to Prometheus as a data source. The Node Exporter Full dashboard was imported for infrastructure monitoring.

**Dashboard:** Node Exporter Full  
**Grafana dashboard ID:** `1860`

### Dashboard usage

1. Open Grafana.
2. Select the Prometheus data source.
3. Open the Node Exporter Full dashboard.
4. Select the required job and node using the dashboard variables.
5. Set the time range, for example, to **Last 15 minutes**.
6. Set automatic refresh to `10s`.

The dashboard displays:

- CPU usage per node
- Memory usage per node
- Disk usage
- Network activity
- System uptime
- Load average
- Node availability
- Temperature where supported
- Cluster and host health information

Some Grafana panels may display `N/A` when a metric is not supported by the Raspberry Pi hardware, operating system, filesystem, or installed Node Exporter version. This is acceptable when the primary CPU, memory, disk, uptime, and availability panels work.

> **IMAGE PLACEHOLDER 5 — Grafana data source**  
> Suggested file: `images/monitoring/grafana-prometheus-datasource.png`  
> Add a screenshot showing that the Prometheus data source passes **Save & test**.

> **IMAGE PLACEHOLDER 6 — Grafana dashboard**  
> Suggested file: `images/monitoring/grafana-node-exporter-dashboard.png`  
> Add a complete Grafana dashboard screenshot showing live CPU, memory, disk, network, uptime, and node selection.

---

## 8. Important Node Exporter metrics

| Metric | Purpose |
|---|---|
| `node_cpu_seconds_total` | Calculates CPU utilization. |
| `node_memory_MemAvailable_bytes` | Reports available memory. |
| `node_memory_MemTotal_bytes` | Reports total memory. |
| `node_filesystem_avail_bytes` | Reports available filesystem capacity. |
| `node_filesystem_size_bytes` | Reports total filesystem capacity. |
| `node_network_receive_bytes_total` | Reports received network bytes. |
| `node_network_transmit_bytes_total` | Reports transmitted network bytes. |
| `node_load1`, `node_load5`, `node_load15` | Reports system load averages. |
| `node_boot_time_seconds` | Used to calculate uptime. |
| `node_hwmon_temp_celsius` | Reports hardware temperature where available. |
| `node_thermal_zone_temp` | Alternative Raspberry Pi temperature metric. |

---

## 9. Prometheus queries

### Node availability

```promql
up{job="raspberry-pi-nodes"}
```

- `1` means the node is reachable.
- `0` means the node is unreachable.

### CPU utilization

```promql
100 - (
  avg by(instance) (
    rate(node_cpu_seconds_total{mode="idle"}[2m])
  ) * 100
)
```

### Memory utilization

```promql
100 * (
  1 - (
    node_memory_MemAvailable_bytes
    /
    node_memory_MemTotal_bytes
  )
)
```

### Root filesystem utilization

```promql
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
```

### Temperature

```promql
max by(instance) (node_hwmon_temp_celsius)
```

Alternative:

```promql
max by(instance) (node_thermal_zone_temp)
```

### Network receive rate

```promql
sum by(instance) (
  rate(node_network_receive_bytes_total{
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

### Network transmit rate

```promql
sum by(instance) (
  rate(node_network_transmit_bytes_total{
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

> **IMAGE PLACEHOLDER 7 — Prometheus query result**  
> Suggested file: `images/monitoring/prometheus-query-result.png`  
> Add a screenshot of a Prometheus query such as CPU utilization or `up{job="raspberry-pi-nodes"}` returning data for the cluster.

---

## 10. Kubernetes deployment

### 10.1 Preconditions

```bash
kubectl get nodes -o wide
helm version
kubectl version --client
```

Before installation:

- Required K3s nodes should be `Ready`.
- Host Node Exporter endpoints should answer on port `9100`.
- Helm and kubectl should be installed on Pi5.
- The `monitoring` namespace should not contain unrelated resources.

### 10.2 Helm repository

```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts

helm repo update
```

### 10.3 Final Helm values

The final `prometheus-k3s-values.yaml` configuration is:

```yaml
nodeExporter:
  enabled: false

prometheus:
  service:
    type: NodePort
    port: 9090
    targetPort: 9090
    nodePort: 30090

  prometheusSpec:
    retention: 7d

    resources:
      requests:
        memory: 300Mi
        cpu: 100m
      limits:
        memory: 1Gi
        cpu: 1000m

    additionalScrapeConfigs:
      - job_name: raspberry-pi-nodes
        scrape_interval: 15s
        scrape_timeout: 10s
        static_configs:
          - targets:
              - 192.168.50.1:9100
              - 192.168.50.144:9100
              - 192.168.50.101:9100
              - 192.168.50.102:9100
              - 192.168.50.103:9100
              - 192.168.50.104:9100
              - 192.168.50.105:9100
              - 192.168.50.106:9100
              - 192.168.50.107:9100
              - 192.168.50.108:9100

grafana:
  enabled: true
  replicas: 1

alertmanager:
  enabled: true

kube-state-metrics:
  enabled: true
```

The monitored devices are:

| Device | Address |
|---|---|
| Pi5 master | `192.168.50.1:9100` |
| Pi4 sensor node | `192.168.50.144:9100` |
| Pi3-01 | `192.168.50.101:9100` |
| Pi3-02 | `192.168.50.102:9100` |
| Pi3-03 | `192.168.50.103:9100` |
| Pi3-04 | `192.168.50.104:9100` |
| Pi3-05 | `192.168.50.105:9100` |
| Pi3-06 | `192.168.50.106:9100` |
| Pi3-07 | `192.168.50.107:9100` |
| Pi3-08 | `192.168.50.108:9100` |

Only one Pi5 address is used to prevent duplicate Pi5 entries and incorrect node counts.

> **Important:** The correct chart setting is `nodeExporter.enabled: false`. Using `prometheus-node-exporter.enabled: false` did not disable the Node Exporter dependency during this deployment.

### 10.4 Validate the Helm configuration

```bash
helm template prometheus \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f prometheus-k3s-values.yaml >/dev/null
```

### 10.5 Install or upgrade the stack

```bash
helm upgrade --install prometheus \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f prometheus-k3s-values.yaml \
  --set nodeExporter.enabled=false \
  --timeout 30m
```

The `--no-hooks` option was used when the Helm admission webhook hook was the only failing component while the monitoring resources themselves were healthy:

```bash
helm upgrade prometheus \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f prometheus-k3s-values.yaml \
  --set nodeExporter.enabled=false \
  --no-hooks \
  --timeout 30m
```

### 10.6 Verify the deployment

```bash
helm status prometheus -n monitoring
kubectl get pods -n monitoring -o wide
kubectl get daemonset -n monitoring
kubectl get svc -n monitoring
```

Healthy component states:

| Component | Expected state |
|---|---|
| Prometheus | `2/2 Running` |
| Grafana | `3/3 Running` |
| Alertmanager | `2/2 Running` |
| Prometheus Operator | `1/1 Running` |
| kube-state-metrics | `1/1 Running` |
| Kubernetes Node Exporter | No DaemonSet or pods; host exporters are retained. |

Verify Prometheus readiness:

```bash
curl -s http://192.168.178.200:30090/-/ready
```

Expected result:

```text
Prometheus Server is Ready.
```

Prometheus targets page:

```text
http://192.168.178.200:30090/targets
```

> **IMAGE PLACEHOLDER 8 — Kubernetes monitoring pods**  
> Suggested file: `images/monitoring/kubernetes-monitoring-pods.png`  
> Add the output of `kubectl get pods -n monitoring` with the monitoring components running.

> **IMAGE PLACEHOLDER 9 — Prometheus targets**  
> Suggested file: `images/monitoring/prometheus-targets-up.png`  
> Add the Prometheus targets page showing Pi5, Pi4, and the Pi3 targets as `UP`.

---

## 11. Prometheus alert rules

The custom alert rules are stored in:

```text
k8s/monitoring/raspberry-pi-alerts.yaml
```

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: raspberry-pi-alerts
  namespace: monitoring
  labels:
    release: prometheus
spec:
  groups:
    - name: raspberry-pi-cluster
      rules:
        - alert: RaspberryPiNodeDown
          expr: up{job="raspberry-pi-nodes"} == 0
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: Raspberry Pi node is down
            description: >-
              {{ $labels.instance }} has been unreachable for more than one minute.

        - alert: RaspberryPiHighCPU
          expr: |
            100 - (
              avg by(instance) (
                rate(node_cpu_seconds_total{
                  job="raspberry-pi-nodes",
                  mode="idle"
                }[5m])
              ) * 100
            ) > 85
          for: 3m
          labels:
            severity: warning
          annotations:
            summary: High CPU usage
            description: >-
              {{ $labels.instance }} CPU usage has exceeded 85%.

        - alert: RaspberryPiHighMemory
          expr: |
            100 * (
              1 - (
                node_memory_MemAvailable_bytes{job="raspberry-pi-nodes"}
                /
                node_memory_MemTotal_bytes{job="raspberry-pi-nodes"}
              )
            ) > 85
          for: 3m
          labels:
            severity: warning
          annotations:
            summary: High memory usage
            description: >-
              {{ $labels.instance }} memory usage has exceeded 85%.

        - alert: RaspberryPiHighDisk
          expr: |
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
            ) > 80
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: High disk usage
            description: >-
              {{ $labels.instance }} root disk usage has exceeded 80%.

        - alert: RaspberryPiHighTemperature
          expr: |
            max by(instance) (
              node_hwmon_temp_celsius{job="raspberry-pi-nodes"}
            ) > 60
          for: 2m
          labels:
            severity: warning
          annotations:
            summary: High Raspberry Pi temperature
            description: >-
              {{ $labels.instance }} temperature is above 60°C.

        - alert: RaspberryPiCriticalTemperature
          expr: |
            max by(instance) (
              node_hwmon_temp_celsius{job="raspberry-pi-nodes"}
            ) > 70
          for: 1m
          labels:
            severity: critical
          annotations:
            summary: Critical Raspberry Pi temperature
            description: >-
              {{ $labels.instance }} temperature is above 70°C.
```

If the available temperature metric is `node_thermal_zone_temp`, replace `node_hwmon_temp_celsius` in the two temperature rules.

### Apply and verify the rules

```bash
kubectl apply --dry-run=server \
  -f k8s/monitoring/raspberry-pi-alerts.yaml

kubectl apply \
  -f k8s/monitoring/raspberry-pi-alerts.yaml

kubectl get prometheusrule -n monitoring

kubectl describe prometheusrule raspberry-pi-alerts \
  -n monitoring
```

Rules page:

```text
http://192.168.178.200:30090/rules
```

Alerts page:

```text
http://192.168.178.200:30090/alerts
```

Verify through the API:

```bash
curl -s http://192.168.178.200:30090/api/v1/rules \
  | grep -oE 'RaspberryPi[A-Za-z]+' \
  | sort -u
```

The custom rules were successfully loaded and verified.

> **IMAGE PLACEHOLDER 10 — Custom Prometheus rules**  
> Suggested file: `images/monitoring/raspberry-pi-alert-rules.png`  
> Add the Prometheus rules page showing the `raspberry-pi-cluster` group and custom rules.

> **IMAGE PLACEHOLDER 11 — Firing alert demonstration**  
> Suggested file: `images/monitoring/node-down-alert-firing.png`  
> Add a screenshot of `RaspberryPiNodeDown` in the firing state from the alert test.

> **IMAGE PLACEHOLDER 12 — Alertmanager alert**  
> Suggested file: `images/monitoring/alertmanager-node-down.png`  
> Add a screenshot showing the same alert in Alertmanager.

---

## 12. FastAPI monitoring integration

The FastAPI backend queries Prometheus and returns normalized JSON to the frontend.

### Endpoint

```http
GET /api/v1/monitoring/overview
```

The response includes:

- Backend status
- YOLO service status
- Telegram bot status
- Total, online, offline, and degraded nodes
- Per-node CPU utilization and health status
- Per-node memory utilization and health status
- Per-node disk utilization and health status
- Temperature and temperature status
- Network receive and transmit rates
- Load averages
- Uptime
- Disk capacity details
- Active monitoring alerts
- Prometheus query errors

### Backend Prometheus address

The backend deployment is named `backend` and runs in namespace `edge-monitoring`.

```bash
kubectl set env deployment/backend \
  -n edge-monitoring \
  PROMETHEUS_URL=http://prometheus-operated.monitoring.svc.cluster.local:9090
```

Verify the rollout:

```bash
kubectl rollout status deployment/backend \
  -n edge-monitoring \
  --timeout=5m
```

Verify the environment variable:

```bash
kubectl exec -n edge-monitoring deployment/backend -- \
  printenv PROMETHEUS_URL
```

Expected result:

```text
http://prometheus-operated.monitoring.svc.cluster.local:9090
```

Test connectivity from the backend container:

```bash
kubectl exec -n edge-monitoring deployment/backend -- \
  python -c "import urllib.request; print(urllib.request.urlopen('http://prometheus-operated.monitoring.svc.cluster.local:9090/-/ready').read().decode())"
```

### Test the monitoring API

```bash
kubectl get pods -n edge-monitoring
kubectl logs -n edge-monitoring deployment/backend --tail=100
```

Call the API inside the pod:

```bash
kubectl exec -n edge-monitoring deployment/backend -- \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/monitoring/overview').read().decode())"
```

Temporary local access:

```bash
kubectl port-forward \
  -n edge-monitoring \
  service/backend \
  8001:8000
```

In another terminal:

```bash
curl -i http://127.0.0.1:8001/api/v1/monitoring/overview
```

Expected result:

```text
HTTP/1.1 200 OK
```

> **IMAGE PLACEHOLDER 13 — Monitoring API response**  
> Suggested file: `images/monitoring/monitoring-api-response.png`  
> Add a browser, Swagger, or terminal screenshot showing a successful response from `/api/v1/monitoring/overview`.

---

## 13. Backend alert thresholds

The FastAPI monitoring API also generates application-level alerts.

| Resource | Warning | Critical |
|---|---:|---:|
| Temperature | 60°C | 70°C |
| CPU | 80% | 90% |
| Memory | 80% | 90% |
| Disk | 80% | 90% |

Generated alerts include:

- Node offline
- High CPU utilization
- High memory utilization
- High disk utilization
- High temperature
- Critical temperature

The API-generated alerts complement the Kubernetes `PrometheusRule` alerts.

---

## 14. React frontend integration

The React frontend calls the monitoring endpoint every five seconds and updates the page automatically. A manual refresh button executes the same request immediately.

The interface displays:

- Backend API status
- Prometheus status
- YOLO service status
- Telegram bot status
- Online and total node counts
- Average CPU utilization
- Average memory utilization
- Disk utilization
- Maximum temperature
- Temperature health
- Active alerts
- Cluster status
- Per-node status and metrics
- CPU, memory, disk, temperature, network, load, and uptime information

Browser verification:

1. Open the Monitoring page.
2. Open browser developer tools.
3. Select the **Network** tab.
4. Find `/api/v1/monitoring/overview`.
5. Confirm that it returns HTTP `200`.
6. Confirm that the page refreshes automatically and that the manual refresh button works.

> **IMAGE PLACEHOLDER 14 — React Monitoring page**  
> Suggested file: `images/monitoring/react-monitoring-page.png`  
> Add a complete screenshot of the final monitoring interface.

> **IMAGE PLACEHOLDER 15 — Alerts page**  
> Suggested file: `images/monitoring/react-alerts-page.png`  
> Add a screenshot showing application-level alerts in the React Alerts page.

---

## 15. Troubleshooting and verified solutions

### 15.1 Node Exporter pods entered `CrashLoopBackOff`

Error:

```text
listen tcp 0.0.0.0:9100: bind: address already in use
```

Cause: Node Exporter was already running as an Ansible-installed systemd service. The Kubernetes DaemonSet attempted to use the same host port.

Solution:

```yaml
nodeExporter:
  enabled: false
```

The host exporters were preserved and the duplicate Kubernetes DaemonSet was removed.

### 15.2 `node_exporter.service` could not be found

The service installed by the Debian package can be named `prometheus-node-exporter`.

```bash
systemctl list-unit-files | grep -Ei 'node.?exporter|prometheus'
sudo systemctl status prometheus-node-exporter --no-pager
```

### 15.3 `wget` not available inside the Prometheus container

The Prometheus container image did not include `wget`. This did not mean Prometheus was broken. Readiness was tested through the service endpoint, port forwarding, or another pod with curl.

### 15.4 Helm hook failed with `database is locked`

Error:

```text
post-upgrade hooks failed
rpc error: code = Unknown desc = database is locked
```

This was a temporary K3s/containerd internal database lock while creating an admission webhook patch job. The monitoring pods were inspected before making changes. Failed temporary jobs were removed and the upgrade was retried. K3s restart was reserved only for a persistent runtime lock.

### 15.5 Helm reported failure while pods were healthy

The Helm hook failed after Kubernetes resources were applied. When the hook was the only remaining problem and the monitoring resources were healthy, the release was updated once with `--no-hooks`.

### 15.6 Pi5 appeared twice

Pi5 was initially configured with both:

```text
192.168.178.200:9100
192.168.50.1:9100
```

Both addresses referred to the same device. One was removed to prevent duplicate node entries, incorrect averages, and incorrect node counts. The retained monitoring address is:

```text
192.168.50.1:9100
```

### 15.7 Only Pi5 appeared `DOWN`

The host Node Exporter service and port were checked:

```bash
sudo ss -lntp | grep ':9100'
sudo systemctl enable --now prometheus-node-exporter
```

The configured Pi5 address was then tested directly.

### 15.8 Backend could not reach Prometheus

Using `localhost:9090` inside the backend pod was incorrect because `localhost` referred to the backend container. Kubernetes service DNS was used instead:

```text
http://prometheus-operated.monitoring.svc.cluster.local:9090
```

### 15.9 Prometheus NodePort was unavailable

The service configuration was checked:

```bash
kubectl get svc -n monitoring | grep prometheus

kubectl get svc prometheus-kube-prometheus-prometheus \
  -n monitoring \
  -o yaml | grep -E 'type:|port:|nodePort:|targetPort:'
```

Temporary access was possible through:

```bash
kubectl port-forward --address 0.0.0.0 \
  -n monitoring \
  svc/prometheus-kube-prometheus-prometheus \
  9091:9090
```

Permanent NodePort exposure was restored through the Helm values configuration.

### 15.10 cAdvisor out-of-order samples warning

Prometheus logged an out-of-order samples warning for Kubernetes cAdvisor metrics. The configuration and rule manager still loaded successfully. The warning was unrelated to the custom Raspberry Pi alert rules and did not prevent the monitoring implementation from working.

### 15.11 Temperature displayed as unknown

Available temperature metrics were checked. Backend and frontend types were aligned, and `temperature_status` was included in each node object. The frontend handles unavailable temperature data without failing the entire monitoring page.

---

## 16. Access information

### Final Kubernetes access

| Service | Address |
|---|---|
| Prometheus | `http://192.168.178.200:30090` |
| Prometheus targets | `http://192.168.178.200:30090/targets` |
| Prometheus rules | `http://192.168.178.200:30090/rules` |
| Prometheus alerts | `http://192.168.178.200:30090/alerts` |
| Internal Prometheus service | `http://prometheus-operated.monitoring.svc.cluster.local:9090` |

### Grafana access

Check the service:

```bash
kubectl get svc -n monitoring | grep grafana
```

Temporary access:

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

Retrieve the Grafana administrator password:

```bash
kubectl get secret -n monitoring prometheus-grafana \
  -o jsonpath='{.data.admin-password}' \
  | base64 -d

echo
```

The username is `admin`.

### Alertmanager access

```bash
kubectl port-forward -n monitoring \
  svc/prometheus-kube-prometheus-alertmanager \
  9093:9093
```

Open:

```text
http://127.0.0.1:9093
```

If another laptop cannot connect, verify that it is on the same network and that device-to-device traffic is not blocked. Raspberry Pi Connect, VNC, or the Pi5 browser can also be used.

---

## 17. Security and repository guidance

Recommended monitoring structure:

```text
monitoring/
├── README.md
├── ansible/
│   ├── inventory.example.ini
│   └── install-node-exporter.yml
├── prometheus/
│   ├── prometheus.example.yml
│   └── alerts.yml
├── grafana/
│   └── dashboard-notes.md
└── screenshots/
    ├── prometheus-targets.png
    ├── grafana-dashboard.png
    └── ansible-playbook-success.png
```

Do not commit:

- Grafana administrator passwords
- SSH private keys
- Real `.env` files
- API tokens
- Cloudflare credentials
- Access tokens
- Other sensitive credentials

The following reproducible, sanitized files should be committed:

- `prometheus-k3s-values.yaml`
- `k8s/monitoring/raspberry-pi-alerts.yaml`
- Ansible inventory example without passwords
- Node Exporter Ansible playbook
- Monitoring documentation
- Selected screenshots without credentials

---

## 18. Completed work

The following work has been completed and verified:

- Prometheus and Grafana were initially configured on Pi5.
- Node Exporter was installed across the Pi3 worker nodes using Ansible.
- Node Exporter was verified on Pi4 and Pi5.
- Node Exporter endpoints returned metrics successfully on port `9100`.
- Prometheus static scrape targets were configured.
- Grafana was connected to Prometheus.
- Node Exporter Full dashboard ID `1860` was imported.
- CPU, memory, disk, network, uptime, load, temperature, and availability metrics were queried.
- Prometheus, Grafana, Alertmanager, the Prometheus Operator, and kube-state-metrics were deployed to K3s.
- The duplicate Kubernetes Node Exporter DaemonSet was disabled.
- Pi5, Pi4, and the Pi3 worker nodes were included as Prometheus targets.
- Duplicate Pi5 addressing was removed.
- Custom Raspberry Pi alert rules were created and loaded.
- Alertmanager was deployed and verified.
- The FastAPI backend was connected using Kubernetes service DNS.
- The monitoring API returned live cluster data.
- The React monitoring interface consumed the monitoring API.
- Automatic and manual refresh behavior was verified.
- Deployment errors and monitoring issues were diagnosed and resolved.

---

## 19. Final verification checklist

- [x] Required Kubernetes nodes are `Ready`.
- [x] Prometheus is running in namespace `monitoring`.
- [x] Grafana is running and receiving Prometheus data.
- [x] Alertmanager is running.
- [x] Prometheus Operator is running.
- [x] kube-state-metrics is running.
- [x] Existing host Node Exporters answer on port `9100`.
- [x] No duplicate Kubernetes Node Exporter DaemonSet is running.
- [x] Pi5, Pi4, and Pi3 targets are configured.
- [x] Prometheus targets report the expected health state.
- [x] Prometheus readiness endpoint responds successfully.
- [x] Custom Raspberry Pi rules appear on the rules page.
- [x] Alert behavior was verified.
- [x] Grafana displays live metrics.
- [x] Backend uses internal Kubernetes Prometheus DNS.
- [x] `/api/v1/monitoring/overview` returns live monitoring data.
- [x] React Monitoring and Alerts pages display the monitoring response.

---

## 20. Final result

The monitoring implementation is complete. Node Exporter exposes system metrics from the Raspberry Pi devices, and Prometheus deployed in K3s successfully scrapes the configured Pi5, Pi4, and Pi3 targets. Grafana displays live and historical cluster metrics, while Alertmanager receives threshold-based alerts for node availability and resource health.

The FastAPI monitoring endpoint converts Prometheus data into frontend-ready JSON, and the React dashboard presents live node status, CPU, memory, disk, network, temperature, load, uptime, service health, and alert information. This provides both infrastructure-level visibility and application-level monitoring for the edge intrusion-detection system.

---

## 21. Image checklist

Add the following images before final submission:

| No. | Suggested filename | Required content |
|---:|---|---|
| 1 | `monitoring-overview.png` | Complete React Monitoring page |
| 2 | `monitoring-architecture.png` | Final monitoring architecture diagram |
| 3 | `node-exporter-verification.png` | Node Exporter `/metrics` response |
| 4 | `ansible-node-exporter-success.png` | Successful Ansible play recap |
| 5 | `grafana-prometheus-datasource.png` | Grafana Prometheus data source test |
| 6 | `grafana-node-exporter-dashboard.png` | Grafana dashboard with live metrics |
| 7 | `prometheus-query-result.png` | Prometheus query returning cluster data |
| 8 | `kubernetes-monitoring-pods.png` | Monitoring pods in Running state |
| 9 | `prometheus-targets-up.png` | Pi targets visible and UP |
| 10 | `raspberry-pi-alert-rules.png` | Custom alert-rule group |
| 11 | `node-down-alert-firing.png` | Firing NodeDown alert |
| 12 | `alertmanager-node-down.png` | Alert displayed in Alertmanager |
| 13 | `monitoring-api-response.png` | Successful monitoring API JSON response |
| 14 | `react-monitoring-page.png` | Final Monitoring page |
| 15 | `react-alerts-page.png` | Final Alerts page |

Do not include passwords, tokens, private keys, or sensitive configuration values in screenshots.
