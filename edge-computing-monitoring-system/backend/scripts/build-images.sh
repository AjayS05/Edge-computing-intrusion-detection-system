#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

export DOCKER_BUILDKIT=1
export TMPDIR="${TMPDIR:-/srv/nfs/tmp}"

mkdir -p "$TMPDIR"

docker build \
  --progress=plain \
  -f docker/Dockerfile.backend \
  -t edge-backend:v3 \
  .

docker build \
  --progress=plain \
  -f docker/Dockerfile.inference \
  -t edge-inference:v1 \
  .

docker build \
  --progress=plain \
  -f docker/Dockerfile.worker \
  -t edge-worker:v1 \
  .

docker image ls \
  edge-backend:v3 \
  edge-inference:v1 \
  edge-worker:v1
