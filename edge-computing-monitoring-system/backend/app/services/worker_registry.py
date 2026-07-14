from __future__ import annotations

import logging
import socket
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import requests

from app.core.config import settings


LOGGER = logging.getLogger("worker_registry")


@dataclass(frozen=True)
class WorkerEndpoint:
    base_url: str
    worker_id: str
    processing_mode: str


class WorkerRegistry:
    """Discovers configured workers and filters unhealthy endpoints."""

    def _configured_urls(self) -> list[str]:
        urls: list[str] = []

        for raw_url in settings.worker_urls.split(","):
            normalized_url = raw_url.strip().rstrip("/")

            if normalized_url:
                urls.append(normalized_url)

        return urls

    def _dns_discovered_urls(self) -> list[str]:
        host = settings.worker_service_host

        if not host:
            return []

        try:
            address_results = socket.getaddrinfo(
                host,
                settings.worker_service_port,
                family=socket.AF_INET,
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            LOGGER.warning(
                "Could not resolve worker service %s: %s",
                host,
                exc,
            )
            return []

        urls = [
            f"http://{result[4][0]}:"
            f"{settings.worker_service_port}"
            for result in address_results
        ]

        return list(dict.fromkeys(urls))

    def candidate_urls(self) -> list[str]:
        combined_urls = (
            self._configured_urls()
            + self._dns_discovered_urls()
        )

        return list(dict.fromkeys(combined_urls))

    @staticmethod
    def _check_worker(
        base_url: str,
    ) -> WorkerEndpoint | None:
        try:
            response = requests.get(
                f"{base_url}/health",
                timeout=(
                    settings.worker_health_timeout_seconds
                ),
            )
            response.raise_for_status()
            payload: Any = response.json()

            if not isinstance(payload, dict):
                return None

            if payload.get("status") != "healthy":
                return None

            return WorkerEndpoint(
                base_url=base_url,
                worker_id=str(
                    payload.get("worker_id", base_url)
                ),
                processing_mode=str(
                    payload.get(
                        "processing_mode",
                        "unknown",
                    )
                ),
            )

        except (
            requests.RequestException,
            ValueError,
            TypeError,
        ) as exc:
            LOGGER.warning(
                "Worker unavailable at %s: %s",
                base_url,
                exc,
            )
            return None

    def discover_active_workers(
        self,
    ) -> list[WorkerEndpoint]:
        candidate_urls = self.candidate_urls()

        if not candidate_urls:
            return []

        with ThreadPoolExecutor(
            max_workers=min(len(candidate_urls), 32)
        ) as executor:
            checked_workers = list(
                executor.map(
                    self._check_worker,
                    candidate_urls,
                )
            )

        active_workers = [
            worker
            for worker in checked_workers
            if worker is not None
        ]

        return sorted(
            active_workers,
            key=lambda worker: worker.worker_id,
        )


worker_registry = WorkerRegistry()
