from __future__ import annotations

import sqlite3
from contextlib import closing
from pathlib import Path

from app.models.frame import FrameResponse


class FrameRepository:
    """SQLite metadata repository for uploaded camera frames."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def initialize(self) -> None:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS frames (
                    frame_id TEXT PRIMARY KEY,
                    sensor_node_id TEXT NOT NULL,
                    sequence_number INTEGER,
                    camera_location TEXT,
                    captured_at TEXT NOT NULL,
                    received_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    content_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    stored_filename TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_frames_sensor_received_at
                ON frames(sensor_node_id, received_at DESC)
                """
            )
            connection.commit()

    def ping(self) -> None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute("SELECT 1").fetchone()

    def create(self, frame: FrameResponse) -> FrameResponse:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.execute(
                """
                INSERT INTO frames (
                    frame_id,
                    sensor_node_id,
                    sequence_number,
                    camera_location,
                    captured_at,
                    received_at,
                    status,
                    content_type,
                    size_bytes,
                    stored_filename
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    frame.frame_id,
                    frame.sensor_node_id,
                    frame.sequence_number,
                    frame.camera_location,
                    frame.captured_at.isoformat(),
                    frame.received_at.isoformat(),
                    frame.status,
                    frame.content_type,
                    frame.size_bytes,
                    frame.stored_filename,
                ),
            )
            connection.commit()
        return frame

    def get_by_id(self, frame_id: str) -> FrameResponse | None:
        with closing(sqlite3.connect(self.database_path)) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT * FROM frames WHERE frame_id = ?", (frame_id,)
            ).fetchone()

        if row is None:
            return None

        return FrameResponse(**dict(row))
