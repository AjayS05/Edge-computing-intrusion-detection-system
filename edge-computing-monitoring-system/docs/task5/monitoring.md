# Raspberry Pi Cluster Monitoring

> System-level documentation for monitoring the Edge-Computing Intrusion Detection System.

**Status:** Completed and verified  
**Platform:** Raspberry Pi 5 control plane, Raspberry Pi 4 sensor node, eight Raspberry Pi 3 workers, and K3s  
**Related documentation:** [Prometheus](prometheus.md) · [Grafana](grafana.md)

---

## 1. Purpose

The monitoring system observes the health and performance of the Raspberry Pi cluster while intrusion detection, image processing, storage, and inference workloads are running. It helps identify:

- Node failures and connectivity loss
- CPU or memory pressure
- Low disk capacity
- High temperature or overheating
- Network bottlenecks
- High system load
- Backend and service failures

The system provides infrastructure-level visualization through Grafana and application-ready monitoring data through the FastAPI backend and React frontend.

> **IMAGE PLACEHOLDER — Monitoring overview**  
> Suggested file: `images/monitoring/monitoring-overview.png`  
> Add the final React Monitoring page showing status cards, charts, nodes, and alerts.

---

## 2. Final architecture

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
        ├────────► Grafana (:80 internal, :30300 external)
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

The existing Ansible-installed Node Exporters are retained as Linux services on the Raspberry Pi hosts. The Node Exporter dependency included in `kube-prometheus-stack` is disabled to prevent two exporters from competing for port `9100`.

| Component | Responsibility |
|---|---|
| Node Exporter | Exposes Linux host metrics on port `9100`. |
| Prometheus | Scrapes, stores, and queries time-series metrics. |
| Grafana | Displays current and historical metrics. |
| Alertmanager | Manages alerts produced by Prometheus rules. |
| kube-state-metrics | Exposes Kubernetes workload and object metrics. |
| FastAPI | Converts Prometheus data into frontend-ready JSON. |
| React frontend | Displays cluster health, node metrics, and alerts. |

![Raspberry Pi cluster monitoring architecture](images/monitoring/monitoring-architecture.svg)

---

## 3. Node Exporter deployment with Ansible

Ansible is run from Pi5 to install and start Node Exporter on the Pi3 workers.

### 3.1 Inventory

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

### 3.2 Playbook responsibilities

The playbook performs the following steps:

1. Updates the apt package cache.
2. Installs `prometheus-node-exporter`.
3. Enables the service at boot.
4. Starts the service.

```bash
ansible-playbook -i inventory.ini install-node-exporter.yml \
  --ask-pass \
  --ask-become-pass
```

### 3.3 Verify the exporters

Test one Pi3:

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

Test Pi4:

```bash
curl -s http://192.168.50.144:9100/metrics | head
```

Test Pi5:

```bash
sudo ss -lntp | grep ':9100'
curl -s http://127.0.0.1:9100/metrics | head
```

The final monitoring addresses are:

| Device | Node Exporter address |
|---|---|
| Pi5 control plane | `192.168.178.200:9100` |
| Pi4 sensor node | `192.168.50.144:9100` |
| Pi3-01 to Pi3-08 | `192.168.50.101:9100` to `192.168.50.108:9100` |

Only `192.168.178.200:9100` is used for Pi5 so the same device is not counted twice through another network address.

![Successful Ansible Node Exporter deployment on Raspberry Pi workers](images/ansible-node_exporter-success.png)

![Node Exporter metrics returned from the Raspberry Pi 4](images/node_exporter-metrics.png)

---

## 4. FastAPI monitoring integration

The FastAPI backend queries Prometheus and returns normalized data for the frontend.

```http
GET /api/v1/monitoring/overview
```

The endpoint returns:

- Backend status
- YOLO and Telegram service status
- Total, online, offline, and degraded nodes
- Per-node CPU, memory, disk, and temperature data
- Temperature health status
- Network receive and transmit rates
- Load averages and uptime
- Disk capacity information
- Active alerts
- Prometheus query errors

The backend deployment is named `backend` in namespace `edge-monitoring`.

```bash
kubectl set env deployment/backend \
  -n edge-monitoring \
  PROMETHEUS_URL=http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

Verify the deployment and configuration:

```bash
kubectl rollout status deployment/backend \
  -n edge-monitoring \
  --timeout=5m

kubectl exec -n edge-monitoring deployment/backend -- \
  printenv PROMETHEUS_URL
```

Test Prometheus connectivity from the backend:

```bash
kubectl exec -n edge-monitoring deployment/backend -- \
  python -c "import urllib.request; print(urllib.request.urlopen('http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090/-/ready').read().decode())"
```

Test the monitoring endpoint:

```bash
kubectl exec -n edge-monitoring deployment/backend -- \
  python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/v1/monitoring/overview').read().decode())"
```

Temporary local service access:

```bash
kubectl port-forward -n edge-monitoring service/backend 8001:8000
```

In another terminal:

```bash
curl -i http://127.0.0.1:8001/api/v1/monitoring/overview
```

Expected result:

```text
HTTP/1.1 200 OK
```

![Successful FastAPI monitoring overview response](images/monitoring/monitoring-api-response.png)
---

## 5. Backend health thresholds

| Resource | Warning | Critical |
|---|---:|---:|
| Temperature | 60°C | 70°C |
| CPU | 80% | 90% |
| Memory | 80% | 90% |
| Disk | 80% | 90% |

Application-level alerts include:

- Node offline
- High CPU usage
- High memory usage
- High disk usage
- High temperature
- Critical temperature

---

## 6. React frontend integration

The React frontend calls the monitoring endpoint every five seconds. A manual refresh button executes the same request immediately.

The interface displays:

- Backend and Prometheus status
- YOLO and Telegram service status
- Online and total node counts
- Average CPU and memory utilization
- Disk utilization
- Maximum temperature and temperature health
- Active alerts and cluster status
- Per-node CPU, memory, disk, temperature, network, load, uptime, and health information

Verification:

1. Open the Monitoring page.
2. Open browser developer tools.
3. Select the **Network** tab.
4. Find `/api/v1/monitoring/overview`.
5. Confirm HTTP `200`.
6. Confirm automatic refresh and the manual refresh button.

![React monitoring dashboard showing cluster health and node metrics](images/react-monitoring-page.png)

![React alerts page showing the current cluster alert status](images/react-alerts-page.png)

---

## 7. Repository guidance

Recommended files:

```text
monitoring/
├── monitoring.md
├── prometheus.md
├── grafana.md
├── ansible/
│   ├── inventory.example.ini
│   └── install-node-exporter.yml
├── prometheus/
│   ├── prometheus-k3s-values.yaml
│   └── raspberry-pi-alerts.yaml
└── images/
    └── monitoring/
```

Do not commit passwords, SSH private keys, real `.env` files, API tokens, or other credentials.

---

## 8. Result

The monitoring implementation is complete. Node Exporter exposes system metrics from Pi5, Pi4, and the eight Pi3 workers. Prometheus collects the metrics inside K3s, Grafana visualizes live and historical data, Alertmanager manages health alerts, and the FastAPI backend supplies normalized monitoring information to the React frontend.
