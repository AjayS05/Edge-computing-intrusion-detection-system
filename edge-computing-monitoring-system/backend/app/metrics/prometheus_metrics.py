from prometheus_client import Counter, Histogram


FRAMES_UPLOADED_TOTAL = Counter(
    "camera_frames_uploaded_total",
    "Number of camera frames accepted by the backend",
    ["sensor_node_id"],
)

FRAME_UPLOAD_FAILURES_TOTAL = Counter(
    "camera_upload_failures_total",
    "Number of rejected or failed camera-frame uploads",
    ["reason"],
)

FRAME_UPLOAD_PROCESSING_SECONDS = Histogram(
    "frame_upload_processing_seconds",
    "Time spent validating, saving, and recording one uploaded frame",
)

FRAME_UPLOAD_BYTES = Histogram(
    "camera_frame_upload_bytes",
    "Size of accepted camera-frame uploads in bytes",
    buckets=(50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000),
)
