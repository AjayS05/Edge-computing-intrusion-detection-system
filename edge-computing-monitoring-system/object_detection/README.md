# OBJECT DETECTION MODULE

## 1. Creating the Dataset

To make sure the AI model works reliably under different real-world conditions, a large custom dataset was put together:

- Dataset Size: Collected and organized a library of over 34,000 images covering multiple threat categories.

Image Tweaks (Augmentations): Modified the images on purpose to prepare the model for tough conditions:

- Low-Lighting: Dimmed the images to simulate dark rooms or nighttime security monitoring.

- Different Angles: Rotated and tilted images to make sure the model recognizes items even if the camera is mounted sideways or up high.

- Annotation Integrity: Standardized bounding boxes and multi-class tracking configurations mapped to the Roboflow dataset standard and referenced cleanly via data.yaml.

### Model Classes
The model is trained to detect and flag specific objects across these distinct classes:
- **Person:** Detects unauthorized individuals entering monitored zones.
- **Weapon:** Identifies visible security threats like firearms.
- **Fire:** Detects early signs of flames or fire hazards.
- **Container:** Identifies cups, bottles, or mugs to spot potential liquid spillages.

## 2. Training the Model on Kaggle

Because processing 34,000+ images requires massive computer power, the training runs were completed across different environments to get the best performance:

- Ran the training code inside the cc_ai_model.ipynb notebook using local setups as well as free cloud computers on Kaggle.
- Checked the accuracy graphs to make sure the model wasn't making too many mistakes, saving the progress charts straight to the runs/ folder.
- Saved the final, most optimized file as **best_final.pt**, built specifically to be small and fast enough to run smoothly on a Raspberry Pi.

### Hardware Training Performance Metrics
Here is how the training performed across the environments we tested:

| Where It Was Trained | Number of Epochs | Total Training Time | Resulting Model File |
| :--- | :--- | :--- | :--- |
| **Kaggle Cloud** | 100 Epochs | ~10.0 Hours | **`best_final.pt` (Final Deploy)** |

### Model Accuracy Metrics
Here is how accurately the final model detected items on our test data:

| Class Name | Precision (How clean detections are) | Recall (How many threats it catches) | mAP50 (General Accuracy) | mAP50-95 (Strict Accuracy) |
| :--- | :--- | :--- | :--- | :--- |
| **Container** | 95.2% | 95.5% | 97.7% | 86.3% |
| **Fire** | 82.2% | 72.3% | 79.6% | 46.4% |
| **Person** | 84.4% | 77.3% | 86.5% | 58.1% |
| **Weapon** | 95.4% | 94.7% | 96.4% | 71.6% |
| **Overall (All Combined)** | **89.3%** | **85.0%** | **90.0%** | **65.6%** |

## 3. Setting Up the Raspberry Pi 4

To move the project from the cloud onto the actual Raspberry Pi 4 hardware, a quick environment setup was completed:

- System Update: Updated the Pi’s internal operating system to the latest version.

- YOLO Installation: Installed the necessary software libraries required to read the model file on the Pi's processor.

- Speed Adjustments: Changed internal settings so the Pi can process images quickly without lagging or getting too hot.

## 4. Running the Live Security Feed

The actual live program lives inside inference/live_edge_threat2.py. This script turns on the camera, checks each frame using the trained best_k.pt file, and flags any threats instantly.
