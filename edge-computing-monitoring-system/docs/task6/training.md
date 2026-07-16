# Data Collection

This section covers our custom dataset acquisition, structural distribution, preprocessing filters, and environmental augmentation strategies designed to prepare our images for model ingestion.

## Dataset Architecture & Specifications
To ensure the security model is completely reliable when running live on the edge, we put together a large-scale, target-specific custom dataset. 

* **Dataset Footprint & Sources:** Organized a high-density archive containing over **37,000+ total images** covering our core security classes. To achieve this scale and ensure high visual diversity, the data was aggregated from multiple sources:
  * **Roboflow Universe:** Sourced domain-specific public datasets related to intrusion detection and security monitoring.
  * **Kaggle:** Integrated specialized, publicly available security and surveillance image datasets to introduce unique environments.
  * **COCO Dataset:** Extracted baseline objects (such as people and backpacks) from the massive Common Objects in Context (COCO) dataset to strengthen the model's general object recognition capabilities.
* **Dataset Distribution Split:** The full dataset is strictly partitioned to maintain independent evaluation boundaries:
  * **Training Set:** 70% (Used to build model paths)
  * **Validation Set:** 15% (Used to check accuracy during runs)
  * **Test Set:** 15% (Used for the final model statistics)
* **Labels & Schema:** All images from these varied sources were uploaded to **Roboflow**, which served as our central data management platform. The annotations, bounding box coordinates, and folder splits were standardized there and exported in the YOLO format, linked via the central `data.yaml` configuration file.

## Preprocessing Configurations
Before passing data to the model, two mandatory image filters were configured globally to standardize the camera frames:
* **Auto-Orient:** Applied across all samples to strip camera orientation metadata, making sure images stay right-side up.
* **Resize Adjustment:** Applied a uniform **Stretch to 640x640 pixels** to match our target neural network input dimension perfectly.

## Augmentation Settings
We deliberately generated multiple modified versions of our training images using software transformations within Roboflow. This prepares the AI model to handle tough, unpredictable real-world environments without making mistakes:

* **Outputs per Training Example:** Generated **3 augmented variations** for every 1 original training image to aggressively expand our training patterns.
* **Horizontal Flip:** Flipped images horizontally to ensure the model detects threats moving from both left-to-right and right-to-left directions.
* **Exposure Adjustments:** Shifted image brightness randomly **between -15% and +15%**. This simulates low-lighting levels, dark rooms, shadow blocks, or daytime outdoor sun glare, ensuring high sensitivity in poor visibility.
* **Multi-Angle Variations:** Rotated and tilted angles to train the model to recognize targets even if the security camera is mounted sideways, skewed, or high up on ceilings.


# Model Training

This section outlines our cloud-based training execution environment, physical hardware acceleration, execution lifecycle, and weights optimization workflow.

## Training Execution & Cloud Workflow
To train the model efficiently without bottlenecking local hardware, the entire training pipeline was offloaded to cloud-based hardware acceleration:

* **Model Selection & Architecture:** Utilized the **YOLOv8 Nano (yolov8n)** architecture. This lightweight, anchor-free model has a tiny memory footprint (approx. 3.2 million parameters), making it the ideal candidate for high-speed, real-time edge deployment on resource-constrained hardware.
* **Notebook Instance & Platform:** Executed cleanly inside a dedicated cloud notebook named **`Cloud Model Final`** hosted directly on the **Kaggle** infrastructure. Kaggle provided the necessary pre-configured environment, dependencies, and compute limits needed for this extensive workload.
* **Hardware Acceleration Engine:** Scaled execution loops using parallelized data streams across **2 x NVIDIA Tesla T4 GPUs** (a dual graphics card acceleration setup provided by Kaggle's cloud environment).
* **Execution Lifecycle:** The training pipeline completed a deep training run over **10 continuous processing hours**. We configured hyperparameters such as a tailored batch size and an optimized learning rate to ensure stable gradient descent across all epochs.
* **Convergence Checks & Early Stopping:** During the training runs, accuracy (mAP) and loss graphs (box loss, objectness loss) were actively reviewed to ensure the model was actively learning without over-fitting to the training data. All training progress charts, logs, and weights were output straight into the local `runs/` workspace directory for evaluation.
