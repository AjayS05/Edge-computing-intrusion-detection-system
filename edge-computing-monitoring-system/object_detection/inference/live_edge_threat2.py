import subprocess
import cv2
import numpy as np
from ultralytics import YOLO
import time
import threading

print("🔄 Initializing Custom YOLOv8 Physical Threat Engine...")
model = YOLO('/home/pi4/best_k.pt')

FPS = 30

# Global variables for zero-lag frame sharing
latest_frame = None
frame_lock = threading.Lock()

def capture_thread():
    """Background thread that keeps memory updated with ONLY the freshest frame."""
    global latest_frame
    rpicam_cmd = [
        'rpicam-vid', '-t', '0', '--codec', 'mjpeg', '--nopreview',
        '--width', '640', '--height', '640', '--framerate', str(FPS), '-o', '-'
    ]
    pipe = subprocess.Popen(rpicam_cmd, stdout=subprocess.PIPE, bufsize=10**6)
    
    bytes_data = b""
    try:
        while True:
            bytes_data += pipe.stdout.read(4096)
            a = bytes_data.find(b'\xff\xd8')
            b = bytes_data.find(b'\xff\xd9')
            
            if a != -1 and b != -1:
                jpg = bytes_data[a:b+2]
                bytes_data = bytes_data[b+2:]
                
                frame = cv2.imdecode(np.frombuffer(jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                if frame is not None:
                    with frame_lock:
                        latest_frame = frame
    except Exception as e:
        print(f"\n❌ Camera capture error: {e}")
    finally:
        pipe.terminate()

# Start camera thread
t = threading.Thread(target=capture_thread, daemon=True)
t.start()

print("🚀 Zero-Lag Guard Active! Scanning live environment for threat frames...")

# Cooldown tracking variables
last_snapshot_time = 0
COOLDOWN_PERIOD = 10  # Seconds to wait before taking another picture

try:
    while True:
        current_time = time.time()
        
        # Grab the absolute freshest frame available right now
        with frame_lock:
            if latest_frame is None:
                continue
            frame = latest_frame.copy()
        
        # Run inference (Keeping confidence floor at 0.55 to kill room hallucinations)
        results = model.predict(source=frame, verbose=False, conf=0.55) 
        
        threat_detected = False
        detected_names = []
        annotated_frame = None
        
        for result in results:
            if len(result.boxes) > 0:
                threat_detected = True
                annotated_frame = result.plot()
                
                # Dynamic class lookup to see exactly what the model flagged
                for box in result.boxes:
                    class_id = int(box.cls[0].item())
                    conf = box.conf[0].item()
                    label = model.names[class_id]  # Resolves to 'intruder', 'weapon', or 'fire'
                    detected_names.append(f"{label.upper()} ({conf*100:.1f}%)")
        
        # SNAPSHOT LOGIC
        if threat_detected:
            if (current_time - last_snapshot_time) > COOLDOWN_PERIOD:
                timestamp = time.strftime("%Y%m%d-%H%M%S")
                image_filename = f"/home/pi4/threat_frame_{timestamp}.jpg"
                
                # Save the frame with bounding boxes cleanly drawn onto it
                cv2.imwrite(image_filename, annotated_frame)
                
                # Print exact target matching
                print(f"\n⚠️ THREAT CAPTURED: {', '.join(detected_names)}")
                print(f"📸 SNAPSHOT SAVED: {image_filename}")
                print(f"🔒 Cooldown active for {COOLDOWN_PERIOD} seconds to prevent flooding...\n")
                
                last_snapshot_time = current_time
            else:
                # Discard frame silently during active cooldown
                pass
        
        if not threat_detected:
            print("Scanning stream... No threats detected.     ", end="\r")
            
        time.sleep(0.01)

except KeyboardInterrupt:
    print("\n🛑 Shutting down cluster threat-monitor gracefully...")