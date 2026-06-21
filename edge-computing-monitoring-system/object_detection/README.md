# OBJECT DETECTION Module

## 1. Creating the Dataset

To make sure the AI model works reliably under different real-world conditions, a large custom dataset was put together:

- Dataset Size: Collected and organized a library of over 34,000 images covering multiple threat categories.

Image Tweaks (Augmentations): Modified the images on purpose to prepare the model for tough conditions:

- Low-Lighting: Dimmed the images to simulate dark rooms or nighttime security monitoring.

- Different Angles: Rotated and tilted images to make sure the model recognizes items even if the camera is mounted sideways or up high.

- Annotation Integrity: Standardized bounding boxes and multi-class tracking configurations mapped to the Roboflow dataset standard and referenced cleanly via data.yaml.

## 2. Training the Model on Kaggle

Because processing 34,000+ images requires massive computer power, the training was done in the cloud:

Ran the training code inside the cc_ai_model.ipynb notebook using free cloud computers on Kaggle.

Checked the accuracy graphs to make sure the model wasn't making too many mistakes, saving the progress charts straight to the results/ folder.

Saved the final, optimized file as best_k.pt built specifically to be small and fast enough to run smoothly on a Raspberry Pi.

## 3. Setting Up the Raspberry Pi 4

To move the project from the cloud onto the actual Raspberry Pi 4 hardware, a quick environment setup was completed:

- System Update: Updated the Pi’s internal operating system to the latest version.

- YOLO Installation: Installed the necessary software libraries required to read the model file on the Pi's processor.

- Speed Adjustments: Changed internal settings so the Pi can process images quickly without lagging or getting too hot.

## 4. Running the Live Security Feed

The actual live program lives inside inference/live_edge_threat2.py. This script turns on the camera, checks each frame using the trained best_k.pt file, and flags any threats instantly.
