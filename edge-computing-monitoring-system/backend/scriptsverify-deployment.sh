#!/usr/bin/env bash
set -euo pipefail

echo "=== Nodes and labels ==="
kubectl get nodes --show-labels

echo
echo "=== Edge-monitoring pods ==="
kubectl get pods -n edge-monitoring -o wide

echo
echo "=== Services and endpoints ==="
kubectl get services -n edge-monitoring
kubectl get endpointslices -n edge-monitoring

echo
echo "=== Inference health from backend pod ==="
BACKEND_POD="$(
  kubectl get pods \
    -n edge-monitoring \
    -l app=edge-backend \
    -o jsonpath='{.items[0].metadata.name}'
)"

kubectl exec \
  -n edge-monitoring \
  "$BACKEND_POD" \
  -- python - <<'PY'
import requests

for url in (
    "http://inference.edge-monitoring.svc.cluster.local:8001/health",
    "http://image-worker-headless.edge-monitoring.svc.cluster.local:8002/health",
):
    try:
        response = requests.get(url, timeout=5)
        print(url, response.status_code, response.text[:300])
    except Exception as exc:
        print(url, "ERROR", exc)
PY

echo
echo "=== External backend health/socket check ==="
curl -i --max-time 10 http://127.0.0.1:30080/ || true
