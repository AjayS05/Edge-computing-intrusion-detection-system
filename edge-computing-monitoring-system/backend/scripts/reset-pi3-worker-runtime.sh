#!/usr/bin/env bash

set -euo pipefail

NAMESPACE="edge-monitoring"
DEPLOYMENT="image-worker"
WORKER_LABEL="app=edge-image-worker"
NODE_LABEL="edge-role=image-worker"
REMOTE_USER="pi3"
EXPECTED_WORKERS=8

SSH_OPTIONS=(
    -o ConnectTimeout=10
    -o ServerAliveInterval=5
    -o ServerAliveCountMax=3
    -o StrictHostKeyChecking=accept-new
)

echo "============================================"
echo "Reset Pi3 worker runtime safely"
echo "============================================"

echo
echo "1. Discovering labeled Pi3 worker nodes..."

mapfile -t WORKER_NODES < <(
    kubectl get nodes \
        -l "${NODE_LABEL}" \
        -o jsonpath='{range .items[*]}{.metadata.name}{"|"}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}'
)

if (( ${#WORKER_NODES[@]} == 0 )); then
    echo "ERROR: No nodes have label:"
    echo "  ${NODE_LABEL}"
    exit 1
fi

echo "Found ${#WORKER_NODES[@]} worker nodes:"

for entry in "${WORKER_NODES[@]}"; do
    node="${entry%%|*}"
    ip="${entry##*|}"
    printf '  %-15s %s\n' "${node}" "${ip}"
done

if (( ${#WORKER_NODES[@]} != EXPECTED_WORKERS )); then
    echo
    echo "WARNING: Expected ${EXPECTED_WORKERS} workers but found ${#WORKER_NODES[@]}."
    echo "The script will continue with the discovered nodes."
fi

echo
echo "2. Scaling the worker Deployment to zero..."

kubectl scale deployment "${DEPLOYMENT}" \
    -n "${NAMESPACE}" \
    --replicas=0

echo
echo "Waiting for worker pods to terminate..."

for attempt in $(seq 1 24); do
    POD_COUNT="$(
        kubectl get pods \
            -n "${NAMESPACE}" \
            -l "${WORKER_LABEL}" \
            -o name \
            2>/dev/null \
        | wc -l
    )"

    POD_COUNT="${POD_COUNT// /}"

    if [[ "${POD_COUNT}" == "0" ]]; then
        echo "All worker pods have terminated."
        break
    fi

    echo "  ${POD_COUNT} worker pod(s) still present..."
    sleep 5
done

POD_COUNT="$(
    kubectl get pods \
        -n "${NAMESPACE}" \
        -l "${WORKER_LABEL}" \
        -o name \
        2>/dev/null \
    | wc -l
)"
POD_COUNT="${POD_COUNT// /}"

if [[ "${POD_COUNT}" != "0" ]]; then
    echo
    echo "Some failed pods did not terminate normally."
    echo "Force deleting only image-worker pods..."

    kubectl delete pod \
        -n "${NAMESPACE}" \
        -l "${WORKER_LABEL}" \
        --grace-period=0 \
        --force \
        --wait=false \
        || true

    sleep 5
fi

echo
echo "3. Restarting K3s agents one node at a time..."

FAILED_NODES=()

for entry in "${WORKER_NODES[@]}"; do
    node="${entry%%|*}"
    ip="${entry##*|}"

    echo
    echo "--------------------------------------------"
    echo "Node: ${node}"
    echo "IP:   ${ip}"
    echo "--------------------------------------------"

    if [[ -z "${ip}" ]]; then
        echo "ERROR: No InternalIP found for ${node}."
        FAILED_NODES+=("${node}")
        continue
    fi

    echo "Restarting k3s-agent without blocking SSH..."

    if ! ssh -tt "${SSH_OPTIONS[@]}" \
        "${REMOTE_USER}@${ip}" '
            set -u

            SERVICE="k3s-agent"

            if ! systemctl list-unit-files --type=service \
                | grep -q "^k3s-agent.service"; then
                echo "ERROR: k3s-agent.service was not found."
                exit 1
            fi

            OLD_PID="$(
                systemctl show \
                    --property=MainPID \
                    --value \
                    "${SERVICE}"
            )"

            echo "Old k3s-agent PID: ${OLD_PID}"

            sudo systemctl --no-block restart "${SERVICE}"

            echo "Restart request submitted."

            for attempt in $(seq 1 45); do
                sleep 2

                STATE="$(
                    systemctl is-active "${SERVICE}" \
                    2>/dev/null \
                    || true
                )"

                NEW_PID="$(
                    systemctl show \
                        --property=MainPID \
                        --value \
                        "${SERVICE}" \
                        2>/dev/null \
                        || echo 0
                )"

                if [[ "${STATE}" == "active" ]] \
                    && [[ "${NEW_PID}" != "0" ]] \
                    && [[ "${NEW_PID}" != "${OLD_PID}" ]]; then
                    echo "k3s-agent restarted successfully."
                    echo "New PID: ${NEW_PID}"
                    exit 0
                fi

                echo "  state=${STATE:-unknown}, pid=${NEW_PID:-0}"
            done

            echo "ERROR: k3s-agent did not complete restart within 90 seconds."
            exit 1
        '
    then
        echo "ERROR: Restart failed on ${node}."
        FAILED_NODES+=("${node}")
        continue
    fi

    echo "Waiting for Kubernetes node ${node} to report Ready..."

    NODE_READY="false"

    for attempt in $(seq 1 36); do
        READY_STATUS="$(
            kubectl get node "${node}" \
                -o jsonpath='{range .status.conditions[?(@.type=="Ready")]}{.status}{end}' \
                2>/dev/null \
                || true
        )"

        if [[ "${READY_STATUS}" == "True" ]]; then
            NODE_READY="true"
            echo "${node} is Ready."
            break
        fi

        echo "  ${node} status: ${READY_STATUS:-unavailable}"
        sleep 5
    done

    if [[ "${NODE_READY}" != "true" ]]; then
        echo "ERROR: ${node} did not return to Ready state."
        FAILED_NODES+=("${node}")
    fi
done

echo
echo "4. Checking node restart results..."

if (( ${#FAILED_NODES[@]} > 0 )); then
    echo "ERROR: These nodes failed:"
    printf '  %s\n' "${FAILED_NODES[@]}"

    echo
    kubectl get nodes \
        -l "${NODE_LABEL}" \
        -o wide

    echo
    echo "Workers will remain scaled to zero."
    exit 1
fi

kubectl get nodes \
    -l "${NODE_LABEL}" \
    -o wide

echo
echo "5. Scaling the worker Deployment back to ${EXPECTED_WORKERS}..."

kubectl scale deployment "${DEPLOYMENT}" \
    -n "${NAMESPACE}" \
    --replicas="${EXPECTED_WORKERS}"

echo
echo "Waiting for Kubernetes to create ${EXPECTED_WORKERS} worker pods..."

for attempt in $(seq 1 60); do
    POD_COUNT="$(
        kubectl get pods \
            -n "${NAMESPACE}" \
            -l "${WORKER_LABEL}" \
            -o name \
            2>/dev/null \
        | wc -l
    )"

    POD_COUNT="${POD_COUNT// /}"

    echo "  worker pods created: ${POD_COUNT}/${EXPECTED_WORKERS}"

    if (( POD_COUNT >= EXPECTED_WORKERS )); then
        break
    fi

    sleep 5
done

echo
echo "6. Waiting for all worker pods to become Ready..."

if ! kubectl wait \
    --for=condition=Ready \
    pod \
    -n "${NAMESPACE}" \
    -l "${WORKER_LABEL}" \
    --timeout=10m
then
    echo
    echo "ERROR: Not all image-worker pods became Ready."

    echo
    echo "Current worker pods:"
    kubectl get pods \
        -n "${NAMESPACE}" \
        -l "${WORKER_LABEL}" \
        -o wide

    echo
    echo "Recent worker events:"
    kubectl get events \
        -n "${NAMESPACE}" \
        --sort-by=.metadata.creationTimestamp \
        | tail -40

    exit 1
fi

echo
echo "7. Checking Deployment rollout..."

kubectl rollout status \
    deployment/"${DEPLOYMENT}" \
    -n "${NAMESPACE}" \
    --timeout=2m

echo
echo "Final worker placement:"

kubectl get pods \
    -n "${NAMESPACE}" \
    -l "${WORKER_LABEL}" \
    -o custom-columns='POD:.metadata.name,READY:.status.containerStatuses[0].ready,PHASE:.status.phase,NODE:.spec.nodeName,IP:.status.podIP'

echo
echo "============================================"
echo "Pi3 worker reset completed successfully"
echo "============================================"
