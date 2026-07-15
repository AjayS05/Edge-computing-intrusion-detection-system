#!/usr/bin/env bash

set -euo pipefail

NAMESPACE="edge-monitoring"

echo "=== Edge-monitoring workloads ==="

kubectl get pods \
  -n "${NAMESPACE}" \
  -o wide

echo
echo "=== Services and endpoints ==="

kubectl get services \
  -n "${NAMESPACE}"

kubectl get endpointslices \
  -n "${NAMESPACE}"

BACKEND_POD="$(
  kubectl get pods \
    -n "${NAMESPACE}" \
    -l app=edge-backend \
    --field-selector=status.phase=Running \
    --no-headers \
  | awk '$2 == "1/1" {print $1; exit}'
)"

if [[ -z "${BACKEND_POD}" ]]; then
  echo "ERROR: No Ready backend pod was found."
  exit 1
fi

echo
echo "=== Internal service communication ==="

kubectl exec \
  -n "${NAMESPACE}" \
  "${BACKEND_POD}" \
  -- python -c '
import requests

urls = [
    "http://inference.edge-monitoring.svc.cluster.local:8001/health",
    "http://image-worker-headless.edge-monitoring.svc.cluster.local:8002/health",
]

for url in urls:
    try:
        response = requests.get(url, timeout=10)
        print(f"{url} -> HTTP {response.status_code}")
        print(response.text[:300])
    except Exception as exc:
        print(f"{url} -> ERROR: {exc}")
        raise
'

echo
echo "=== External backend access ==="

HTTP_STATUS="$(
  curl \
    -sS \
    -o /dev/null \
    -w '%{http_code}' \
    --max-time 10 \
    http://127.0.0.1:30080/docs
)"

echo "Backend /docs -> HTTP ${HTTP_STATUS}"

if [[ "${HTTP_STATUS}" != "200" ]]; then
  echo "ERROR: Backend NodePort did not return HTTP 200."
  exit 1
fi

echo
echo "========================================"
echo "Kubernetes deployment verification passed"
echo "========================================"
