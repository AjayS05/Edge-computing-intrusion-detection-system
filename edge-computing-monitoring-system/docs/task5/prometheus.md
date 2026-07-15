# Prometheus Deployment and Configuration

> Reproducible Prometheus and Alertmanager deployment guide for the Raspberry Pi K3s cluster.

**Namespace:** `monitoring`  
**Helm release:** `prometheus`  
**Chart:** `prometheus-community/kube-prometheus-stack`  
**External port:** `30090`  
**Related documentation:** [Monitoring overview](monitoring.md) · [Grafana](grafana.md)

---

## 1. Prerequisites

Run the following commands from Pi5. Confirm that the K3s cluster is reachable and that Helm and kubectl are installed:

```bash
kubectl get nodes -o wide
helm version
kubectl version --client
```

The Pi5 control plane and required Pi3 workers should report `Ready`. Pi4 does not need to appear as a Kubernetes node because it is monitored through its host Node Exporter endpoint.

Confirm that the Raspberry Pi Node Exporters respond before installing Prometheus:

```bash
for ip in 192.168.178.200 192.168.50.144 192.168.50.{101..108}; do
  if curl -sf --connect-timeout 3 "http://$ip:9100/metrics" >/dev/null; then
    echo "$ip:9100 UP"
  else
    echo "$ip:9100 DOWN"
  fi
done
```

All ten addresses must report `UP` before Prometheus is configured to scrape them. This command performs read-only HTTP requests and does not modify the exporters.

---

## 2. Add the Helm repository

```bash
helm repo add prometheus-community \
  https://prometheus-community.github.io/helm-charts

helm repo update
```

Verify that the chart is available:

```bash
helm search repo prometheus-community/kube-prometheus-stack
```

---

## 3. Helm values

Create `prometheus-k3s-values.yaml` in the working directory:

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
              - 192.168.178.200:9100
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
  service:
    type: NodePort
    port: 80
    targetPort: 3000
    nodePort: 30300

alertmanager:
  enabled: true

kube-state-metrics:
  enabled: true
```

`nodeExporter.enabled` is set to `false` because Node Exporter already runs directly on each Raspberry Pi host.

The configuration also:

- exposes Prometheus through NodePort `30090`;
- exposes Grafana through NodePort `30300`;
- retains Prometheus metrics for seven days;
- scrapes Pi5, Pi4, and eight Pi3 exporters every 15 seconds;
- enables Alertmanager and kube-state-metrics.

---

## 4. Validate and install

Validate the generated Kubernetes resources without modifying the cluster:

```bash
helm template prometheus \
  prometheus-community/kube-prometheus-stack \
  -n monitoring \
  -f prometheus-k3s-values.yaml >/dev/null \
  && echo "Helm configuration validation: PASS"
```

Expected output:

```text
Helm configuration validation: PASS
```

Install or update the monitoring stack:

```bash
helm upgrade --install prometheus \
  prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f prometheus-k3s-values.yaml \
  --set nodeExporter.enabled=false \
  --wait \
  --timeout 30m
```

`helm upgrade --install` installs the release when it does not exist and updates the same release when it already exists.

---

## 5. Verify the deployment

Verify the Helm release:

```bash
helm list -n monitoring
helm status prometheus -n monitoring
```

Display only running monitoring pods for a clean terminal result:

```bash
kubectl get pods -n monitoring \
  --field-selector=status.phase=Running \
  -o wide
```

Verify the services and their ports:

```bash
kubectl get svc -n monitoring \
  -o custom-columns='NAME:.metadata.name,TYPE:.spec.type,PORTS:.spec.ports[*].port,NODEPORTS:.spec.ports[*].nodePort'
```

Confirm that no Kubernetes Node Exporter DaemonSet was created:

```bash
kubectl get daemonset -n monitoring
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

Produce a short readiness result suitable for documentation:

```bash
printf 'Prometheus readiness: '
curl -fsS http://192.168.178.200:30090/-/ready
```

Access pages:

| Page | URL |
|---|---|
| Prometheus | `http://192.168.178.200:30090` |
| Targets | `http://192.168.178.200:30090/targets` |
| Rules | `http://192.168.178.200:30090/rules` |
| Alerts | `http://192.168.178.200:30090/alerts` |

> **IMAGE REQUIRED — Healthy monitoring components**  
> Save as: `images/monitoring/prometheus-pods-healthy.png`  
> Capture the clean running-pods command above. The screenshot should show Prometheus, Alertmanager, the Operator, kube-state-metrics, and Grafana in `Running` state. Replace this placeholder with:  
> `![Healthy Prometheus monitoring components](images/monitoring/prometheus-pods-healthy.png)`

![Raspberry Pi Node Exporter targets reporting UP](images/monitoring/prometheus-targets.png)

The targets screenshot must show all ten `raspberry-pi-nodes` endpoints in the `UP` state. Zoom out or capture a second view if all rows do not fit in one screenshot.

The same result can be verified in the terminal without changing Prometheus:

```bash
curl -sG \
  --data-urlencode 'query=up{job="raspberry-pi-nodes"}' \
  http://192.168.178.200:30090/api/v1/query \
  | jq -r '.data.result[] | "\(.metric.instance) = \(.value[1])"' \
  | sort
```

Expected: ten instances, each with value `1`.

Count the returned targets:

```bash
curl -sG \
  --data-urlencode 'query=up{job="raspberry-pi-nodes"}' \
  http://192.168.178.200:30090/api/v1/query \
  | jq '.data.result | length'
```

Expected output:

```text
10
```

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
    rate(node_cpu_seconds_total{
      job="raspberry-pi-nodes",
      mode="idle"
    }[2m])
  ) * 100
)
```

### Memory usage

```promql
100 * (
  1 - (
    node_memory_MemAvailable_bytes{job="raspberry-pi-nodes"}
    /
    node_memory_MemTotal_bytes{job="raspberry-pi-nodes"}
  )
)
```

### Disk usage

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

### Temperature

```promql
max by(instance) (
  node_hwmon_temp_celsius{job="raspberry-pi-nodes"}
)
```

Alternative metric:

```promql
max by(instance) (
  node_thermal_zone_temp{job="raspberry-pi-nodes"}
)
```

### Network receive

```promql
sum by(instance) (
  rate(node_network_receive_bytes_total{
    job="raspberry-pi-nodes",
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

### Network transmit

```promql
sum by(instance) (
  rate(node_network_transmit_bytes_total{
    job="raspberry-pi-nodes",
    device!~"lo|veth.*|docker.*|cni.*|flannel.*"
  }[2m])
)
```

> **IMAGE REQUIRED — PromQL result**  
> Save as: `images/monitoring/prometheus-query-result.png`  
> Run `up{job="raspberry-pi-nodes"}` on the Prometheus Query page and capture the result showing every configured instance with value `1`. Replace this placeholder with:  
> `![PromQL node availability result](images/monitoring/prometheus-query-result.png)`

For a concise terminal alternative, run:

```bash
curl -sG \
  --data-urlencode 'query=count(up{job="raspberry-pi-nodes"} == 1)' \
  http://192.168.178.200:30090/api/v1/query \
  | jq -r '"Online Raspberry Pi targets: \(.data.result[0].value[1])"'
```

Expected output:

```text
Online Raspberry Pi targets: 10
```

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

Produce a concise Kubernetes result:

```bash
kubectl get prometheusrule raspberry-pi-alerts \
  -n monitoring \
  -o custom-columns='NAME:.metadata.name,NAMESPACE:.metadata.namespace,GROUPS:.spec.groups[*].name'
```

Verify through the Prometheus API:

```bash
curl -s http://192.168.178.200:30090/api/v1/rules \
  | grep -oE 'RaspberryPi[A-Za-z]+' \
  | sort -u
```

![Loaded Raspberry Pi alert rules](images/monitoring/raspberry-pi-alert-rules.png)

The screenshot is valid evidence that the `raspberry-pi-cluster` rule group loaded successfully and that all displayed rules were evaluated with status `OK`. The temperature-rule names include the `Hwmon` suffix in the running configuration; this naming difference does not change their purpose.

Screenshots of a firing node-down alert or Alertmanager notification are optional. Do not stop a working node solely to create documentation evidence. The loaded-rules screenshot is sufficient to demonstrate the alert-rule configuration.

---

## 8. Backend service discovery

Kubernetes workloads access Prometheus through its internal service:

```text
http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

```bash
kubectl set env deployment/backend \
  -n edge-monitoring \
  PROMETHEUS_URL=http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

Wait for the backend rollout and confirm its configured URL:

```bash
kubectl rollout status deployment/backend \
  -n edge-monitoring \
  --timeout=5m

kubectl exec -n edge-monitoring deployment/backend -- \
  printenv PROMETHEUS_URL
```

Expected URL:

```text
http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
```

Verify Prometheus readiness from inside the backend pod:

```bash
kubectl exec -n edge-monitoring deployment/backend -- \
  python -c "import urllib.request; print(urllib.request.urlopen('http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090/-/ready').read().decode())"
```

Expected output:

```text
Prometheus Server is Ready.
```

---

## 9. Required screenshots

The following screenshots provide sufficient evidence without disrupting the working cluster:

| Screenshot | Required content | Repository path |
|---|---|---|
| Healthy components | Running Prometheus, Alertmanager, Operator, kube-state-metrics, and Grafana pods | `images/monitoring/prometheus-pods-healthy.png` |
| Prometheus targets | All ten `raspberry-pi-nodes` endpoints showing `UP` | `images/monitoring/prometheus-targets.png` |
| PromQL result | Node availability query showing ten online targets | `images/monitoring/prometheus-query-result.png` |
| Alert rules | `raspberry-pi-cluster` rules loaded with status `OK` | `images/monitoring/raspberry-pi-alert-rules.png` |

The PromQL screenshot is optional when the targets screenshot clearly shows all ten targets and the terminal count output is included. A firing-alert screenshot is also optional because creating one may require intentionally interrupting a working exporter.

Do not include screenshots containing passwords, tokens, failed installation attempts, stale `ContainerStatusUnknown` pods, or unrelated terminal output.

---

## 10. Files to commit to GitHub

Commit the following documentation and configuration files:

```text
prometheus.md
prometheus-k3s-values.yaml
k8s/
└── monitoring/
    └── raspberry-pi-alerts.yaml
images/
└── monitoring/
    ├── prometheus-pods-healthy.png
    ├── prometheus-targets.png
    ├── prometheus-query-result.png
    └── raspberry-pi-alert-rules.png
```

If the PromQL screenshot is omitted, do not add an empty `prometheus-query-result.png` file.

Do not commit:

- Grafana administrator passwords;
- Kubernetes Secret values;
- kubeconfig files;
- private SSH keys;
- environment files containing tokens or credentials;
- temporary terminal-output files.

Suggested commit command:

```bash
git add prometheus.md \
  prometheus-k3s-values.yaml \
  k8s/monitoring/raspberry-pi-alerts.yaml \
  images/monitoring/prometheus-pods-healthy.png \
  images/monitoring/prometheus-targets.png \
  images/monitoring/raspberry-pi-alert-rules.png

git commit -m "docs: document Prometheus monitoring deployment"
```

Add `images/monitoring/prometheus-query-result.png` to the `git add` command only when that screenshot is present.

---

## 11. Result

Prometheus is deployed through `kube-prometheus-stack` in the K3s `monitoring` namespace. It scrapes the ten host Node Exporters, stores seven days of metrics, evaluates the Raspberry Pi alert rules, supplies Grafana dashboards, and provides monitoring data to the FastAPI backend through Kubernetes service discovery.
