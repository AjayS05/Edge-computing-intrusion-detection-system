# Model Evaluation and Edge Deployment

This document breaks down the performance statistics of our trained model and details the step-by-step setup for running live, real-time security checking on the target hardware.

## 1. Quantitative Performance Metrics

The model was evaluated using a rigorous validation set containing **2,379 images** and **4,732 real object instances**. Below are the exact performance statistics achieved by the final weights file (**`best_final.pt`**):

| Class Name | Precision | Recall | mAP50 | mAP50-95 |
| :--- | :---: | :---: | :---: | :---: |
| **Container** | 95.2% | 95.5% | 97.7% | 86.3% |
| **Fire** | 82.2% | 72.3% | 79.6% | 46.4% |
| **Person** | 84.4% | 77.3% | 86.5% | 58.1% |
| **Weapon** | 95.4% | 94.7% | 96.4% | 71.6% |
| **Overall (All Combined)** | **89.3%** | **85.0%** | **90.0%** | **65.6%** |

### Performance Analysis
- **High-Certainty Indicators:** Both **Weapon** and **Container** classes perform exceptionally well, matching or beating 95% in both Precision and Recall. This makes them highly dependable for low-latency triggers.
- **Complex Target Handling:** The **Fire** class has lower overall scores (79.6% mAP50). This behavior is normal because flames do not have fixed shapes or rigid edges, making them harder for computer vision networks to pinpoint perfectly compared to solid objects.
- **Precision (No False Alarms):** Out of all the times the model *claimed* to find a threat, this is how often it was actually right. High precision means fewer annoying false alerts.
- **Recall (No Missed Threats):** Out of all the *real* threats that actually appeared in front of the camera, this is how many the model managed to catch. High recall means the model doesn't miss anything.
- **mAP50 (Standard Accuracy):** The general accuracy score of the model. It measures performance when a detected box overlaps at least 50% with the real object.
- **mAP50-95 (Strict Accuracy):** A much tougher accuracy test. It scores how perfectly the model's bounding boxes match the exact edges of the objects across multiple strict layout levels (from 50% up to 95% perfect overlap).

## 2. Raspberry Pi 4 Environment Setup

To transition the project from cloud training onto our physical edge device (`pi4@rp4`), a dedicated runtime environment was configured to keep packages isolated and organized:

- **Workspace Optimization:** All files are contained within the user's home directory under `/home/pi4/`. 
- **Dependency Isolation:** Built a dedicated Python virtual environment named **`yolo_env`**. This ensures our object detection libraries remain separate from system-wide files.
- **Core Library Installation:** Loaded the necessary vision tools and engine libraries required to process input frames directly through the Pi's processor.
- **Thermal & Resource Tuning:** Modified system settings to ensure the Pi handles steady image processing loops smoothly without overheating or lagging.

## 3. Production Runtime Configuration

The production streaming software is housed completely within the **`edge-camera-sender-runtime/`** deployment package.

```text
/home/pi4/
 ├── best_final.pt                 <-- Final Flashed Model Weights
 ├── live_edge_threat2.py         <-- Core Multi-Class Inference Script
 └── edge-camera-sender-runtime/  <-- Live System Streaming Package
