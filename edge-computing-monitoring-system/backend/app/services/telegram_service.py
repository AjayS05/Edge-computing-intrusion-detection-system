from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings


class TelegramService:
    def is_configured(self) -> bool:
        return bool(
            settings.telegram_enabled
            and settings.telegram_bot_token
            and settings.telegram_chat_id
        )

    def status(self) -> dict[str, Any]:
        if not settings.telegram_enabled:
            status = "disabled"
        elif not settings.telegram_bot_token or not settings.telegram_chat_id:
            status = "not_configured"
        else:
            status = "configured"

        return {
            "status": status,
            "enabled": settings.telegram_enabled,
            "chat_id_configured": bool(settings.telegram_chat_id),
            "bot_token_configured": bool(settings.telegram_bot_token),
            "last_alert_sent": None,
            "alerts_sent_today": 0,
            "last_error": None,
        }

    def send_alert(self, alert: dict[str, Any], *, raw_image_url: str | None = None) -> dict[str, Any]:
        sent_at = datetime.now(timezone.utc).isoformat()

        if not self.is_configured():
            return {
                "telegram_sent": False,
                "telegram_sent_at": None,
                "telegram_error": "Telegram is disabled or not configured",
            }

        message = self._build_alert_message(alert, raw_image_url=raw_image_url)

        try:
            self._send_message(message)
            return {
                "telegram_sent": True,
                "telegram_sent_at": sent_at,
                "telegram_error": None,
            }
        except Exception as exc:
            return {
                "telegram_sent": False,
                "telegram_sent_at": None,
                "telegram_error": str(exc),
            }

    def _send_message(self, message: str) -> None:
        assert settings.telegram_bot_token is not None
        assert settings.telegram_chat_id is not None

        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"

        payload = urllib.parse.urlencode(
            {
                "chat_id": settings.telegram_chat_id,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": "true",
            }
        ).encode("utf-8")

        request = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8")
            result = json.loads(body)

        if not result.get("ok"):
            raise RuntimeError(result)

    def _build_alert_message(self, alert: dict[str, Any], *, raw_image_url: str | None = None) -> str:
        severity = str(alert.get("severity", "unknown")).upper()
        event_type = str(alert.get("event_type") or alert.get("alert_type") or "unknown")
        confidence = alert.get("confidence_percent")
        location = alert.get("camera_location") or "Unknown location"
        node = alert.get("sensor_node_id") or alert.get("node_name") or "Unknown node"
        captured_at = alert.get("captured_at") or alert.get("timestamp") or "Unknown time"

        if isinstance(confidence, (int, float)):
            confidence_text = f"{confidence:.1f}%"
        else:
            confidence_text = "unknown"

        lines = [
            f"<b>{severity} ALERT</b>",
            f"Type: {event_type.replace('_', ' ').title()}",
            f"Confidence: {confidence_text}",
            f"Node: {node}",
            f"Location: {location}",
            f"Captured at: {captured_at}",
            f"Frame ID: {alert.get('frame_id')}",
        ]

        if raw_image_url:
            lines.append(f"Image: {raw_image_url}")

        return "\n".join(lines)


telegram_service = TelegramService()
