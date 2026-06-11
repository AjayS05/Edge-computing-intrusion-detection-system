# Pi 4 Camera Sender

This module captures a JPEG image from a Raspberry Pi camera and uploads it to the
Pi 5 FastAPI ingestion backend at a configurable interval.

## Install

```bash
cd hardware/raspberry_pi/camera_sender
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Update `backend_url` in `config.yaml` with the Pi 5 LAN IP address.

## Test camera capture once

```bash
bash test_camera_once.sh
```

## Run automatic sender

```bash
source .venv/bin/activate
python camera_sender.py config.yaml
```

Stop with `Ctrl+C`.

The sender stores temporary and queued retry images only in
`~/edge-camera-sender-runtime`.
