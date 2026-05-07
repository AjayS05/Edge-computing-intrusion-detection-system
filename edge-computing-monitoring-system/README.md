
# Edge Computing Monitoring Solution

## Project Overview

The **Edge Computing Monitoring Solution** project builds an intelligent system that detects potential threats such as **intruders**, **fire**, and **smoke**, using **Raspberry Pi** nodes equipped with AI camera modules. The solution integrates high-performance computing (HPC) features via **Message Passing Interface (MPI)** and system monitoring capabilities using **Prometheus** and **Grafana**. The entire system is deployed on a **Kubernetes** cluster (with **k3s**) to ensure scalability, high availability, and real-time object detection.

## Features

- **Intruder Detection**: Real-time detection of intruders using object detection models (YOLO, TensorFlow).
- **Smoke and Fire Detection**: Detection of smoke and fire events through AI-powered cameras.
- **High-Performance Cluster**: Setup of a high-performance computing cluster using **MPI** for scalable computations.
- **Real-Time Monitoring**: Integration of **Prometheus** and **Grafana** for monitoring system health, network services, and resource utilization.
- **Telegram Notifications**: A Telegram bot to send alerts about detected events (e.g., intrusions, system health issues).
- **Dockerized Backend & Frontend**: Easy deployment of both frontend and backend using Docker containers.
- **Kubernetes Deployment**: Managed deployment on a Raspberry Pi Kubernetes cluster for high availability and scalability.

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Installation](#installation)
  - [Hardware Setup](#hardware-setup)
  - [Software Setup](#software-setup)
- [Usage](#usage)
  - [Frontend Usage](#frontend-usage)
  - [Backend Usage](#backend-usage)
  - [Object Detection](#object-detection)
  - [Telegram Notifications](#telegram-notifications)
- [Deployment](#deployment)
  - [Kubernetes Deployment](#kubernetes-deployment)
  - [Docker Deployment](#docker-deployment)
- [Monitoring](#monitoring)
- [Performance Benchmarking](#performance-benchmarking)
- [License](#license)

## Installation

Follow the steps below to set up the hardware and software for the **Edge Computing Monitoring Solution**.

### Hardware Setup

1. **Raspberry Pi Setup**:
   - Install **Raspberry Pi OS** (or **Ubuntu**) on your Raspberry Pi nodes using the provided script:
     - **`install_os.sh`**: Installs the OS on your Raspberry Pi nodes.
   - Set up **PXE boot** for Raspberry Pi 3 nodes to boot over the LAN.
     - **`pxeboot_setup.md`**: Guide for PXE boot configuration.
   - Connect and configure the **Raspberry Pi AI Camera Module** and **AI HAT**.
     - **`camera_setup.md`**: Guide for camera and AI HAT setup.

### Software Setup

1. **Clone the Repository**:

   ```bash
   git clone https://github.com/your-username/edge-computing-monitoring-solution.git
   cd edge-computing-monitoring-solution
   ```

2. **Install Backend Dependencies**:

   For Python, install the required libraries from `requirements.txt`:

   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Install Frontend Dependencies**:

   For React (or your frontend framework), install dependencies:

   ```bash
   cd frontend
   npm install
   ```

4. **Docker Setup** (Optional):
   - Build and run Docker containers for both frontend and backend.

   For **Backend**:

   ```bash
   cd backend/docker
   docker build -t backend .
   docker run -p 5000:5000 backend
   ```

   For **Frontend**:

   ```bash
   cd frontend/docker
   docker build -t frontend .
   docker run -p 3000:3000 frontend
   ```

## Usage

### Frontend Usage

1. After starting the frontend Docker container, open your browser and go to `http://localhost:3000`.
2. The frontend will display the **live detection feed**, **event logs**, and **alerts** (including **map views** and **timestamps**).

### Backend Usage

1. The backend manages the sensor nodes and stores collected data. It can be accessed via API endpoints:
   - **GET** `/api/alerts` - Fetch recent alerts.
   - **POST** `/api/events` - Manually trigger events or add new detection data.

2. **Telegram Notifications**: Alerts related to detected intrusions or system health will be sent via Telegram.

### Object Detection

1. **Training the Model**:
   - Use **`train_model.py`** to train the object detection model with your custom dataset:
   ```bash
   python object_detection/training/train_model.py
   ```

2. **Real-time Inference**:
   - Use **`detect_objects.py`** to perform real-time object detection using the trained model:
   ```bash
   python object_detection/inference/detect_objects.py
   ```

## Deployment

### Kubernetes Deployment

1. Deploy the **backend**, **frontend**, **Prometheus**, and **Grafana** using Kubernetes:

   ```bash
   kubectl apply -f kubernetes/backend-deployment.yaml
   kubectl apply -f kubernetes/frontend-deployment.yaml
   kubectl apply -f kubernetes/prometheus-deployment.yaml
   kubectl apply -f kubernetes/grafana-deployment.yaml
   kubectl apply -f kubernetes/service.yaml
   kubectl apply -f kubernetes/ingress.yaml
   ```

2. Check that all pods are running:
   ```bash
   kubectl get pods
   ```

### Docker Deployment

1. **Backend**:
   - Build and run the Docker container for the backend:
     ```bash
     docker build -t backend .
     docker run -p 5000:5000 backend
     ```

2. **Frontend**:
   - Build and run the Docker container for the frontend:
     ```bash
     docker build -t frontend .
     docker run -p 3000:3000 frontend
     ```

## Monitoring

Set up **Prometheus** and **Grafana** for monitoring system health and services.

1. **Prometheus**: Collects metrics from your system, including **CPU usage**, **memory usage**, **network traffic**, etc.
2. **Grafana**: Visualizes Prometheus metrics in a dashboard. The **grafana_dashboard.json** file provides a predefined dashboard configuration for monitoring.

## Performance Benchmarking

To evaluate the performance of your Raspberry Pi cluster, run **HPL (High-Performance LINPACK)** and other MPI benchmarks:

```bash
python mpi_cluster/hpl_benchmark.py
```

This will help analyze the performance of your system and detect any potential bottlenecks.

## License

This project is **academic-only** and is not available for commercial use. It is provided solely for educational purposes and research in the field of **edge computing**, **monitoring solutions**, and **intrusion detection systems**. Please use it in accordance with academic guidelines.

---

### Conclusion

This README provides a comprehensive guide for setting up, using, and deploying your **Edge Computing Monitoring Solution**. It covers hardware setup, software configuration, and system deployment, ensuring that anyone involved in the project can get started easily.
