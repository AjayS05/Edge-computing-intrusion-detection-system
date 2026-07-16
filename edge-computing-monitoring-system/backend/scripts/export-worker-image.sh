#!/usr/bin/env bash
set -euo pipefail

IMAGE_DIR="/srv/nfs/edge-monitoring/images"
ARCHIVE="$IMAGE_DIR/edge-worker-v1.tar"

sudo mkdir -p "$IMAGE_DIR"
sudo chown "$(id -u):$(id -g)" "$IMAGE_DIR"

docker save edge-worker:v1 -o "$ARCHIVE"

echo "Worker archive created:"
echo "$ARCHIVE"
echo
echo "Copy and import this exact archive on every Pi3 worker node:"
echo "  sudo k3s ctr images import /tmp/edge-worker-v1.tar"
