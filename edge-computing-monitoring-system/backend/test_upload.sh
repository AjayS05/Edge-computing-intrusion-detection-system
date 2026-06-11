#!/usr/bin/env bash
set -euo pipefail

IMAGE_PATH="${1:-test-image.jpg}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"

curl --fail --show-error --silent \
  -X POST "${BACKEND_URL}/api/v1/frames" \
  -F "image=@${IMAGE_PATH};type=image/jpeg" \
  -F "sensor_node_id=rpi4-camera-01" \
  -F "captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -F "sequence_number=1" \
  -F "camera_location=lab-entry"
printf '\n'
