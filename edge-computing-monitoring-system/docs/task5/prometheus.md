# Prometheus Deployment and Configuration

> Reproducible Prometheus and Alertmanager deployment guide for the Raspberry Pi K3s cluster.

**Namespace:** `monitoring`  
**Helm release:** `prometheus`  
**Chart:** `prometheus-community/kube-prometheus-stack`  
**External port:** `30090`  
**Related documentation:** [Monitoring overview](monitoring.md) · [Grafana](grafana.md)

---

## 1. Prerequisites

```bash
kubectl get nodes -o wide
helm version
kubectl version --client
```

Confirm that the Raspberry Pi Node Exporters respond before installing Prometheus:

```bash
for ip in 192.168.50.1 192.168.50.144 192.168.50.{101..108}; do
  if curl -sf --connect-timeout 3 "http://$ip:9100/metrics" >/dev/null; then
    echo "$ip UP"
  else
    echo "$ip DOWN"
  fi
done
```

---

## 2. Add the Helm repository

```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts

helm repo update
```

---

## 3. Helm values

Create `prometheus-k3s-values.yaml`:

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

`nodeExporter.enabled` is set to `false` because Node Exporter already runs directly on each Raspberry Pi host.

---

## 4. Validate and install

Validate the generated Kubernetes resources:

```bash
helm template prometheus \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f prometheus-k3s-values.yaml >/dev/null
```

Install the monitoring stack:

```bash
helm upgrade --install prometheus \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f prometheus-k3s-values.yaml \
  --set nodeExporter.enabled=false \
  --timeout 30m
```

---

## 5. Verify the deployment

```bash
helm status prometheus -n monitoring
kubectl get pods -n monitoring -o wide
kubectl get daemonset -n monitoring
kubectl get svc -n monitoring
```

Expected states:

| Component | Expected state |
|---|---|
| Prometheus | `2/2 Running` |
| Alertmanager | `2/2 Running` |
| Prometheus Operator | `1/1 Running` |
| kube-state-metrics | `1/1 Running` |
| Grafana | `3/3 Running` |
| Kubernetes Node Exporter | No DaemonSet; host exporters are used. |

Test readiness:

```bash
curl -s http://192.168.178.200:30090/-/ready
```

Expected:

```text
Prometheus Server is Ready.
```

Access pages:

| Page | URL |
|---|---|
| Prometheus | `http://192.168.178.200:30090` |
| Targets | `http://192.168.178.200:30090/targets` |
| Rules | `http://192.168.178.200:30090/rules` |
| Alerts | `http://192.168.178.200:30090/alerts` |

> **IMAGE PLACEHOLDER — Prometheus pods**  
> Suggested file: `images/monitoring/prometheus-pods.png`

> **IMAGE PLACEHOLDER — Prometheus targets**  
> Suggested file: `images/monitoring/prometheus-targets-up.png`  
> Show Pi5, Pi4, and all Pi3 targets.

---

## 6. PromQL queries

### Node availability

```promql
up{job="raspberry-pi-nodes"}
```

### CPU usage

```promql
100 - (
  avg by(instance) (
    rate(node_cpu_seconds_total{mode="idle"}[2m])
  ) * 100
)
```

### Memory usage

```promql
100 * (
  1 - (
    node_memory_MemAvailable_bytes
    /
    node_memory_MemTotal_bytes
  )
)
```

### Disk usage

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

Alternative metric:

```promql
max by(instance) (node_thermal_zone_temp)
```

### Network receive

```promql
sum by(instance) (
  rate(node_network_receive_bytes_total{
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

### Network transmit

```promql
sum by(instance) (
  rate(node_network_transmit_bytes_total{
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

> **IMAGE PLACEHOLDER — PromQL result**  
> Suggested file: `images/monitoring/prometheus-query-result.png`

---

## 7. Alert rules

Store the following resource at `k8s/monitoring/raspberry-pi-alerts.yaml`:

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

If the nodes expose `node_thermal_zone_temp` instead, use that metric in the two temperature rules.

Apply and verify:

```bash
kubectl apply --dry-run=server \
  -f k8s/monitoring/raspberry-pi-alerts.yaml

kubectl apply \
  -f k8s/monitoring/raspberry-pi-alerts.yaml

kubectl get prometheusrule -n monitoring

kubectl describe prometheusrule raspberry-pi-alerts \
  -n monitoring
```

Verify through the Prometheus API:

```bash
curl -s http://192.168.178.200:30090/api/v1/rules \
  | grep -oE 'RaspberryPi[A-Za-z]+' \
  | sort -u
```

> **IMAGE PLACEHOLDER — Custom alert rules**  
> Suggested file: `images/monitoring/raspberry-pi-alert-rules.png`

> **IMAGE PLACEHOLDER — Firing alert**  
> Suggested file: `images/monitoring/node-down-alert-firing.png`

> **IMAGE PLACEHOLDER — Alertmanager**  
> Suggested file: `images/monitoring/alertmanager-node-down.png`

---

## 8. Backend service discovery

Kubernetes workloads access Prometheus through its internal service:

```text
http://prometheus-operated.monitoring.svc.cluster.local:9090
```

```bash
kubectl set env deployment/backend \
  -n edge-monitoring \
  PROMETHEUS_URL=http://prometheus-operated.monitoring.svc.cluster.local:9090
```

---

## 9. Completion checklist

- [x] Prometheus is deployed and ready.
- [x] Alertmanager is deployed and ready.
- [x] kube-state-metrics and the operator are ready.
- [x] Node Exporter chart dependency is disabled.
- [x] Ten Raspberry Pi targets are configured.
- [x] Targets are visible in Prometheus.
- [x] PromQL returns host metrics.
- [x] Custom alert rules are loaded.
- [x] Backend can access the internal Prometheus service.

