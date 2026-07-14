# Part 2: Model Training

This section outlines our cloud-based training execution environment, physical hardware acceleration, execution lifecycle, and weights optimization workflow.

## Training Execution & Cloud Workflow
To train the model efficiently without bottlenecking local hardware, the entire training pipeline was offloaded to cloud-based hardware acceleration:

* **Notebook Instance & Platform:** Executed cleanly inside a dedicated cloud notebook named **`Cloud Model Final`** hosted directly on the **Kaggle** infrastructure. Kaggle provided the necessary pre-configured environment, dependencies, and compute limits needed for this extensive workload.
* **Hardware Acceleration Engine:** Scaled execution loops using parallelized data streams across **2 x NVIDIA Tesla T4 GPUs** (a dual graphics card acceleration setup provided by Kaggle's cloud environment).
* **Execution Lifecycle:** The training pipeline completed a deep training run over **10 continuous processing hours**. We configured hyperparameters such as a tailored batch size and an optimized learning rate to ensure stable gradient descent across all epochs.
* **Convergence Checks & Early Stopping:** During the training runs, accuracy (mAP) and loss graphs (box loss, objectness loss) were actively reviewed to ensure the model was actively learning without over-fitting to the training data. All training progress charts, logs, and weights were output straight into the local `runs/` workspace directory for evaluation.
