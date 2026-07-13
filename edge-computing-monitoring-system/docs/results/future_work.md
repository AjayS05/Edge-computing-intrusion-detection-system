## Lessons we learned and what we would do differently the next time

### High Availability part
Have two control planes - we thought of doing it half way through the project but for that we'd have to change the boot startup of 2 of the 8 rp3 to SD rather than PXE because we plan to make them control plane of the k3s along with rp5. now, k3s HA uses embedded etcd, which is a quorum-based system. Quorum = majority of members.

| Control-plane nodes | Fault tolerance |
|---|---|
| 1 (current setup) | 0 |
| 2 | 0 (no improvement, and can make things worse) |
| 3 | 1 |

So going from 1 to 2 control planes doesn't actually give fault tolerance - etcd needs a majority to agree, and with only 2 members, losing either one (or having them disagree) stalls the whole cluster. To get real HA we would need **3 control-plane nodes** (RP5 + 2 RP3), not 2.

### Why we couldn't do this in the current project

- **PXE dependency**: RP5 currently acts as the DHCP/TFTP/NFS-root server for all 8 RP3s. Any RP3 promoted to control-plane would need to boot independently (its own SD card or USB SSD) instead of via PXE, since a control-plane node that can't reboot without RP5 being alive isn't actually adding fault tolerance - it just hides the single point of failure. Reworking the boot pipeline for 2-3 nodes without breaking PXE for the remaining workers would need careful testing.
- **Datastore migration**: our current RP5 control plane is running on SQLite, not embedded etcd. Adding more servers isn't just a join command - it requires migrating the existing cluster to an etcd-backed datastore first (`--cluster-init`), which meant planning around a full backup/restore of cluster state before attempting it.
- **Hardware constraints**: etcd is sensitive to disk fsync latency, and RP3s only have SD card storage by default. Running etcd reliably would likely require USB SSDs for at least 2 of the RP3s, which we didn't have provisioned for this project.
- **Time and risk**: with the project timeline already tight, converting the control-plane topology mid-project risked destabilizing a cluster that was otherwise working, with no easy rollback path once etcd migration started.

### Future work

- Migrate RP5's k3s datastore from SQLite to embedded etcd (`--cluster-init`).
- Attach USB SSDs to 2 of the RP3s and reflash them to boot locally (not via PXE) for control-plane use.
- Join those 2 RP3s as additional k3s servers, bringing the control plane to 3 total nodes (RP5 + 2 RP3), which is the minimum needed for actual etcd fault tolerance.
- Taint the RP3 control-plane nodes (`node-role.kubernetes.io/control-plane=true:NoSchedule`) so regular workloads don't compete with etcd for resources.
- Set up a load-balanced/VIP endpoint (e.g. `kube-vip`) for the API server, so external tools (kubectl, ingress, etc.) can fail over automatically instead of pointing at RP5's IP directly.
- Test failure scenarios explicitly (power off RP5, power off one RP3 control plane) to confirm the cluster actually survives before relying on this in production.