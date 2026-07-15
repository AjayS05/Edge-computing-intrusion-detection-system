#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(
  cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd
)"

cd "$PROJECT_ROOT"

echo "Applying namespace, ConfigMap and Secret..."
kubectl apply -f k8s/00-namespace-config.yaml

echo "Deploying inference..."
kubectl apply -f k8s/20-inference.yaml

echo "Deploying workers..."
kubectl apply -f k8s/30-workers.yaml

echo "Deploying backend..."
kubectl apply -f k8s/10-backend.yaml

echo "Waiting for inference..."
kubectl rollout status \
  deployment/inference \
  -n edge-monitoring \
  --timeout=10m

echo "Waiting for workers..."
kubectl rollout status \
  deployment/image-worker \
  -n edge-monitoring \
  --timeout=10m

echo "Waiting for backend..."
kubectl rollout status \
  deployment/backend \
  -n edge-monitoring \
  --timeout=5m

echo
echo "Deployment completed."

kubectl get pods \
  -n edge-monitoring \
  -o wide

echo
kubectl get services \
  -n edge-monitoring
