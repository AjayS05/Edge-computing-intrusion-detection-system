#!/usr/bin/env bash

set -euo pipefail

BACKEND_IMAGE="edge-backend:v3"
INFERENCE_IMAGE="edge-inference:v1"

SSD_MOUNT="/srv/nfs"
CONTAINERD_DIR="/var/lib/rancher/k3s/agent/containerd"

echo "========================================"
echo "Pi5 K3s image import"
echo "========================================"

echo
echo "1. Checking SSD mount..."

if ! mountpoint -q "${SSD_MOUNT}"; then
    echo "ERROR: ${SSD_MOUNT} is not mounted."
    exit 1
fi

echo "SSD is mounted."

echo
echo "2. Checking K3s containerd directory..."

# sudo is required because /var/lib/rancher/k3s is protected.
if ! sudo test -d "${CONTAINERD_DIR}"; then
    echo "ERROR: K3s containerd directory does not exist:"
    echo "  ${CONTAINERD_DIR}"
    exit 1
fi

echo "Containerd directory exists."

echo
echo "3. Verifying containerd is physically stored on SSD..."

SSD_DEVICE="$(
    df --output=source "${SSD_MOUNT}" \
        | tail -n 1 \
        | xargs
)"

CONTAINERD_DEVICE="$(
    sudo df --output=source "${CONTAINERD_DIR}" \
        | tail -n 1 \
        | xargs
)"

echo "SSD device:        ${SSD_DEVICE}"
echo "Containerd device: ${CONTAINERD_DEVICE}"

if [[ "${SSD_DEVICE}" != "${CONTAINERD_DEVICE}" ]]; then
    echo
    echo "ERROR: K3s containerd is not using the SSD."
    echo "Expected: ${SSD_DEVICE}"
    echo "Found:    ${CONTAINERD_DEVICE}"
    exit 1
fi

echo "Containerd is correctly stored on SSD."

echo
echo "4. Checking K3s service..."

if [[ "$(sudo systemctl is-active k3s)" != "active" ]]; then
    echo "ERROR: K3s is not active."
    exit 1
fi

sudo k3s ctr images list >/dev/null

echo "K3s is active."

echo
echo "5. Checking Docker images..."

if ! docker image inspect "${BACKEND_IMAGE}" >/dev/null 2>&1; then
    echo "ERROR: Docker image not found:"
    echo "  ${BACKEND_IMAGE}"
    exit 1
fi

if ! docker image inspect "${INFERENCE_IMAGE}" >/dev/null 2>&1; then
    echo "ERROR: Docker image not found:"
    echo "  ${INFERENCE_IMAGE}"
    exit 1
fi

echo "Found:"
echo "  ${BACKEND_IMAGE}"
echo "  ${INFERENCE_IMAGE}"

echo
echo "6. Importing directly into K3s containerd..."
echo "No TAR archive will be stored."

docker save \
    "${BACKEND_IMAGE}" \
    "${INFERENCE_IMAGE}" \
    | sudo k3s ctr images import -

echo
echo "7. Verifying imported images..."

IMPORTED_IMAGES="$(
    sudo k3s ctr images list \
        | grep -E 'edge-backend:v3|edge-inference:v1' \
        || true
)"

if [[ -z "${IMPORTED_IMAGES}" ]]; then
    echo "ERROR: Images were not found after import."
    exit 1
fi

echo "${IMPORTED_IMAGES}"

echo
echo "8. Storage verification..."

sudo df -hT \
    / \
    "${SSD_MOUNT}" \
    "${CONTAINERD_DIR}"

echo
echo "========================================"
echo "Pi5 image import completed successfully"
echo "========================================"
