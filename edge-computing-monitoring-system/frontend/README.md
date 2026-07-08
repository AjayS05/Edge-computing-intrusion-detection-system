# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
=======
# Raspberry Pi Cluster Monitoring with Prometheus and Grafana

## Overview

This monitoring setup collects system health metrics from the Raspberry Pi cluster using Prometheus Node Exporter, Prometheus, and Grafana.

Prometheus and Grafana run on the Raspberry Pi 5 master node. Prometheus Node Exporter is installed on the Raspberry Pi 3 worker nodes using Ansible. Each node exposes metrics on port 9100, Prometheus scrapes those metrics, and Grafana visualizes them through a dashboard.

## Architecture

RP3 Worker Nodes → Node Exporter :9100  
RP5 Master → Prometheus :9090  
RP5 Master → Grafana :3000  

## Components

- Prometheus Node Exporter: collects CPU, memory, disk, network, and uptime metrics
- Prometheus: scrapes and stores metrics
- Grafana: visualizes metrics in dashboards
- Ansible: automates Node Exporter installation on all RP3 nodes

## Access URLs

Prometheus:

http://<RP5-IP>:9090

Grafana:

http://<RP5-IP>:3000

Prometheus targets:

http://<RP5-IP>:9090/classic/targets

## Current Status

- Prometheus installed on RP5
- Grafana installed on RP5
- Node Exporter deployed to RP3 nodes using Ansible
- Grafana dashboard connected to Prometheus
- Live metrics visible for CPU, memory, disk, network, and uptime

## Verification

Check Node Exporter on a node:

```bash
curl http://192.168.50.101:9100/metrics

