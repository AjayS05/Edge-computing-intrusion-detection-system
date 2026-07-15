#!/usr/bin/env bash

set -euo pipefail

IMAGE_ARCHIVE="/srv/nfs/edge-monitoring/images/edge-worker-v1.tar"
REMOTE_USER="pi3"

PI3_IPS=(
    "192.168.50.107"
    "192.168.50.108"
)

if [[ ! -f "${IMAGE_ARCHIVE}" ]]; then
    echo "ERROR: Worker archive not found:"
    echo "  ${IMAGE_ARCHIVE}"
    exit 1
fi

for ip in "${PI3_IPS[@]}"; do
    echo
    echo "========================================"
    echo "Processing ${ip}"
    echo "========================================"

    echo "Checking available space..."

    ssh "${REMOTE_USER}@${ip}" \
      'df -h /home/pi3; sudo df -h /var/lib/rancher/k3s/agent/containerd'

    echo "Removing previous temporary archive..."

    ssh "${REMOTE_USER}@${ip}" \
      'rm -f /home/pi3/edge-worker-v1.tar /tmp/edge-worker-v1.tar'

    echo "Copying worker image..."

    scp \
      "${IMAGE_ARCHIVE}" \
      "${REMOTE_USER}@${ip}:/home/pi3/edge-worker-v1.tar"

    echo "Importing image..."

    ssh -t "${REMOTE_USER}@${ip}" \
      'sudo k3s ctr images import /home/pi3/edge-worker-v1.tar'

    echo "Verifying image..."

    ssh "${REMOTE_USER}@${ip}" \
      'sudo k3s ctr images list | grep edge-worker'

    echo "Removing temporary archive..."

    ssh "${REMOTE_USER}@${ip}" \
      'rm -f /home/pi3/edge-worker-v1.tar'

    echo "${ip} completed successfully."
done

echo
echo "All Pi3 worker image imports completed."
