# Model Architecture

This section describes the structural characteristics of our final trained model, its optimization for low-power edge environments, and deployment-ready weight configurations.

## Edge-Optimized Model Design
Our final model is built with a highly compacted and fast-inferencing architecture designed specifically to execute deep learning tasks on resource-constrained edge hardware. 

* **Base Architecture:** The foundation of our solution relies on the highly efficient **YOLO (You Only Look Once)** architecture. It was selected specifically for its state-of-the-art balance between mean Average Precision (mAP) and real-time inference speed.
* **Input Dimension Target:** Optimized to process frames at a fixed **640x640 pixel resolution**, matching our standardized dataset pipeline for consistent feature extraction while keeping memory consumption low.
* **Weight Compacting:** Once training finished, the best-performing iteration weights were packaged into a compact, optimized output file named **`best_final.pt`**. 
* **Deployment Profile & Edge Inference:** This compacted weight structure is optimized specifically for running fast object-detection pipelines on small embedded devices with limited thermal and processing overhead. By utilizing this architecture, the system achieves a high Frame Per Second (FPS) throughput without requiring high-end desktop GPUs, making it ideal for live security camera feeds.
