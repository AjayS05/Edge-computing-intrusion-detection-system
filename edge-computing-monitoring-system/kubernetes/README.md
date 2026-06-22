# K3s Cluster Deployment on Raspberry Pi with Ansible

Automated deployment of a k3s Kubernetes cluster using Ansible across Raspberry Pi devices booting via PXE/NFS. Based on the guide by Gerard Pontino:
https://medium.com/@gerard.pontino/automate-your-k3s-cluster-setup-on-raspberry-pi-with-ansible-8099ac4b9b4f

---

## Hardware Setup

| Role | Device | Count | OS |
|---|---|---|---|
| k3s Server (master) | Raspberry Pi 5 | 1 | Debian 13 (trixie) aarch64 |
| k3s Agents (workers) | Raspberry Pi 3 | 8 | Debian 13 (trixie) aarch64 |

All RPi3 worker nodes boot diskless via PXE/NFS. Each worker has its own NFS root at `/srv/nfs/rpi3-XX` on the RPi5.

---

## Prerequisites

- RPi5 is the PXE/NFS server and Ansible control node
- All RPi3s boot via PXE and are reachable over the network
- SSH passwordless access already configured from RPi5 to all workers
- Internet access available on the RPi5 (workers may have limited/no internet)

---

## Network Layout (example)

| Host | IP |
|---|---|
| RPi5 (master) | 192.168.50.1 |
| rpi3-01 | 192.168.50.101 |
| rpi3-02 | 192.168.50.102 |
| ... | ... |
| rpi3-08 | 192.168.50.108 |

---

## Step 1 — Install Ansible on the RPi5

```bash
sudo apt update
sudo apt install -y ansible
ansible --version
```

---

## Step 2 — Clone the Playbook

```bash
cd ~
git clone https://github.com/gerardpontino/Kubernetes-Cluster-Setup-Automation
cd Kubernetes-Cluster-Setup-Automation
```

---

## Step 3 — Create the Inventory File

Edit the `hosts` file inside the cloned repo:

```bash
nano ~/Kubernetes-Cluster-Setup-Automation/hosts
```

```ini
[masternode]
localhost ansible_connection=local

[workers]
rpi3-01 ansible_host=192.168.50.101
rpi3-02 ansible_host=192.168.50.102
rpi3-03 ansible_host=192.168.50.103
rpi3-04 ansible_host=192.168.50.104
rpi3-05 ansible_host=192.168.50.105
rpi3-06 ansible_host=192.168.50.106
rpi3-07 ansible_host=192.168.50.107
rpi3-08 ansible_host=192.168.50.108

[all:vars]
ansible_user=pi3
```

> Adjust IPs and `ansible_user` to match your setup.

---

## Step 4 — Enable Passwordless sudo on All Workers

Since workers boot via PXE and sudo requires a terminal, use SSH with `-t`:

```bash
for i in 01 02 03 04 05 06 07 08; do
  ssh -t pi3@192.168.50.1$i "echo 'pi3 ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/pi3"
done
```

Enable passwordless sudo on the RPi5 master itself:

```bash
echo 'pi5 ALL=(ALL) NOPASSWD:ALL' | sudo tee /etc/sudoers.d/pi5
```

Verify all nodes respond:

```bash
ansible all -i hosts -m shell -a "sudo whoami" --user pi3
# Expected: all nodes return "root"
```

---

## Step 5 — Fix overlayfs for PXE-Booted Workers

Workers booting over NFS do not support the default `overlayfs` snapshotter used by containerd/k3s. Install `fuse-overlayfs` as a replacement.

```bash
ansible workers -i hosts -m shell -a "apt-get install -y fuse-overlayfs" --user pi3 --become
```

Create the k3s config to use it:

```bash
ansible workers -i hosts -m shell \
  -a "mkdir -p /etc/rancher/k3s && echo 'snapshotter: fuse-overlayfs' > /etc/rancher/k3s/config.yaml" \
  --user pi3 --become
```

> Without this step, workers will repeatedly log:
> `"overlayfs" snapshotter cannot be enabled ... err: invalid argument`

---

## Step 6 — Airgap Install (Workers Have No Internet)

Because RPi3 workers cannot reach GitHub to download k3s, download everything on the RPi5 and push to workers.

**Download on RPi5:**

```bash
cd ~
curl -sfL https://get.k3s.io -o k3s-install.sh
curl -L https://github.com/k3s-io/k3s/releases/latest/download/k3s-arm64 -o k3s
curl -L https://github.com/k3s-io/k3s/releases/latest/download/k3s-airgap-images-arm64.tar.zst \
  -o k3s-airgap-images-arm64.tar.zst
chmod +x k3s k3s-install.sh
```

**Push files to all workers:**

```bash
ansible workers -i hosts -m shell \
  -a "mkdir -p /var/lib/rancher/k3s/agent/images/" \
  --user pi3 --become

ansible workers -i hosts -m copy \
  -a "src=/home/pi5/k3s dest=/usr/local/bin/k3s mode=0755" \
  --user pi3 --become

ansible workers -i hosts -m copy \
  -a "src=/home/pi5/k3s-install.sh dest=/home/pi3/k3s-install.sh mode=0755" \
  --user pi3 --become

ansible workers -i hosts -m copy \
  -a "src=/home/pi5/k3s-airgap-images-arm64.tar.zst dest=/var/lib/rancher/k3s/agent/images/k3s-airgap-images-arm64.tar.zst" \
  --user pi3 --become
```

---

## Step 7 — Run the Playbook (Install k3s Server on RPi5)

```bash
cd ~/Kubernetes-Cluster-Setup-Automation
ansible-playbook -i hosts install_k3s.yaml --user pi3 --become
```

This installs k3s server on the RPi5 master. Note: the worker install step will fail at this point if workers have no internet — that is expected. Continue to Step 8.

---

## Step 8 — Install k3s Agent on All Workers (Airgap)

Get the cluster token from the master:

```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

Run the airgap install on all workers (replace `YOUR_TOKEN` with the full token):

```bash
ansible workers -i hosts -m shell \
  -a "INSTALL_K3S_SKIP_DOWNLOAD=true K3S_URL=https://192.168.50.1:6443 K3S_TOKEN=YOUR_TOKEN /home/pi3/k3s-install.sh" \
  --user pi3 --become
```

---

## Step 9 — Restart k3s Agent (After overlayfs Fix)

If agents were installed before the fuse-overlayfs config was applied, restart them:

```bash
ansible workers -i hosts -m shell -a "systemctl restart k3s-agent" --user pi3 --become
```

---

## Step 10 — Verify the Cluster

```bash
sudo kubectl get nodes
```

Expected output:

```
NAME         STATUS   ROLES                  AGE   VERSION
cloud        Ready    control-plane,master   10m   v1.29.x+k3s1
rpi3-01      Ready    <none>                 5m    v1.29.x+k3s1
rpi3-02      Ready    <none>                 5m    v1.29.x+k3s1
rpi3-03      Ready    <none>                 5m    v1.29.x+k3s1
rpi3-04      Ready    <none>                 5m    v1.29.x+k3s1
rpi3-05      Ready    <none>                 5m    v1.29.x+k3s1
rpi3-06      Ready    <none>                 5m    v1.29.x+k3s1
rpi3-07      Ready    <none>                 5m    v1.29.x+k3s1
rpi3-08      Ready    <none>                 5m    v1.29.x+k3s1
```

---

## Shared Folder Setup (for distributed workloads)

A shared NFS folder is needed for distributed tasks (e.g. POV-Ray rendering). Create it on the RPi5:

```bash
sudo mkdir -p /srv/nfs/shared
sudo chmod 777 /srv/nfs/shared
echo '/srv/nfs/shared *(rw,sync,no_subtree_check,no_root_squash,insecure)' | sudo tee -a /etc/exports
sudo exportfs -ra
```

Mount on all workers:

```bash
ansible workers -i hosts -m shell \
  -a "mkdir -p /shared && mount 192.168.50.1:/srv/nfs/shared /shared" \
  --user pi3 --become
```

Make it persistent across reboots (writes to each worker's NFS root on the RPi5):

```bash
for i in 01 02 03 04 05 06 07 08; do
  echo '192.168.50.1:/srv/nfs/shared /shared nfs rw,hard,nolock 0 0' | sudo tee -a /srv/nfs/rpi3-$i/etc/fstab
done
```

| Path | Used by |
|---|---|
| `/srv/nfs/shared` | RPi5 master |
| `/shared` | All RPi3 workers |

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| `Missing sudo password` | sudo not passwordless | Run Step 4 |
| `Shared connection closed` | sudo needs a terminal over SSH | Use `ssh -t` as shown in Step 4 |
| `overlayfs invalid argument` | NFS root doesn't support overlayfs | Run Step 5 |
| `curl: Connection timed out` | Workers have no internet | Use airgap install in Step 6 |
| Nodes stuck in `NotReady` | k3s-agent not started or overlayfs issue | Run Step 9, check `journalctl -u k3s-agent` |
| `install_k3s.yaml could not be found` | Wrong working directory | `cd ~/Kubernetes-Cluster-Setup-Automation` first |

---

## References

- Playbook source: https://github.com/gerardpontino/Kubernetes-Cluster-Setup-Automation
- Original guide: https://medium.com/@gerard.pontino/automate-your-k3s-cluster-setup-on-raspberry-pi-with-ansible-8099ac4b9b4f
- k3s airgap install docs: https://docs.k3s.io/installation/airgap
- k3s releases: https://github.com/k3s-io/k3s/releases