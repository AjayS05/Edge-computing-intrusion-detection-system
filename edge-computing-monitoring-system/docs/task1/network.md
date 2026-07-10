# Raspberry Pi PXE / Network-Boot Setup

## Overview

This document describes the network-boot setup used for a Raspberry Pi cluster.

The Raspberry Pi 5 acts as the central server for eight Raspberry Pi 3 Model B+ nodes. The Raspberry Pi 3 nodes boot over Ethernet instead of relying on a full operating system stored locally on individual SD cards.

The setup uses:

* **DHCP** to assign fixed IP addresses to each Raspberry Pi 3 node
* **TFTP** to provide boot files
* **NFS** to provide a writable Linux root filesystem for each node
* **External SSD storage** connected to the Raspberry Pi 5 for storing the node operating-system folders

---

## Cluster Architecture

```text
                         Ethernet Switch
                               |
        -------------------------------------------------
        |       |       |       |       |       |       |
      RPi5   RPi3-01 RPi3-02 RPi3-03   ...   RPi3-07 RPi3-08
     Server
```

The Raspberry Pi 5 provides:

```text
DHCP server   → dnsmasq
TFTP server   → dnsmasq
NFS server    → nfs-kernel-server
NFS storage   → external SSD mounted at /srv/nfs
```

---

## IP Address Plan

| Device            |       IP Address | Purpose                   |
| ----------------- | ---------------: | ------------------------- |
| Raspberry Pi 5    |   `192.168.50.1` | DHCP, TFTP and NFS server |
| Raspberry Pi 3-01 | `192.168.50.101` | Network-boot client       |
| Raspberry Pi 3-02 | `192.168.50.102` | Network-boot client       |
| Raspberry Pi 3-03 | `192.168.50.103` | Network-boot client       |
| Raspberry Pi 3-04 | `192.168.50.104` | Network-boot client       |
| Raspberry Pi 3-05 | `192.168.50.105` | Network-boot client       |
| Raspberry Pi 3-06 | `192.168.50.106` | Network-boot client       |
| Raspberry Pi 3-07 | `192.168.50.107` | Network-boot client       |
| Raspberry Pi 3-08 | `192.168.50.108` | Network-boot client       |

Each Raspberry Pi 3 node receives its fixed IP address from the Raspberry Pi 5 based on its Ethernet MAC address.

---

## Boot Flow

```text
RPi3 powers on
   ↓
Requests an IP address using DHCP
   ↓
RPi5 assigns a fixed IP address using dnsmasq
   ↓
RPi3 downloads boot files from the RPi5 TFTP server
   ↓
RPi3 mounts its own writable Linux root filesystem from RPi5 over NFS
   ↓
RPi3 completes the operating-system boot process
```

---

# 1. Install Required Packages on Raspberry Pi 5

Run:

```bash
sudo apt update
sudo apt install dnsmasq nfs-kernel-server rsync tcpdump -y
```

The packages are used for:

| Package             | Purpose                                 |
| ------------------- | --------------------------------------- |
| `dnsmasq`           | DHCP and TFTP services                  |
| `nfs-kernel-server` | NFS root-filesystem sharing             |
| `rsync`             | Copying boot and operating-system files |
| `tcpdump`           | DHCP and network-boot troubleshooting   |

---

# 2. Configure the Raspberry Pi 5 Ethernet Address

The Raspberry Pi 5 Ethernet interface is configured with:

```text
192.168.50.1/24
```

The static address is assigned to `eth0`.

The address can be verified with:

```bash
ip addr show eth0
```

Expected output includes:

```text
inet 192.168.50.1/24
```

---

# 3. Collect Raspberry Pi 3 MAC Addresses

Each Raspberry Pi 3 was booted normally from an SD card first.

The Ethernet MAC address was collected using:

```bash
cat /sys/class/net/eth0/address
```

The model was checked using:

```bash
cat /proc/device-tree/model
```

The nodes used in this setup are Raspberry Pi 3 Model B+ boards.

A private record should be maintained separately:

| Node      | Ethernet MAC Address |         Fixed IP |
| --------- | -------------------- | ---------------: |
| `rpi3-01` | `<MAC_ADDRESS_PI1>`  | `192.168.50.101` |
| `rpi3-02` | `<MAC_ADDRESS_PI2>`  | `192.168.50.102` |
| `rpi3-03` | `<MAC_ADDRESS_PI3>`  | `192.168.50.103` |
| `rpi3-04` | `<MAC_ADDRESS_PI4>`  | `192.168.50.104` |
| `rpi3-05` | `<MAC_ADDRESS_PI5>`  | `192.168.50.105` |
| `rpi3-06` | `<MAC_ADDRESS_PI6>`  | `192.168.50.106` |
| `rpi3-07` | `<MAC_ADDRESS_PI7>`  | `192.168.50.107` |
| `rpi3-08` | `<MAC_ADDRESS_PI8>`  | `192.168.50.108` |

Do not publish real MAC addresses in a public repository unless required.

---

# 4. Configure dnsmasq for DHCP and TFTP

The configuration file is:

```text
/etc/dnsmasq.conf
```

The following configuration was added:

```ini
interface=eth0
bind-interfaces
dhcp-authoritative

# DHCP range
dhcp-range=192.168.50.101,192.168.50.150,255.255.255.0,24h

# Raspberry Pi 5 as gateway and DNS server
dhcp-option=3,192.168.50.1
dhcp-option=6,192.168.50.1
dhcp-option=66,192.168.50.1

# TFTP configuration
enable-tftp
tftp-root=/srv/tftp
dhcp-boot=bootcode.bin

# Debug logging
log-dhcp
log-queries

# Fixed DHCP assignments
dhcp-host=<MAC_ADDRESS_PI1>,192.168.50.101,rpi3-01
dhcp-host=<MAC_ADDRESS_PI2>,192.168.50.102,rpi3-02
dhcp-host=<MAC_ADDRESS_PI3>,192.168.50.103,rpi3-03
dhcp-host=<MAC_ADDRESS_PI4>,192.168.50.104,rpi3-04
dhcp-host=<MAC_ADDRESS_PI5>,192.168.50.105,rpi3-05
dhcp-host=<MAC_ADDRESS_PI6>,192.168.50.106,rpi3-06
dhcp-host=<MAC_ADDRESS_PI7>,192.168.50.107,rpi3-07
dhcp-host=<MAC_ADDRESS_PI8>,192.168.50.108,rpi3-08
```

Restart and verify dnsmasq:

```bash
sudo systemctl restart dnsmasq
sudo systemctl status dnsmasq
```

DHCP activity can be monitored using:

```bash
sudo journalctl -u dnsmasq -f
```

The DHCP lease file can be checked using:

```bash
cat /var/lib/misc/dnsmasq.leases
```

Expected fixed assignments:

```text
rpi3-01 → 192.168.50.101
rpi3-02 → 192.168.50.102
rpi3-03 → 192.168.50.103
rpi3-04 → 192.168.50.104
rpi3-05 → 192.168.50.105
rpi3-06 → 192.168.50.106
rpi3-07 → 192.168.50.107
rpi3-08 → 192.168.50.108
```

---

# 5. Create TFTP and NFS Directories

Create a boot folder and root-filesystem folder for each node:

```bash
sudo mkdir -p /srv/tftp
sudo mkdir -p /srv/nfs

for i in 01 02 03 04 05 06 07 08; do
  sudo mkdir -p /srv/tftp/rpi3-$i
  sudo mkdir -p /srv/nfs/rpi3-$i
done
```

Folder structure:

```text
/srv/tftp/
├── rpi3-01
├── rpi3-02
├── ...
└── rpi3-08

/srv/nfs/
├── rpi3-01
├── rpi3-02
├── ...
└── rpi3-08
```

Each node uses a separate writable NFS root filesystem. This avoids conflicts involving hostnames, SSH keys, package-manager locks, logs and service state.

---

# 6. Prepare the Base Raspberry Pi OS Files

A Raspberry Pi OS SD card was inserted into the Raspberry Pi 5 using a USB card reader.

The partitions were identified using:

```bash
lsblk -f
```

Example:

```text
sda
├─sda1  vfat  bootfs
└─sda2  ext4  rootfs
```

Mount the root filesystem:

```bash
sudo mkdir -p /mnt/rpi3-root
sudo mount /dev/sda2 /mnt/rpi3-root
```

Copy boot files:

```bash
sudo rsync -a /media/pi5/bootfs/ /srv/tftp/rpi3-01/
```

Copy the root filesystem:

```bash
sudo rsync -aAXv /mnt/rpi3-root/ /srv/nfs/rpi3-01/
```

Verify files:

```bash
ls /srv/tftp/rpi3-01
ls /srv/nfs/rpi3-01
```

The TFTP folder should include files such as:

```text
bootcode.bin
cmdline.txt
config.txt
start.elf
fixup.dat
kernel8.img
bcm2710-rpi-3-b-plus.dtb
overlays/
```

The NFS root should include directories such as:

```text
bin
boot
dev
etc
home
lib
proc
root
run
sbin
sys
tmp
usr
var
```

---

# 7. Move NFS Storage to an External SSD

A dedicated external SSD was connected to the Raspberry Pi 5 because storing eight writable operating-system copies on the Pi 5 SD card required too much space.

The SSD was identified as:

```text
/dev/sdb
```

A GPT partition and an `ext4` filesystem were created:

```bash
sudo fdisk /dev/sdb
```

Inside `fdisk`:

```text
g
n
1
Enter
Enter
w
```

Format the partition:

```bash
sudo mkfs.ext4 -L rpi-nfs-storage /dev/sdb1
```

Mount temporarily:

```bash
sudo mkdir -p /mnt/external-nfs
sudo mount /dev/sdb1 /mnt/external-nfs
```

Copy existing NFS content:

```bash
sudo rsync -aAXv /srv/nfs/ /mnt/external-nfs/
```

Replace `/srv/nfs` with the external SSD mount:

```bash
sudo mv /srv/nfs /srv/nfs-old
sudo mkdir -p /srv/nfs
sudo umount /mnt/external-nfs
sudo mount /dev/sdb1 /srv/nfs
```

Verify:

```bash
df -h /srv/nfs
ls /srv/nfs
```

Expected result:

```text
/dev/sdb1 ... /srv/nfs
```

The SSD UUID was retrieved using:

```bash
sudo blkid /dev/sdb1
```

The following line was added to `/etc/fstab`:

```text
UUID=<UUID_OF_EXTERNAL_SSD> /srv/nfs ext4 defaults,noatime 0 2
```

Reload and test:

```bash
sudo systemctl daemon-reload
sudo umount /srv/nfs
sudo mount -a
df -h /srv/nfs
```

After confirming the SSD mount, the old SD-card copy was removed:

```bash
sudo rm -rf /srv/nfs-old
```

---

# 8. Duplicate the Root Filesystem for Remaining Nodes

Copy the base root filesystem to the remaining nodes:

```bash
for i in 02 03 04 05 06 07 08; do
  sudo rsync -aAXv --delete /srv/nfs/rpi3-01/ /srv/nfs/rpi3-$i/
done
```

Copy TFTP boot files:

```bash
for i in 02 03 04 05 06 07 08; do
  sudo rsync -a /srv/tftp/rpi3-01/ /srv/tftp/rpi3-$i/
done
```

Check NFS folder sizes:

```bash
sudo du -sh /srv/nfs/rpi3-*
```

All folders should have approximately the same size.

---

# 9. Configure NFS Exports

The NFS exports file is:

```text
/etc/exports
```

For testing, the full cluster subnet may be allowed:

```text
/srv/nfs/rpi3-01 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-02 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-03 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-04 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-05 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-06 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-07 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-08 192.168.50.0/24(rw,sync,no_subtree_check,no_root_squash)
```

Reload exports:

```bash
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
sudo exportfs -v
showmount -e localhost
```

For a stricter final configuration, each NFS folder can be restricted to its assigned node IP:

```text
/srv/nfs/rpi3-01 192.168.50.101(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/rpi3-02 192.168.50.102(rw,sync,no_subtree_check,no_root_squash)
...
```

---

# 10. Configure NFS Root Boot Commands

Each Raspberry Pi 3 boot folder requires its own `cmdline.txt`.

Run:

```bash
for i in 01 02 03 04 05 06 07 08; do
  echo "console=serial0,115200 console=tty1 root=/dev/nfs nfsroot=192.168.50.1:/srv/nfs/rpi3-$i,vers=3 rw ip=dhcp rootwait" | sudo tee /srv/tftp/rpi3-$i/cmdline.txt
done
```

Example for `rpi3-02`:

```text
console=serial0,115200 console=tty1 root=/dev/nfs nfsroot=192.168.50.1:/srv/nfs/rpi3-02,vers=3 rw ip=dhcp rootwait
```

`cmdline.txt` must remain a single line.

---

# 11. Set Unique Hostnames

Each node requires a unique hostname.

Run:

```bash
for i in 01 02 03 04 05 06 07 08; do
  echo "rpi3-$i" | sudo tee /srv/nfs/rpi3-$i/etc/hostname
  sudo sed -i "s/^127.0.1.1.*/127.0.1.1 rpi3-$i/" /srv/nfs/rpi3-$i/etc/hosts
done
```

Expected hostnames:

```text
rpi3-01
rpi3-02
rpi3-03
rpi3-04
rpi3-05
rpi3-06
rpi3-07
rpi3-08
```

---

# 12. Test DHCP and Network Boot

Monitor dnsmasq logs:

```bash
sudo journalctl -u dnsmasq -f
```

Power on one Raspberry Pi 3B+ at a time without a full OS SD card.

Expected DHCP activity:

```text
DHCPDISCOVER
DHCPOFFER
DHCPREQUEST
DHCPACK
```

Check leases:

```bash
cat /var/lib/misc/dnsmasq.leases
```

Test connectivity:

```bash
ping 192.168.50.101
ping 192.168.50.102
```

Test SSH:

```bash
ssh <USERNAME>@192.168.50.101
```

---

# 13. Troubleshooting

## DHCP Offer Appears but No DHCP Acknowledgement

Verify:

```bash
sudo journalctl -u dnsmasq -f
```

Check that `dnsmasq.conf` contains:

```ini
dhcp-authoritative
dhcp-option=66,192.168.50.1
dhcp-boot=bootcode.bin
```

---

## NFS Mount Returns Permission Denied

Check actual DHCP leases:

```bash
cat /var/lib/misc/dnsmasq.leases
```

Check exports:

```bash
sudo exportfs -v
```

Reload exports:

```bash
sudo exportfs -ra
sudo systemctl restart nfs-kernel-server
```

For diagnosis, temporarily allow the whole subnet:

```text
192.168.50.0/24
```

---

## NFS Server Fails to Restart

Check:

```bash
sudo systemctl status nfs-kernel-server
sudo journalctl -xeu nfs-server.service
```

Verify external SSD mount:

```bash
df -h /srv/nfs
```

Expected:

```text
/dev/sdb1 ... /srv/nfs
```

---

## No Space Left on Device

Check:

```bash
df -h /
df -h /srv/nfs
```

The NFS root folders should be stored on the external SSD mounted at:

```text
/srv/nfs
```

---

## Verify TFTP Boot Files

```bash
ls /srv/tftp/rpi3-01
```

Expected files include:

```text
bootcode.bin
cmdline.txt
config.txt
start.elf
fixup.dat
kernel8.img
overlays/
```

---

# Current Status

Completed:

* Raspberry Pi 5 static Ethernet address configured as `192.168.50.1`
* `dnsmasq` configured for DHCP and TFTP
* Fixed IP addresses assigned to all eight Raspberry Pi 3 nodes
* Raspberry Pi OS boot and root files copied
* External SSD mounted at `/srv/nfs`
* Separate writable NFS root folders created for all eight Raspberry Pi 3 nodes
* Initial network-boot test completed successfully for `rpi3-01`

Remaining validation:

* Confirm NFS service restart after final export changes
* Confirm TFTP folder selection for each Raspberry Pi 3 node
* Validate network boot for `rpi3-02` to `rpi3-08`
* Restrict NFS exports from full subnet access to node-specific IP addresses after testing

---

## Notes

Raspberry Pi 3 Model B+ boards support Ethernet network boot without requiring a custom BIOS-style boot-order configuration.

Each node uses a separate writable NFS root filesystem to avoid conflicts involving:

* Hostnames
* SSH host keys
* Linux logs
* Package-manager locks
* Service state
* Runtime files
