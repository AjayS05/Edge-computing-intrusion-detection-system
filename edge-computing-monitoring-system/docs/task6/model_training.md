# Model Training and Pipeline Configuration

This document covers the complete process of preparing the custom dataset, choosing the image adjustments, and running the training cycles in the cloud to build our object detection model.

## 1. Dataset Architecture & Specifications

To ensure the security model is completely reliable when running live on the edge, we put together a large-scale, target-specific custom dataset. 

- **Dataset Footprint:** Organized a high-density archive containing over **37,000+ total images** covering our core security classes.
- **Dataset Distribution Split:** The full dataset is strictly partitioned to maintain independent evaluation boundaries:
  - **Training Set:** 70% (Used to build model paths)
  - **Validation Set:** 15% (Used to check accuracy during runs)
  - **Test Set:** 15% (Used for the final model statistics)
- **Labels & Schema:** All image annotations, label coordinates, and folder splits are standardized to the Roboflow dataset format and linked via the central `data.yaml` configuration file.

## 2. Preprocessing & Environmental Augmentation Strategy

### Preprocessing Configurations
Before passing data to the model, two mandatory image filters were configured globally to standardize the camera frames:
- **Auto-Orient:** Applied across all samples to strip camera orientation metadata, making sure images stay right-side up.
- **Resize Adjustment:** Applied a uniform **Stretch to 640x640 pixels** to match our target neural network input dimension perfectly.

### Augmentation Settings
We deliberately generated multiple modified versions of our training images using software transformations. This prepares the AI model to handle tough, unpredictable real-world environments without making mistakes:

- **Outputs per Training Example:** Generated **3 augmented variations** for every 1 original training image to aggressively expand our training patterns.
- **Horizontal Flip:** Flipped images horizontally to ensure the model detects threats moving from both left-to-right and right-to-left directions.
- **Exposure Adjustments:** Shifted image brightness randomly **between -15% and +15%**. This simulates low-lighting levels, dark rooms, shadow blocks, or daytime outdoor sun glare, ensuring high sensitivity in poor visibility.
- **Multi-Angle Variations:** Rotated and tilted angles to train the model to recognize targets even if the security camera is mounted sideways, skewed, or high up on ceilings.

## 3. Training Execution & Cloud Workflow

To train the model efficiently, the training pipeline was offloaded to cloud hardware acceleration:

- **Notebook Instance:** Executed cleanly inside the cloud notebook named **`Cloud Model Final`** on the Kaggle infrastructure.
- **Hardware Acceleration Engine:** Scaled execution loops using parallelized data streams across **2 x NVIDIA Tesla T4 GPUs** (dual graphics card acceleration setup).
- **Execution Lifecycle:** The training pipeline completed a deep training run over **10 continuous processing hours**.
- **Convergence Checks:** During the training runs, accuracy and loss graphs were reviewed to ensure the model was actively learning without over-fitting. All training progress charts and weights were output straight into the local `runs/` workspace directory.
- **Weight Compacting:** Once training finished, the best-performing iteration weights were packaged into a compact, optimized output file named **`best_final.pt`**, which is optimized for running on small embedded devices.
