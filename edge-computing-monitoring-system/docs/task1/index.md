# Project Overview

PiWatch is a distributed edge AI surveillance platform built on a Raspberry Pi cluster using Kubernetes (K3s). The system captures images at the edge using a Raspberry Pi AI Camera, performs real-time object detection with a YOLO-based backend, and stores detection data using SeaweedFS. Rather than continuously streaming video, PiWatch processes images locally and generates lightweight event data, annotated images, and alerts, reducing network bandwidth while enabling near real-time monitoring.

The platform consists of three main architectural layers:

- **Hardware Architecture** – Raspberry Pi devices, AI camera, storage, and networking hardware.
- **Network Architecture** – PXE boot infrastructure, local network configuration, and inter-device communication.
- **Software Architecture** – Kubernetes orchestration, frontend and backend services, distributed storage, monitoring, and alerting.

Together, these components provide a scalable, modular, and energy-efficient edge computing platform for intelligent surveillance and future distributed computing workloads.