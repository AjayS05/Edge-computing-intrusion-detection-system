<article markdown="1">

# Telegram Bot Integration

## 1. Overview

The Telegram Bot integration provides real-time notifications for the PiWatch edge monitoring system. The FastAPI backend communicates directly with the Telegram Bot API to verify bot connectivity and deliver notifications to a configured Telegram chat.

Unlike the frontend, Telegram does not require a separate application or service. The backend itself is responsible for sending notifications whenever Telegram is enabled and a valid bot configuration is available.

---

## 2. System Integration

| Component | Responsibility |
|------------|----------------|
| Raspberry Pi 4 | Captures images and uploads frames to the backend |
| FastAPI Backend | Processes uploads, performs inference workflow and communicates with Telegram |
| YOLO Inference Service | Detects objects from uploaded images |
| SeaweedFS | Stores raw images, annotated images and metadata |
| Telegram Bot API | Delivers notifications to the configured Telegram chat |
| React Frontend | Displays Telegram service status using backend APIs |

---

## 3. Telegram Architecture

![Telegram Architecture](assets/telegram/telegram-notification.png)

**Figure 1. Telegram notification**

The notification flow is:

1. Raspberry Pi 4 captures a frame.
2. The frame is uploaded to the FastAPI backend.
3. The backend validates the upload and performs object detection.
4. Detection results are stored together with image metadata.
5. If Telegram is enabled, the backend communicates with the Telegram Bot API.
6. Telegram delivers the notification to the configured chat.

---

### Screenshot Placeholder

**Filename**

```
assets/telegram/telegram-architecture.png
```

---

## 4. Telegram Bot Setup

### Step 1 – Create the Bot

1. Open Telegram.
2. Search for **@BotFather**.
3. Execute:

```
/newbot
```

4. Enter a bot name.
5. Enter a unique bot username ending with **bot**.
6. BotFather returns a Bot Token.

---

### Step 2 – Start the Bot

Open the newly created bot.

Send

```
/start
```

This creates a conversation that the backend can later use.

---

### Step 3 – Obtain Chat ID

Run

```bash
curl https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
```

Locate

```
message.chat.id
```

This value becomes the Telegram Chat ID.

---

### Screenshot Placeholder

**Bot Creation**

```
assets/telegram/botfather-create-bot.png
```

---

## 5. Backend Configuration

Telegram configuration is loaded from environment variables.

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<BOT_TOKEN>
TELEGRAM_CHAT_ID=<CHAT_ID>
```

These values are never stored directly in source code.

---

## 6. Kubernetes Configuration

Sensitive Telegram credentials are stored inside the Kubernetes Secret.

Example:

```yaml
stringData:
  TELEGRAM_BOT_TOKEN: "<BOT_TOKEN>"
  TELEGRAM_CHAT_ID: "<CHAT_ID>"
```

The backend deployment loads:

- backend-config ConfigMap
- backend-secret Secret

using

```yaml
envFrom:
  - configMapRef:
      name: backend-config

  - secretRef:
      name: backend-secret
```

This allows credentials to be changed without modifying the application source code.

---

### Screenshot Placeholder

**Kubernetes Secret**

```
assets/telegram/backend-secret.png
```

*(Hide the actual values.)*

---

## 7. FastAPI Integration

The Telegram router is registered in the FastAPI application.

Implemented endpoint:

```
GET /api/v1/telegram/status
```

This endpoint verifies:

- Telegram is enabled
- Bot token exists
- Chat ID exists
- Backend can communicate with the Telegram Bot API

The monitoring endpoint also exposes Telegram status through

```
GET /api/v1/monitoring/overview
```

allowing the frontend Monitoring page to display the current Telegram service status.

---

### Screenshot Placeholder

**Telegram Status API**

```
assets/telegram/telegram-status-api.png
```

---

## 8. End-to-End Workflow

The implemented notification workflow is:

```
Pi4 Camera
      │
      ▼
FastAPI Backend
      │
      ▼
YOLO Inference
      │
      ▼
Store Images + Metadata
      │
      ▼
Telegram Service
      │
      ▼
Telegram Bot API
      │
      ▼
Telegram Chat
```

---

## 9. Testing

The following tests were performed during development.

### Verify Backend Status

```bash
curl http://<BACKEND_IP>:8000/api/v1/telegram/status
```

Expected result:

- Telegram configured
- Bot reachable

---

### Verify Monitoring API

```bash
curl http://<BACKEND_IP>:8000/api/v1/monitoring/overview
```

The response includes Telegram service status used by the frontend Monitoring page.

---

### Verify Bot Connectivity

The backend communicates directly with the Telegram Bot API using the configured Bot Token and Chat ID.

Successful communication confirms:

- Bot Token is valid
- Chat ID is valid
- Internet connectivity is available
- Telegram API is reachable

---

### Screenshot Placeholder

**Telegram Notification**

```
assets/telegram/telegram-alert.png
```

---

## 10. Troubleshooting

| Problem | Possible Cause | Solution |
|----------|----------------|----------|
| Telegram disabled | `TELEGRAM_ENABLED=false` | Enable Telegram in backend configuration |
| Invalid Bot Token | Incorrect or revoked token | Generate a new token using BotFather |
| Invalid Chat ID | Wrong chat ID | Obtain the correct chat ID using `getUpdates` |
| Network unreachable | Backend pod has no Internet connectivity | Verify network routing and DNS |
| Bot not started | User never sent `/start` | Open the bot and send `/start` |

---

## 11. Security

The following practices are followed:

- Store Bot Token in Kubernetes Secret.
- Never commit Telegram credentials to Git.
- Never expose Bot Token through APIs.
- Hide Bot Token and Chat ID in screenshots.
- Rotate Bot Token immediately if exposed.

---

## 12. Files Used

```
backend/
│
├── app/
│   ├── api/
│   │   └── telegram.py
│   │
│   └── services/
│       └── telegram_service.py
│
├── k8s/
│
└── backend-secret
```



</article>
