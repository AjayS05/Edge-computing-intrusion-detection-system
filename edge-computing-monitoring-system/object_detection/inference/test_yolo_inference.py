from pathlib import Path
import argparse
import json
import time

import cv2
from ultralytics import YOLO


def run_inference(model_path: Path, image_path: Path, output_dir: Path, confidence: float) -> None:
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading YOLO model from: {model_path}")
    model = YOLO(str(model_path))

    print(f"Running inference on image: {image_path}")
    start_time = time.perf_counter()

    results = model.predict(
        source=str(image_path),
        verbose=False,
        conf=confidence,
    )

    latency_seconds = time.perf_counter() - start_time

    detections = []
    annotated_image = None

    for result in results:
        annotated_image = result.plot()

        if result.boxes is None:
            continue

        for box in result.boxes:
            class_id = int(box.cls[0].item())
            confidence_score = float(box.conf[0].item())
            xyxy = box.xyxy[0].tolist()

            class_name = model.names[class_id]

            detections.append(
                {
                    "class_id": class_id,
                    "class_name": class_name,
                    "confidence": round(confidence_score, 4),
                    "confidence_percent": round(confidence_score * 100, 2),
                    "bounding_box": {
                        "x_min": round(float(xyxy[0]), 2),
                        "y_min": round(float(xyxy[1]), 2),
                        "x_max": round(float(xyxy[2]), 2),
                        "y_max": round(float(xyxy[3]), 2),
                    },
                }
            )

    result_dir = output_dir / "prediction"
    result_dir.mkdir(parents=True, exist_ok=True)

    annotated_path = result_dir / f"annotated_{image_path.name}"
    detections_path = result_dir / "detections.json"

    if annotated_image is not None:
        cv2.imwrite(str(annotated_path), annotated_image)

    summary = {
        "model_path": str(model_path),
        "image_path": str(image_path),
        "confidence_threshold": confidence,
        "latency_seconds": round(latency_seconds, 4),
        "detection_count": len(detections),
        "detections": detections,
        "annotated_image": str(annotated_path),
    }

    with detections_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    print(json.dumps(summary, indent=2))
    print()
    print(f"Annotated image saved at: {annotated_path}")
    print(f"Detection JSON saved at: {detections_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Test trained YOLOv8 threat model on one uploaded image.")
    parser.add_argument("--model", default="object_detection/models/best_k.pt")
    parser.add_argument("--image", required=True)
    parser.add_argument("--output-dir", default="object_detection/results")
    parser.add_argument("--confidence", type=float, default=0.55)

    args = parser.parse_args()

    run_inference(
        model_path=Path(args.model),
        image_path=Path(args.image),
        output_dir=Path(args.output_dir),
        confidence=args.confidence,
    )


if __name__ == "__main__":
    main()
