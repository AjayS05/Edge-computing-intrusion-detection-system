#!/usr/bin/env bash
set -euo pipefail

OUTPUT_PATH="${1:-$HOME/camera-test.jpg}"

if command -v rpicam-still >/dev/null 2>&1; then
  CAMERA_COMMAND="rpicam-still"
elif command -v libcamera-still >/dev/null 2>&1; then
  CAMERA_COMMAND="libcamera-still"
else
  echo "Camera command not found. Expected rpicam-still or libcamera-still." >&2
  exit 1
fi

"$CAMERA_COMMAND" \
  --nopreview \
  --immediate \
  --width 640 \
  --height 480 \
  --quality 85 \
  --output "$OUTPUT_PATH"

echo "Captured image: $OUTPUT_PATH"
ls -lh "$OUTPUT_PATH"
