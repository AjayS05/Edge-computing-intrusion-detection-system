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

## Storage Architecture (Initial Deployment)

Since all Pi 3s are diskless (PXE boot), we could not use `local-path` storage at first. Instead:

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

**Important note on "distributed" here:** this setup is distributed at the *application layer* — SeaweedFS runs 8 independent volume server processes, each tracked separately by the master, each capable of holding its own replica set under `global.replicationPlacement`. From SeaweedFS's point of view, it genuinely sees 8 separate volume servers to place and replicate data across. But at the *physical layer*, all 8 of those "separate" volumes are really subdirectories on one underlying disk (the Pi 5's SSD), reached over NFS. So the failure domain is still a single point of failure — if that SSD or the Pi 5 itself goes down, every volume server loses its backing store simultaneously, regardless of how many "nodes" SeaweedFS thinks it's spread across. This is called out explicitly in the Known Limitations section further down, and is the exact gap the next section closes.

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

## Extending to True Node-Local Distributed Storage

The initial deployment above is distributed in the sense that SeaweedFS's master tracks 8 independent volume servers and can replicate across them — but as noted earlier, every one of those "independent" volumes physically lives on one SSD attached to the Pi 5, reached over NFS. That's a single physical failure domain wearing eight different hats.

To make the storage genuinely distributed — physically, not just logically — we added local disks directly to individual Pi 3 nodes (and used the Pi 5's own local SSD too) and ran a second, node-local SeaweedFS volume deployment alongside the original one, joined to the same master.

### Step 1 — Add local disk to individual Pi 3 nodes

Each Pi 3 that PXE-boots its root filesystem over NFS still has a physical microSD card slot sitting unused. We partitioned and mounted a card on two of the nodes (`rpi3-01`, `rpi3-02`):

```bash
# check the card is present and unpartitioned
lsblk
sudo fdisk -l /dev/mmcblk0

# partition and format
sudo parted /dev/mmcblk0 --script mklabel gpt mkpart primary ext4 0% 100%
sudo mkfs.ext4 /dev/mmcblk0p1

# mount and persist across reboots
sudo mkdir -p /mnt/seaweed-data
sudo mount /dev/mmcblk0p1 /mnt/seaweed-data
echo '/dev/mmcblk0p1  /mnt/seaweed-data  ext4  defaults,noatime  0  2' | sudo tee -a /etc/fstab
```

Verify:

```bash
lsblk
df -h /mnt/seaweed-data
```

Expected result — a real, local ~28G filesystem, not an NFS mount:

```
NAME        MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS
mmcblk0     179:0    0 29.8G  0 disk
└─mmcblk0p1 179:1    0 29.8G  0 part /mnt/seaweed-data
Filesystem      Size  Used Avail Use% Mounted on
/dev/mmcblk0p1   30G  2.1M   28G   1% /mnt/seaweed-data
```

The Pi 5's own SSD needed no extra step here — it's already genuinely local to that node (it's the machine serving the NFS exports, not consuming them), so it acts as a third real disk in this scheme without any card or partitioning work.

### Step 2 — Point Kubernetes' local-path-provisioner at the real disks

The cluster's default `local-path` StorageClass (from `local-path-provisioner`, already installed via K3s) supports a per-node path map, so different nodes can resolve `local-path` PVCs to different physical directories:

```bash
kubectl edit cm local-path-config -n kube-system
```

```json
{
  "nodePathMap":[
  {
    "node":"DEFAULT_PATH_FOR_NON_LISTED_NODES",
    "paths":["/var/lib/rancher/k3s/storage"]
  },
  {
    "node":"rpi3-01",
    "paths":["/mnt/seaweed-data"]
  },
  {
    "node":"rpi3-02",
    "paths":["/mnt/seaweed-data"]
  }
  ]
}
```

Nodes not explicitly listed (the Pi 5 itself, and the remaining Pi 3s) fall through to the default path. On the Pi 5 that default path is genuinely local (its own root disk). On the remaining Pi 3s, that same default path is still inside their NFS-mounted root — so pods scheduled there transparently fall back to shared network storage, which is exactly the contrast we wanted for demonstration purposes.

Restart the provisioner to pick up the change:

```bash
kubectl rollout restart deployment -n kube-system local-path-provisioner
kubectl rollout status deployment -n kube-system local-path-provisioner
```

### Step 3 — Deploy a second, node-local SeaweedFS volume release

Rather than migrating the existing 320GB of live data in the original 8 volume PVCs, we deployed a **second Helm release containing only the volume component**, pointed at the same existing master so it joins the same cluster rather than creating an isolated one.

The chart derives the master address from the release name by default (`{{ .Release.Name }}-master`), which would break for a differently-named release. Inspecting `templates/shared/_helpers.tpl` showed an explicit override key intended for exactly this case:

```
{{- define "seaweedfs.masterServerArg" -}}
{{- if .Values.global.seaweedfs.masterServer -}}
{{- .Values.global.seaweedfs.masterServer -}}
{{- else -}}
{{- include "seaweedfs.masterServers" . -}}
{{- end -}}
{{- end -}}
```

Setting `global.seaweedfs.masterServer` explicitly bypasses the auto-derived name entirely.

**`values-local.yml`:**

```yaml
global:
  seaweedfs:
    masterServer: "seaweedfs-master.seaweedfs.svc.cluster.local:9333"

master:
  enabled: false
filer:
  enabled: false
s3:
  enabled: false

volume:
  enabled: true
  replicas: 8
  dataDirs:
  - name: data
    size: 25Gi
    storageClass: local-path
    maxVolumes: 50
    type: persistentVolumeClaim
  affinity: ""
```

Notes on the values above:
- `size: 25Gi` rather than 40Gi, since the physical SD cards are only 28G — a PVC request larger than the underlying disk would never bind.
- `affinity: ""` (no node restriction) — this lets replicas schedule anywhere across the cluster. Only pods landing on `rpi3-01`, `rpi3-02`, or the Pi 5 (`cloud`) get real local-disk backing per the `nodePathMap`; pods landing on the remaining Pi 3s fall back to shared NFS storage, same as the original deployment.
- `master`, `filer`, and `s3` are all disabled — this release only adds volume servers to the existing cluster.

**ServiceAccount collision:** the chart always creates a ServiceAccount named `seaweedfs` (fixed by `global.seaweedfs.serviceAccountName`, scoped per-namespace, not per-release):

```
templates/serviceaccount.yaml:
  name: {{ include "seaweedfs.serviceAccountName" . }}
```

Installing a second release into the *same* namespace as the first fails with an ownership conflict, since that object already belongs to the original release. The clean fix was installing into a **separate namespace**:

```bash
kubectl create namespace seaweedfs-local

helm install seaweedfs-local seaweedfs/seaweedfs \
  --namespace seaweedfs-local \
  --version 4.35.0 \
  -f values-local.yml
```

Since `masterServer` above already uses the fully-qualified cluster DNS name, cross-namespace communication with the master works without any further changes.

### Step 4 — Verify

```bash
kubectl get pods -n seaweedfs-local -o wide
```

Confirm the new release's volume servers registered with the same master as the original release:

```bash
curl -s http://192.168.50.1:9333/dir/status | python3 -m json.tool
```

To visibly prove the mixed physical backing (local SD card / local SSD / fallback NFS) in one screenshot-friendly table:

```bash
for pod in $(kubectl get pods -n seaweedfs-local -o jsonpath='{.items[*].metadata.name}'); do
  echo "=== $pod ==="
  kubectl exec -n seaweedfs-local $pod -- df -h /data 2>/dev/null | tail -1
done
```

Pods scheduled on `rpi3-01`/`rpi3-02` report `/dev/mmcblk0p1` as the filesystem source, the pod on the Pi 5 reports its own local SSD device, and pods scheduled on the remaining Pi 3s report `192.168.50.1:/srv/nfs/...` — a single command output demonstrating that the same SeaweedFS cluster is now backed by a genuine mix of physically distributed storage and network-shared fallback storage.

### Result

The cluster now runs two coexisting SeaweedFS volume deployments under one master:

| Deployment | Namespace | Volume count | Physical backing |
|---|---|---|---|
| `seaweedfs` (original) | `seaweedfs` | 8 | All on one SSD via NFS (per-node StorageClasses, same physical disk) |
| `seaweedfs-local` (new) | `seaweedfs-local` | 8 | Mixed — 2 real SD cards (rpi3-01, rpi3-02), 1 real local SSD (Pi 5), remaining fall back to NFS |

This demonstrates the practical difference between application-layer distribution (SeaweedFS treating separate PVCs as separate volume servers) and physical-layer distribution (data actually living on separate physical disks with independent failure domains), while joining both under a single unified master and topology view.

---

## Known Limitations

- **Single physical disk (original deployment)**: All NFS exports in the original `seaweedfs` release come from one SSD on the Pi 5. If the SSD fails, all storage in that release is lost. The `seaweedfs-local` release addresses this partially by adding independent physical disks on a subset of nodes.
- **NFS bottleneck**: All 8 Pi 3s share the Pi 5's USB bandwidth (~400MB/s) for anything still backed by NFS, including the fallback path used by non-mapped nodes in the local-path setup.
- **Only 2 Pi 3s currently have local disks**: extending true physical distribution to the remaining 6 Pi 3s requires adding SD cards to each and mapping them in `local-path-config`'s `nodePathMap`.
- **No auth on S3**: The current setup uses anonymous S3 access. For production, configure SeaweedFS IAM credentials.

---

## Useful Commands

```bash
# Check all SeaweedFS pods (original + local-path releases)
kubectl get pods -n seaweedfs -o wide
kubectl get pods -n seaweedfs-local -o wide

# Check PVC bindings
kubectl get pvc -n seaweedfs
kubectl get pvc -n seaweedfs-local

# Check NFS exports
sudo exportfs -v

# Check SSD / SD card usage
df -h /srv/nfs
df -h /mnt/seaweed-data
du -sh /srv/nfs/seaweedfs/*

# Check local-path-provisioner node mapping
kubectl get cm local-path-config -n kube-system -o yaml

# Restart SeaweedFS (original release)
helm upgrade seaweedfs seaweedfs/seaweedfs -n seaweedfs -f ~/seaweedfs/values-pi.yaml

# Update node-local release (e.g. after adding more SD cards)
helm upgrade seaweedfs-local seaweedfs/seaweedfs -n seaweedfs-local --version 4.35.0 -f values-local.yml

# View unified cluster topology across both releases
curl -s http://192.168.50.1:9333/dir/status | python3 -m json.tool

# Uninstall (PVCs are Retain — data is preserved)
helm uninstall seaweedfs -n seaweedfs
helm uninstall seaweedfs-local -n seaweedfs-local
```