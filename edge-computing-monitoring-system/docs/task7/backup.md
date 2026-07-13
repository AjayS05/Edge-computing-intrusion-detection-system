# k3s Cluster Backup & Restore Documentation

## Overview

This document describes the backup strategy for the k3s cluster running on:

| Role | Hardware | Hostname/IP |
|---|---|---|
| Server (control-plane) | Raspberry Pi 5 | `<rpi5-ip>` |
| Agent nodes (x8) | Raspberry Pi 3 | `<rpi3-ip-1..8>` |
| Backup storage | USB drive mounted on Raspberry Pi 4 | `<rpi4-ip>`, mount `/mnt/usb-backup` |

The cluster uses **SQLite** as its datastore (single-server k3s, no HA/etcd), so all cluster
state lives on the RPi5 server node. Agent nodes hold no cluster state of their own — they
only need the server back online with the same token to rejoin.

---

## What Gets Backed Up

| Path | Contents | Included? |
|---|---|---|
| `/var/lib/rancher/k3s/server/db` | SQLite datastore — all cluster objects, state | Yes |
| `/var/lib/rancher/k3s/server/tls` | Cluster certificates | Yes |
| `/var/lib/rancher/k3s/server/cred` | Node/join credentials | Yes |
| `/var/lib/rancher/k3s/server/manifests` | Auto-deploy manifests | Yes |
| `/var/lib/rancher/k3s/server/logs` | Server logs | No (excluded, not needed for restore) |
| `/etc/rancher/k3s/k3s.yaml` | kubeconfig | Yes |
| `/var/lib/rancher/k3s/storage` | local-path-provisioner PV data | Yes (optional, separate archive) |

Backups are **not** taken of the 8 agent nodes individually — they are stateless from
k3s's perspective and simply rejoin the server after it's restored.

---

## Backup Process

### Script

Backups are performed by [`backup-k3s.sh`](./backup-k3s.sh), run **on the RPi5 server node**.

The script:

1. Stops the `k3s` service to guarantee a consistent SQLite snapshot (agents keep running
   existing pods during this brief window; they just can't reschedule until the server returns).
2. Archives cluster state into `k3s-backup-<timestamp>.tar.gz`.
3. Optionally archives PV data into `k3s-pvdata-<timestamp>.tar.gz`.
4. Restarts `k3s`.
5. Generates SHA-256 checksums for both archives.
6. Locks down file permissions (`chmod 600`) since the archive contains cluster secrets.
7. Deletes backups and logs older than the configured retention window (default 14 days).
8. Logs every step with timestamps to `/home/pi/k3s-backups/logs/`.

### Manual run

```bash
sudo /home/pi/backup-k3s.sh
```

### Scheduled run (cron)

On the RPi5:

```bash
sudo crontab -e
```

```cron
0 2 * * * /home/pi/backup-k3s.sh
```

Runs nightly at 2:00 AM.

### Output locations (on RPi5)

```
/home/pi/k3s-backups/
├── k3s-backup-<date>.tar.gz
├── k3s-backup-<date>.tar.gz.sha256
├── k3s-pvdata-<date>.tar.gz
├── k3s-pvdata-<date>.tar.gz.sha256
└── logs/
    └── backup-<date>.log
```

---

## Transferring Backups to USB (on RPi4)

The RPi4 owns the USB drive, so it **pulls** backups from the RPi5 via `rsync` over SSH.

### One-time setup

1. Mount the USB drive on the RPi4:
   ```bash
   lsblk                              # identify device, e.g. /dev/sda1
   sudo mkdir -p /mnt/usb-backup
   sudo mount /dev/sda1 /mnt/usb-backup
   ```
2. Set up passwordless SSH from RPi4 → RPi5:
   ```bash
   ssh-keygen -t ed25519              # on RPi4, if no key exists
   ssh-copy-id pi@<rpi5-ip>
   ```

### Manual pull

```bash
rsync -avz --progress pi@<rpi5-ip>:/home/pi/k3s-backups/ /mnt/usb-backup/
```

### Verify integrity after transfer

```bash
cd /mnt/usb-backup
sha256sum -c k3s-backup-*.sha256
sha256sum -c k3s-pvdata-*.sha256
```

### Scheduled pull (cron, on RPi4)

```bash
crontab -e
```

```cron
15 2 * * * rsync -az pi@<rpi5-ip>:/home/pi/k3s-backups/ /mnt/usb-backup/ && \
  find /mnt/usb-backup -name 'k3s-backup-*' -mtime +14 -delete && \
  find /mnt/usb-backup -name 'k3s-pvdata-*' -mtime +14 -delete
```

Runs 15 minutes after the RPi5 backup job to ensure the archive exists before pulling.

---

## Restore Procedure

Use this if the RPi5 server node fails or its SD card/SSD is corrupted.

### 1. Prepare a fresh server node

Flash a fresh OS image, set the same hostname/IP as the original RPi5 (recommended), and
install k3s **without starting it automatically**, or install and immediately stop it:

```bash
curl -sfL https://get.k3s.io | sh -
sudo systemctl stop k3s
```

### 2. Retrieve the latest backup from USB

From the RPi4 (or copy the USB drive to the new server node directly):

```bash
scp /mnt/usb-backup/k3s-backup-<latest-date>.tar.gz pi@<new-rpi5-ip>:/home/pi/
```

### 3. Verify checksum before restoring

```bash
sha256sum -c k3s-backup-<latest-date>.tar.gz.sha256
```

Do not proceed if this fails — retrieve a different/older backup instead.

### 4. Restore the archive

```bash
sudo tar -xzf k3s-backup-<latest-date>.tar.gz -C /
```

This restores `/var/lib/rancher/k3s/server` and `/etc/rancher/k3s` to their backed-up state.

### 5. Restore PV data (if applicable)

```bash
sudo tar -xzf k3s-pvdata-<latest-date>.tar.gz -C /
```

### 6. Start k3s

```bash
sudo systemctl start k3s
sudo systemctl status k3s
kubectl get nodes
```

### 7. Confirm agents rejoin

The 8 RPi3 agent nodes should reconnect automatically once the server is reachable at the
same IP/hostname with the restored token. Check:

```bash
kubectl get nodes -o wide
kubectl get pods -A
```

If an agent doesn't rejoin, verify its `/etc/rancher/k3s/agent/` config still points at the
correct server URL and token, or re-run the agent join command:

```bash
curl -sfL https://get.k3s.io | K3S_URL=https://<rpi5-ip>:6443 K3S_TOKEN=<token> sh -
```

---

## Security Notes

- Backup archives contain **cluster certificates and node credentials**. Treat them as secrets.
- Files are created with `chmod 600` by the backup script — do not loosen this.
- Consider encrypting the USB drive itself (LUKS) since it holds multiple historical backups.
- Consider encrypting archives in transit/at rest with GPG if the USB drive could be removed
  from the premises:
  ```bash
  gpg -c k3s-backup-<date>.tar.gz
  ```
- Do not leave old backup copies in `/home/pi` on the RPi5 after they've been pulled to USB.

---

## Retention Policy

| Location | Retention |
|---|---|
| RPi5 (`/home/pi/k3s-backups/`) | 14 days (auto-cleaned by script) |
| RPi4 USB (`/mnt/usb-backup/`) | 14 days (auto-cleaned by cron) |

Adjust `RETENTION_DAYS` in `backup-k3s.sh` and the `find -mtime` values in the RPi4 cron job
together if you want a longer/shorter history.

---

## Quick Reference

| Task | Command | Where |
|---|---|---|
| Run backup manually | `sudo ./backup-k3s.sh` | RPi5 |
| Pull backup to USB | `rsync -avz pi@<rpi5-ip>:/home/pi/k3s-backups/ /mnt/usb-backup/` | RPi4 |
| Verify checksum | `sha256sum -c k3s-backup-*.sha256` | RPi4 |
| Check k3s status | `sudo systemctl status k3s` | RPi5 |
| Check cluster nodes | `kubectl get nodes` | RPi5 |
| View backup logs | `cat /home/pi/k3s-backups/logs/backup-<date>.log` | RPi5 |

---

## Future Considerations

- **Velero**: Could be added later for granular, namespace/label-level restore of workloads,
  at the cost of running an S3-compatible backend (e.g. MinIO) and Restic/Kopia for PV backups.
  Not required for a single-server SQLite cluster of this size, but worth revisiting if the
  number of stateful applications grows.
- **Off-site copy**: Currently backups only live on RPi5 and the RPi4 USB drive, both on the
  same LAN/premises. Consider periodically copying the USB backups off-site (cloud storage,
  another physical location) for full disaster recovery coverage.