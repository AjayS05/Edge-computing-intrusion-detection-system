# Telegram Bot Notifications

## 1. Overview

The Telegram notification feature informs the project team about:

- threats detected by the custom YOLOv8 model;
- infrastructure health events, such as a node becoming unavailable; and
- critical resource conditions reported by the monitoring stack.

The integration is part of the FastAPI backend. It does not require a separate Telegram process in the current deployment. The backend uses the Telegram Bot HTTP API to validate the bot and deliver notifications to the configured chat.

There is no Telegram page, panel or notification-delivery UI in the React frontend. Telegram operates independently through the backend, and users view alerts directly in the configured Telegram chat.

> **Security:** Never commit a Telegram bot token or chat ID to Git. If a token has been exposed in source code, terminal output, screenshots, documentation, or chat, revoke it with BotFather and generate a new token.

## 2. Project Integration

| Component | Responsibility |
| --- | --- |
| Raspberry Pi 4 camera node | Captures frames and uploads them to FastAPI |
| Backend + YOLO inference pod | Validates uploads, runs inference, creates events and initiates alerts |
| Telegram service | Checks bot connectivity and sends messages through the Telegram Bot API |
| SeaweedFS | Persists raw images, annotated evidence and event metadata on SSD-backed storage |
| Prometheus and Grafana | Observe cluster health and provide health-event data |
| Telegram chat | Receives detection and infrastructure alerts |

## 3. Architecture

![Telegram bot architecture](images/telegram-bot-architecture.svg)

**Image placeholder — deployed Telegram architecture:** Replace this note with a screenshot of the architecture diagram on the published documentation page.

The end-to-end alert flow is:

1. The Raspberry Pi 4 camera captures a frame and uploads it to `POST /api/v1/frames`.
2. FastAPI validates the request and the custom YOLOv8 model processes the frame when inference-on-upload is enabled.
3. The backend creates an event containing the detected class, confidence, camera identity and timestamp.
4. Raw and annotated images are stored in the SeaweedFS `captured-images` bucket. Event JSON is stored in `event-metadata`.
5. Alert rules decide whether the event requires a Telegram notification.
6. The Telegram service sends the alert to the external Telegram Bot API.
7. Telegram delivers the message to the configured team chat.
8. The backend records the notification result in its logs or event metadata for troubleshooting and auditing.

## 4. Notification Content

A threat notification should be short, actionable and traceable to the stored event.

```text
🚨 CRITICAL THREAT ALERT

Event: weapon detected
Confidence: 91.4%
Camera: rpi4-camera-01
Location: lab-entry
Captured: 2026-07-15 01:42:18 UTC
Event ID: 3f5b...

Evidence: annotated image attached or linked
```

Recommended notification fields:

| Field | Purpose |
| --- | --- |
| Severity | Allows the team to prioritise the event |
| Detection class | Identifies the detected threat or object |
| Confidence | Shows the model confidence score |
| Camera and location | Identifies where the event occurred |
| Timestamp | Records when the frame was captured |
| Event ID | Correlates the Telegram alert with backend and metadata records |
| Evidence | Provides the annotated frame or a backend evidence link |

The trained model classes are `fire`, `intruder`, `liquid_spill`, `person`, `smoke` and `weapon`. Notification policy should distinguish normal observations such as `person` from urgent threat classes rather than treating every detection as critical.

## 5. Telegram Bot Setup

### 5.1 Create the bot

1. Open Telegram and start a conversation with **@BotFather**.
2. Run `/newbot`.
3. Enter a display name and a unique username ending in `bot`.
4. Copy the bot token temporarily to a secure location.
5. Open the new bot and send `/start` so the conversation exists.

### 5.2 Obtain the chat ID

After sending a message to the bot, request updates from Telegram:

```bash
curl "https://api.telegram.org/bot<REDACTED_BOT_TOKEN>/getUpdates"
```

Find `message.chat.id` in the response. Group chat IDs are commonly negative numbers. Do not put the real token or chat ID into documentation or screenshots.

### 5.3 Validate the bot token

```bash
curl "https://api.telegram.org/bot<REDACTED_BOT_TOKEN>/getMe"
```

A valid response contains `"ok": true` and the bot identity.

**Image placeholder — BotFather setup:** Add a screenshot showing successful bot creation with the token fully hidden.

**Image placeholder — Telegram chat ID:** Add a redacted screenshot of the `getUpdates` response highlighting only `message.chat.id`.

## 6. Backend Configuration

The backend settings load values from environment variables. Telegram is disabled by default and must be explicitly configured.

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=<BOT_TOKEN>
TELEGRAM_CHAT_ID=<CHAT_ID>
```

Relevant application settings:

| Setting | Meaning |
| --- | --- |
| `TELEGRAM_ENABLED` | Enables or disables Telegram notification delivery |
| `TELEGRAM_BOT_TOKEN` | Authenticates the bot with Telegram |
| `TELEGRAM_CHAT_ID` | Selects the private or group chat receiving alerts |

The application configuration currently defaults `telegram_enabled` to `false`. This is a safe default for development and prevents accidental alert delivery when credentials are absent.

## 7. Kubernetes Configuration

Telegram credentials belong in a Kubernetes Secret in the `edge-monitoring` namespace. Non-sensitive switches can remain in the backend ConfigMap.

Create or update the Secret without writing the real values into a manifest:

```bash
kubectl -n edge-monitoring create secret generic backend-secret \
  --from-literal=TELEGRAM_BOT_TOKEN='<BOT_TOKEN>' \
  --from-literal=TELEGRAM_CHAT_ID='<CHAT_ID>' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Add the non-sensitive enable flag to the backend ConfigMap:

```yaml
data:
  TELEGRAM_ENABLED: "true"
```

The backend Deployment should load the ConfigMap and Secret:

```yaml
containers:
  - name: backend
    envFrom:
      - configMapRef:
          name: backend-config
      - secretRef:
          name: backend-secret
```

Restart the backend so the new environment is loaded:

```bash
kubectl rollout restart deployment/backend -n edge-monitoring
kubectl rollout status deployment/backend -n edge-monitoring
```

Confirm that the variable names exist without printing their secret values:

```bash
kubectl get secret backend-secret -n edge-monitoring \
  -o jsonpath='{.data}' | jq 'keys'
```

Expected keys:

```text
[
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID"
]
```

**Image placeholder — Kubernetes Secret:** Add a screenshot of the Secret key names only. Do not show decoded values.

**Image placeholder — backend rollout:** Add a screenshot of the successful backend rollout and Running pod.

## 8. FastAPI Integration

The Telegram router is included by the FastAPI application. The confirmed status endpoint is:

```http
GET /api/v1/telegram/status
```

It calls `telegram_service.status()`, which uses Telegram's `getMe` API to verify that the configured token can reach a valid bot.

Example request:

```bash
curl http://<BACKEND_HOST>:<BACKEND_PORT>/api/v1/telegram/status
```

Example successful response shape:

```json
{
  "status": "online",
  "configured": true,
  "message": "Telegram bot is reachable",
  "username": "edge_sentinel_bot",
  "bot_name": "PIWATCH"
}
```

The exact wording may differ from the deployed service. A response should never contain `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID`.

The monitoring endpoint may also expose the Telegram service state as part of:

```http
GET /api/v1/monitoring/overview
```

This value is intended for backend monitoring and API verification. It is not displayed in the frontend.

### Delivery tracking

If notification auditing is required, each stored event can include:

```json
{
  "telegram_sent": true,
  "telegram_sent_at": "2026-07-15T01:42:20Z",
  "telegram_error": null
}
```

No Telegram-specific frontend page or delivery-history UI is required for the current project. The following backend endpoints can be used for verification or future extensions:

| Endpoint | Purpose | State |
| --- | --- | --- |
| `GET /api/v1/telegram/status` | Bot configuration and connectivity | Confirmed |
| `GET /api/v1/telegram/deliveries` | Recent delivery attempts | Optional future extension |
| `POST /api/v1/telegram/test` | Send a controlled test alert | Optional |
| `POST /api/v1/events/{event_id}/notify` | Retry one event notification | Optional |

## 9. Alert Policy

Sending every frame can overwhelm the team and trigger Telegram rate limits. Apply an alert policy before delivery:

- notify only for configured detection classes and severities;
- require a minimum model confidence;
- suppress duplicate alerts for the same camera and class during a cooldown period;
- retry transient network failures with bounded backoff;
- record every successful or failed delivery against the event;
- never block frame ingestion while waiting for Telegram;
- include infrastructure alerts only after the configured Prometheus condition persists long enough to avoid brief false alarms.

Suggested initial policy:

| Event | Suggested severity | Telegram action |
| --- | --- | --- |
| Weapon | Critical | Send immediately with annotated evidence |
| Fire or smoke | Critical | Send immediately with annotated evidence |
| Intruder | Critical | Send immediately with annotated evidence |
| Liquid spill | Warning | Send when confidence and persistence thresholds are met |
| Person | Informational | Store event; notify only in restricted zones or schedules |
| Node unavailable | Critical | Send after a short confirmation window |
| Temperature ≥ 70°C | Critical | Send immediately after rule evaluation |
| Temperature ≥ 60°C | Warning | Send once per cooldown period |

These thresholds should match the final Prometheus alert rules and project requirements.

## 10. Testing

### 10.1 Check configuration and pod health

```bash
kubectl get pods -n edge-monitoring
kubectl logs deployment/backend -n edge-monitoring --tail=100
```

Avoid commands that print the complete pod environment because they may expose the bot token.

### 10.2 Check backend status

```bash
curl -s http://<BACKEND_HOST>:<BACKEND_PORT>/api/v1/telegram/status | jq
```

Verify that:

- `configured` is `true`;
- the reported status is online;
- the expected bot username is returned; and
- no credentials appear in the response.

### 10.3 Send an end-to-end detection

1. Start the Pi4 camera sender.
2. Present a safe test image containing a trained detection class.
3. Confirm that the frame upload succeeds.
4. Check that an event appears in `GET /api/v1/events`.
5. Open the raw and annotated evidence URLs.
6. Confirm that one Telegram notification reaches the configured chat.
7. Confirm that delivery status is stored with the same event ID.
8. Restart the backend and verify that the event and evidence remain available from SeaweedFS.

### 10.4 Test infrastructure alerts

Use a controlled test alert or temporary test rule. Do not deliberately overheat a Raspberry Pi or interrupt a shared cluster node merely to generate an alert.

**Image placeholder — status endpoint:** Add a screenshot of the successful `/api/v1/telegram/status` response.

**Image placeholder — delivered threat alert:** Add a screenshot of a received Telegram alert with event ID, detection, confidence and camera. Hide usernames or chat IDs if required.

**Image placeholder — annotated evidence:** Add the annotated image corresponding to the Telegram event.

## 11. Troubleshooting

| Symptom | Likely cause | Resolution |
| --- | --- | --- |
| `configured: false` | Token or chat ID is absent | Check Secret key names and restart the backend |
| Telegram status is offline | Invalid/revoked token, DNS failure or no internet access | Validate with `getMe`; verify outbound HTTPS from the backend pod |
| `401 Unauthorized` | Invalid or revoked bot token | Generate a new token and update the Secret |
| `400 Bad Request: chat not found` | Wrong chat ID or the bot has not been started/added | Send `/start`, add the bot to the group and obtain the ID again |
| `403 Forbidden` | User blocked the bot or bot lacks group access | Restore access and verify group permissions |
| Status works but no alert arrives | Alert policy not triggered or send method not called | Check event class, confidence, enable flag and backend logs |
| Repeated alerts | No cooldown or duplicate suppression | Add a camera/class cooldown and event idempotency |
| Message arrives without evidence | Annotated object was not stored or not accessible | Verify the `captured-images` object and backend image endpoint |
| Alerts disappear after restart | Delivery fields were kept only in memory | Persist notification state with event metadata/database records |

Check recent backend logs without exposing the environment:

```bash
kubectl logs deployment/backend -n edge-monitoring --since=10m \
  | grep -iE 'telegram|notification|delivery|error'
```

## 12. Security and Maintenance

- Keep bot credentials only in `.env` for local development and Kubernetes Secrets for deployment.
- Add `.env` to `.gitignore` and never paste real tokens into Markdown.
- Revoke and rotate any token that may have been exposed.
- Do not return secrets through FastAPI endpoints or include them in frontend code.
- Redact tokens, chat IDs, usernames and private images in screenshots.
- Use backend evidence endpoints instead of publishing the SeaweedFS S3 gateway directly.
- Add network timeouts and bounded retries for all Telegram requests.
- Store timestamps in UTC and include the timezone clearly in Telegram messages and API responses.
- Record delivery success, failure reason and retry count for auditing.
- Review bot membership and chat permissions when team members change.

## 13. Final Verification

The Telegram feature is ready for demonstration when all of the following are true:

- the backend pod is Running;
- `/api/v1/telegram/status` reports a configured, reachable bot;
- a controlled YOLO detection produces a persistent event;
- raw and annotated evidence remains available after a restart;
- exactly one notification reaches the correct Telegram chat;
- notification delivery state is linked to the event ID;
- no Telegram-specific frontend UI is required or presented as part of the implementation; and
- screenshots contain no credentials or sensitive identifiers
