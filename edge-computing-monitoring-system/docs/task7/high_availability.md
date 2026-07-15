# High Availability Approaches

To improve the resilience and availability of the Kubernetes cluster, several high availability mechanisms were implemented. These approaches focus on data protection, workload availability, failure detection, and automatic recovery. Additionally, architectural limitations were identified where further improvements could reduce single points of failure.

# Implemented Approaches

## 1. Backup and Restoration

A backup mechanism was implemented on the Raspberry Pi 5 (RP5) to preserve the critical state of the Kubernetes cluster. The backup script captures the required Kubernetes configuration, certificates, credentials, and persistent data required for disaster recovery.

The following components are included in the backup:

| Path | Contents | Included |
|---|---|---|
| `/var/lib/rancher/k3s/server/db` | SQLite datastore containing Kubernetes objects and cluster state | Yes |
| `/var/lib/rancher/k3s/server/tls` | Cluster certificates required for secure communication | Yes |
| `/var/lib/rancher/k3s/server/cred` | Node credentials and cluster join information | Yes |
| `/var/lib/rancher/k3s/server/manifests` | Auto-deploy Kubernetes manifests | Yes |
| `/var/lib/rancher/k3s/server/logs` | Kubernetes server logs | No (not required for restoration) |
| `/etc/rancher/k3s/k3s.yaml` | Kubernetes administrator kubeconfig | Yes |
| `/var/lib/rancher/k3s/storage` | Local persistent volume data | Yes (stored separately) |

During the backup process, the Kubernetes service is temporarily stopped to ensure data consistency. The required files are compressed into an archive, after which the Kubernetes service is restarted. The backup archive is then transferred from the RP5 to the RP4 and stored on external storage.

This allows the cluster to be restored in case of system failure, accidental deletion, or corruption of Kubernetes state.

---

## 2. Multiple Replicas of Critical Services

To improve application availability, critical workloads were deployed with multiple replicas:

- Frontend service: 3 replicas
- Backend service: 3 replicas
- YOLO inference service: 3 replicas

Running multiple instances ensures that if a Pod fails, Kubernetes can automatically restart it or redirect traffic to healthy replicas. This prevents temporary failures of individual containers from affecting overall service availability.

---

## 3. Node Monitoring and Failure Detection

A monitoring stack using Grafana was deployed to monitor cluster health and resource utilization.

The monitoring system provides visibility into:

- Node availability
- CPU and memory usage
- Application performance
- Resource consumption trends

This helps identify unhealthy nodes and potential failures before they significantly impact the system.

---

## 4. Kubernetes Health Checks

Kubernetes health checks were implemented to enable automatic detection and recovery of unhealthy applications.

The following probes were configured:

- **Liveness Probe:** Determines whether a container is still running correctly. If the check fails, Kubernetes automatically restarts the container.
- **Readiness Probe:** Determines whether a container is ready to receive traffic. Failed containers are removed from service endpoints until they recover.
- **Startup Probe:** Handles applications with longer initialization times by delaying other health checks until startup is completed.

These mechanisms improve Kubernetes self-healing capabilities and reduce the need for manual intervention.

---

# Limitations and Possible Improvements

Although the implemented approaches improve system availability, some infrastructure-level single points of failure remain due to the initial cluster architecture and hardware limitations.

## 1. Multiple Kubernetes Control Planes

The current architecture uses the RP5 as the only Kubernetes control-plane node. This creates a single point of failure because Kubernetes management operations depend entirely on the RP5.

A more highly available architecture would use multiple control-plane nodes by converting additional Raspberry Pi 3 devices into control-plane nodes. This would allow the Kubernetes API server and cluster management components to remain available even if the RP5 fails.

However, the initial architecture was designed around PXE booting all Raspberry Pi 3 nodes from the RP5. Later migration to a multi-control-plane setup would have required significant restructuring of the existing deployment, so the current architecture was maintained.

---

## 2. Distributed Storage Across All Raspberry Pi Nodes

Currently, SeaweedFS uses the available SSD storage and SD cards from two Raspberry Pi 3 nodes.

A more resilient design would include storage from all available Raspberry Pi nodes. Increasing storage distribution and replication would provide:

- Better fault tolerance against storage node failures.
- Improved availability of persistent data.
- Higher storage throughput through parallel access.

This was not implemented due to the hardware allocation decisions made earlier in the project.

---

## 3. Moving Monitoring Services Away from RP5

Currently, the RP5 performs several critical roles:

- Kubernetes control plane
- PXE boot server
- Cluster management
- Monitoring services

This increases the impact of RP5 failure because multiple essential services become unavailable simultaneously.

A better approach would be to deploy monitoring services on an independent device, such as the RP4. This would allow the system to continue detecting and reporting failures even if the Kubernetes control plane becomes unavailable.

---

## 4. Independent Alerting Service

Currently, Telegram-based alerting depends on services running inside Kubernetes.

If the RP5 fails:

- The Kubernetes cluster becomes unavailable.
- Monitoring services may stop.
- Failure notifications cannot be generated.

A more highly available approach would move the alerting service outside Kubernetes and run it independently on the RP4. This ensures that infrastructure failures can still trigger alerts even when the main cluster is offline.

---

# Summary

The implemented high availability mechanisms provide resilience at the application level through backup and restoration, service replication, monitoring, and Kubernetes self-healing features.

However, the current architecture still contains infrastructure-level single points of failure, mainly the RP5 control plane and PXE boot server. Future improvements would focus on removing these dependencies by introducing multiple Kubernetes control planes, expanding distributed storage, and separating monitoring and alerting services from the main cluster infrastructure.