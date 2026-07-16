# Project Overview

PiWatch is a distributed edge AI surveillance platform built on a Raspberry Pi cluster using Kubernetes (K3s). The system captures images at the edge using a Raspberry Pi AI Camera, performs real-time object detection with a YOLO-based backend, and stores detection data using SeaweedFS. PiWatch processes images locally and generates lightweight event data, annotated images, and alerts, reducing network bandwidth while enabling near real-time monitoring.

## Objectives
With this project, we aimed to do the following:

- Deeper our understanding of hardware infrastructure, networks, cluster engineering, performance evaluation, machine learning, and backend architecture.
- Build a robust infrastructure for distributed computing using resource-constrained edge devices.
- Implement real-time edge intelligence by deploying optimized YOLO object detection models directly at the data source to minimize latency.
- Optimize network and storage efficiency through localized data processing and distributed storage systems (SeaweedFS), minimizing external bandwidth consumption.
- Establish a highly available orchestration layer using K3s (lightweight Kubernetes) to manage fault tolerance, container scaling, and automated deployments across a bare-metal cluster.

## Implementation Intro
The platform consists of three main architectural layers:

- **Hardware Architecture** – Raspberry Pi devices, AI camera, storage, and networking hardware.
- **Network Architecture** – PXE boot infrastructure, local network configuration, and inter-device communication.
- **Software Architecture** – Kubernetes orchestration, frontend and backend services, distributed storage, monitoring, and alerting.

Together, these components provide a scalable, modular, and energy-efficient edge computing platform for intelligent surveillance and future distributed computing workloads.

## App URL

[PiWatch]([https://example.com](https://edge-computing-intrusion-detection.vercel.app/))
