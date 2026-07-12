# SeaweedFS Distributed Storage on K3s (Raspberry Pi Cluster)

## Overview

This document describes how we deployed SeaweedFS as a distributed object storage system on a K3s Kubernetes cluster built on Raspberry Pi hardware. The goal was to store captured images and event metadata resiliently using an S3-compatible API.

---

## Hardware Setup

| Device | Role | Count | Notes |
|---|---|---|---|
| Raspberry Pi 5 | K3s control plane (master) | 1 | Hosts NFS server, 500GB SSD attached |
| Raspberry Pi 3 | K3s worker nodes | 8 | PXE boot from Pi 5 over network |
| 500GB SSD | Persistent storage backend | 1 | Attached to Pi 5 via USB, mounted at `/srv/nfs` |

All 8 Pi 3 nodes boot via PXE from the Pi 5 — they have no local storage of their own. The Pi 5 serves their root filesystems over NFS from `/srv/nfs/rpi3-0X/`. The SSD provides the only persistent storage in the cluster.

### Network Layout

```
Pi 5 (control plane)   192.168.50.1 / 192.168.178.200
rpi3-01                192.168.50.101
rpi3-02                192.168.50.102
...
rpi3-08                192.168.50.108
```

---

## Why SeaweedFS

We evaluated three options — MinIO (distributed mode), SeaweedFS, and Longhorn — and chose SeaweedFS for these reasons:

- Pi 3 nodes only have 1GB RAM each. SeaweedFS volume servers run comfortably at ~100–256MB RAM, whereas MinIO distributed mode requires 512MB+ per instance.
- SeaweedFS has a native S3-compatible API via its S3 gateway component.
- It supports topology-aware replication across nodes out of the box.
- Official ARM64 Docker images are available.

---

## Storage Architecture

Since all Pi 3s are diskless (PXE boot), we could not use `local-path` storage. Instead:

1. The 500GB SSD on the Pi 5 is partitioned logically into directories under `/srv/nfs/seaweedfs/`.
2. Each directory is exported via NFS — one dedicated export per Pi 3 node (for volume data) plus two more for master and filer metadata.
3. The NFS subdir external provisioner creates a Kubernetes StorageClass per export, allowing Kubernetes PVCs to be backed by specific NFS paths.
4. SeaweedFS volume pods are pinned to specific Pi 3 nodes via `nodeSelector`, and each claims a PVC from its node's dedicated StorageClass.

```
500GB SSD on Pi 5 (/srv/nfs/seaweedfs/)
├── master/        → nfs-seaweedfs-master StorageClass  → seaweedfs-master pod
├── filer/         → nfs-seaweedfs-filer StorageClass   → seaweedfs-filer pod
├── volume-01/     → nfs-rpi3-01 StorageClass           → seaweedfs-volume-0 on rpi3-01
├── volume-02/     → nfs-rpi3-02 StorageClass           → seaweedfs-volume-1 on rpi3-02
...
└── volume-08/     → nfs-rpi3-08 StorageClass           → seaweedfs-volume-7 on rpi3-08
```

SeaweedFS sees 8 separate volume servers across 8 nodes and replicates data across them.

---

## Step-by-Step Deployment

### Prerequisites

- K3s installed with Pi 5 as control plane and Pi 3s as worker nodes
- Helm v3 installed on Pi 5
- `kubectl` configured (see Step 1 below)
- SSD mounted at `/srv/nfs` on Pi 5
- NFS server installed on Pi 5: `sudo apt install nfs-kernel-server`

---

### Step 1 — Fix kubectl permissions

K3s restricts `/etc/rancher/k3s/k3s.yaml` by default. Copy it to your user's kubeconfig:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown pi5:pi5 ~/.kube/config
chmod 600 ~/.kube/config

echo 'export KUBECONFIG=~/.kube/config' >> ~/.bashrc
source ~/.bashrc

kubectl get nodes
```

---

### Step 2 — Prepare SSD directories

```bash
sudo mkdir -p /srv/nfs/seaweedfs/{master,filer,volume-01,volume-02,volume-03,volume-04,volume-05,volume-06,volume-07,volume-08}
sudo chown -R pi5:pi5 /srv/nfs/seaweedfs
ls -la /srv/nfs/seaweedfs/
```

---

### Step 3 — Configure NFS exports

Append SeaweedFS exports to `/etc/exports` (do not remove existing PXE exports for Pi 3 root filesystems):

```bash
sudo tee -a /etc/exports << 'EOF'

# SeaweedFS storage exports
/srv/nfs/seaweedfs/master    *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/filer     *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-01 *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-02 *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-03 *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-04 *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-05 *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-06 *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-07 *(rw,sync,no_subtree_check,no_root_squash,insecure)
/srv/nfs/seaweedfs/volume-08 *(rw,sync,no_subtree_check,no_root_squash,insecure)
EOF

sudo exportfs -ra
sudo exportfs -v
```

You should see all exports listed under `<world>(sync,wdelay,hide,no_subtree_check,...)`.

---

### Step 4 — Install NFS subdir external provisioner

This creates a Kubernetes StorageClass backed by each NFS export. We install one provisioner instance per volume directory plus two for master and filer.

```bash
helm repo add nfs-subdir-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
helm repo update

kubectl create namespace nfs-provisioner

# One provisioner per Pi 3 worker node
for i in 01 02 03 04 05 06 07 08; do
  helm install nfs-provisioner-rpi3-$i \
    nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
    --namespace nfs-provisioner \
    --set nfs.server=192.168.50.1 \
    --set nfs.path=/srv/nfs/seaweedfs/volume-$i \
    --set storageClass.name=nfs-rpi3-$i \
    --set storageClass.defaultClass=false \
    --set storageClass.reclaimPolicy=Retain \
    --set "nodeSelector.kubernetes\.io/hostname=rpi3-$i"
done

# Provisioner for master metadata
helm install nfs-provisioner-master \
  nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioner \
  --set nfs.server=192.168.50.1 \
  --set nfs.path=/srv/nfs/seaweedfs/master \
  --set storageClass.name=nfs-seaweedfs-master \
  --set storageClass.defaultClass=false \
  --set storageClass.reclaimPolicy=Retain

# Provisioner for filer metadata
helm install nfs-provisioner-filer \
  nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioner \
  --set nfs.server=192.168.50.1 \
  --set nfs.path=/srv/nfs/seaweedfs/filer \
  --set storageClass.name=nfs-seaweedfs-filer \
  --set storageClass.defaultClass=false \
  --set storageClass.reclaimPolicy=Retain

# Verify
kubectl get pods -n nfs-provisioner
kubectl get storageclass
```

Expected: 10 provisioner pods all `Running`, 10 StorageClasses created (`nfs-rpi3-01` through `nfs-rpi3-08`, `nfs-seaweedfs-master`, `nfs-seaweedfs-filer`).

---

### Step 5 — Install SeaweedFS via Helm

Create the values file:

```bash
cat > ~/seaweedfs/values-pi.yaml << 'EOF'
global:
  replicationPlacement: "001"
  enableSecurity: false

master:
  enabled: true
  replicas: 1
  port: 9333
  grpcPort: 19333
  storage:
    type: persistentVolumeClaim
    storageClass: "nfs-seaweedfs-master"
    size: 5Gi
  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "500m"
  affinity: ""

filer:
  enabled: true
  replicas: 1
  port: 8888
  grpcPort: 18888
  storage:
    type: persistentVolumeClaim
    storageClass: "nfs-seaweedfs-filer"
    size: 5Gi
  data:
    type: "leveldb"
  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "500m"
  affinity: ""

volume:
  enabled: true
  port: 8080
  grpcPort: 18080
  replicas: 8
  storage:
    type: persistentVolumeClaim
    size: 40Gi
  resources:
    requests:
      memory: "128Mi"
      cpu: "200m"
    limits:
      memory: "512Mi"
      cpu: "800m"
  affinity: ""
  dataDirs:
    - name: data
      type: "persistentVolumeClaim"
      storageClass: "nfs-rpi3-01"
      size: 40Gi
      maxVolumes: 50

s3:
  enabled: true
  replicas: 1
  port: 8333
  resources:
    requests:
      memory: "64Mi"
      cpu: "100m"
    limits:
      memory: "128Mi"
      cpu: "300m"
  service:
    type: NodePort
    port: 8333
    nodePort: 30333
  buckets:
    - name: captured-images
      anonymousRead: false
    - name: event-metadata
      anonymousRead: false
EOF
```

Install SeaweedFS:

```bash
helm repo add seaweedfs https://seaweedfs.github.io/seaweedfs/helm
helm repo update

kubectl create namespace seaweedfs

helm install seaweedfs seaweedfs/seaweedfs \
  -n seaweedfs \
  -f ~/seaweedfs/values-pi.yaml

# Watch rollout
kubectl get pods -n seaweedfs -w
```

Expected pods when complete:

```
seaweedfs-filer-0               1/1 Running
seaweedfs-master-0              1/1 Running
seaweedfs-s3-<hash>             1/1 Running
seaweedfs-volume-0 through -7   1/1 Running (each on a different rpi3 node)
```

---

### Step 6 — Find the S3 NodePort and test

Kubernetes may assign a different NodePort than requested. Always check:

```bash
kubectl get svc -n seaweedfs
# Look for seaweedfs-s3 NodePort — note the actual port assigned (e.g. 30413)
```

Install the MinIO client (`mc`) to test:

```bash
wget https://dl.min.io/client/mc/release/linux-arm64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Set alias using Pi 5's external IP and the actual NodePort
mc alias set seaweedfs http://192.168.178.200:<NODEPORT> "" "" --api S3v4

# Create buckets (Helm auto-bucket creation may not fire)
mc mb seaweedfs/captured-images
mc mb seaweedfs/event-metadata

# List buckets
mc ls seaweedfs

# Upload a test file
echo "SeaweedFS is working" > /tmp/test.txt
mc cp /tmp/test.txt seaweedfs/captured-images/test.txt

# Read it back
mc cat seaweedfs/captured-images/test.txt
```

---

## Accessing the S3 API from Applications

Use any S3-compatible SDK or tool. Example with Python boto3:

```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="http://192.168.178.200:<NODEPORT>",
    aws_access_key_id="",
    aws_secret_access_key="",
    region_name="us-east-1"
)

# Upload a captured image
s3.upload_file("/path/to/image.jpg", "captured-images", "2026/06/22/camera1/image.jpg")

# Upload event metadata
import json
metadata = {"timestamp": "2026-06-22T11:00:00Z", "camera": "camera1", "event": "motion_detected"}
s3.put_object(Bucket="event-metadata", Key="events/2026/06/22/event1.json", Body=json.dumps(metadata))
```

---

## Storage Capacity Summary

```
Total SSD:                    458GB
Pi 3 root filesystems:        ~57GB  (8 × ~7GB)
Other existing projects:      ~1.3GB
SeaweedFS volumes (8 × 40GB): 320GB
SeaweedFS master + filer:     ~10GB
Free headroom:                ~70GB
```

---

## Known Limitations

- **Single physical disk**: All NFS exports come from one SSD on the Pi 5. If the SSD fails, all storage is lost. For production, use RAID or replicated disks.
- **NFS bottleneck**: All 8 Pi 3s share the Pi 5's USB bandwidth (~400MB/s). Heavy parallel writes may saturate this.
- **PVC distribution**: In the current Helm chart version, all volume PVCs may bind to the same StorageClass (`nfs-rpi3-01`) instead of spreading across nodes. Topology-aware volume groups require additional chart configuration.
- **No auth on S3**: The current setup uses anonymous S3 access. For production, configure SeaweedFS IAM credentials.

---

## Useful Commands

```bash
# Check all SeaweedFS pods
kubectl get pods -n seaweedfs -o wide

# Check PVC bindings
kubectl get pvc -n seaweedfs

# Check NFS exports
sudo exportfs -v

# Check SSD usage
df -h /srv/nfs
du -sh /srv/nfs/seaweedfs/*

# Restart SeaweedFS
helm upgrade seaweedfs seaweedfs/seaweedfs -n seaweedfs -f ~/seaweedfs/values-pi.yaml

# Uninstall SeaweedFS (PVCs are Retain — data is preserved)
helm uninstall seaweedfs -n seaweedfs
```