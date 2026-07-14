#!/usr/bin/env bash
set -euo pipefail

IMAGE_DIR="/srv/nfs/edge-monitoring/images"
ARCHIVE="$IMAGE_DIR/pi5-application-images.tar"

sudo mkdir -p "$IMAGE_DIR"
sudo chown "$(id -u):$(id -g)" "$IMAGE_DIR"

docker save \
  edge-backend:v3 \
  edge-inference:v1 \
  -o "$ARCHIVE"

sudo k3s ctr images import "$ARCHIVE"

sudo k3s ctr images list | grep -E \
  'edge-backend|edge-inference'
