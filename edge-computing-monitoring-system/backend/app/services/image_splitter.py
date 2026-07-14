from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class ImageTile:
    frame_id: str
    tile_id: str

    row: int
    column: int

    crop_x: int
    crop_y: int
    crop_width: int
    crop_height: int

    core_x: int
    core_y: int
    core_width: int
    core_height: int

    source_offset_x: int
    source_offset_y: int

    image_bytes: bytes
    content_type: str


@dataclass(frozen=True)
class SplitImageResult:
    frame_id: str

    original_width: int
    original_height: int

    rows: int
    columns: int
    layout: str

    tiles: list[ImageTile]


class ImageSplitter:
    """Splits an image into overlapping tiles and reconstructs it."""

    @staticmethod
    def choose_layout(
        active_worker_count: int,
    ) -> tuple[int, int]:
        # Returned as rows, columns.
        if active_worker_count >= 8:
            return 2, 4

        if active_worker_count >= 6:
            return 2, 3

        if active_worker_count >= 4:
            return 2, 2

        if active_worker_count >= 2:
            return 1, 2

        return 1, 1

    def split(
        self,
        *,
        frame_id: str,
        image_bytes: bytes,
        active_worker_count: int,
        overlap_pixels: int,
        jpeg_quality: int = 95,
    ) -> SplitImageResult:
        if not image_bytes:
            raise ValueError("Cannot split an empty image")

        encoded_image = np.frombuffer(
            image_bytes,
            dtype=np.uint8,
        )

        frame = cv2.imdecode(
            encoded_image,
            cv2.IMREAD_COLOR,
        )

        if frame is None:
            raise ValueError(
                "Could not decode image for tile splitting"
            )

        original_height, original_width = frame.shape[:2]

        rows, columns = self.choose_layout(
            active_worker_count
        )

        overlap_pixels = max(0, overlap_pixels)
        jpeg_quality = max(1, min(100, jpeg_quality))

        x_edges = [
            index * original_width // columns
            for index in range(columns + 1)
        ]

        y_edges = [
            index * original_height // rows
            for index in range(rows + 1)
        ]

        tiles: list[ImageTile] = []

        for row in range(rows):
            for column in range(columns):
                core_x_start = x_edges[column]
                core_x_end = x_edges[column + 1]
                core_y_start = y_edges[row]
                core_y_end = y_edges[row + 1]

                crop_x_start = max(
                    0,
                    core_x_start - overlap_pixels,
                )
                crop_y_start = max(
                    0,
                    core_y_start - overlap_pixels,
                )
                crop_x_end = min(
                    original_width,
                    core_x_end + overlap_pixels,
                )
                crop_y_end = min(
                    original_height,
                    core_y_end + overlap_pixels,
                )

                tile_frame = frame[
                    crop_y_start:crop_y_end,
                    crop_x_start:crop_x_end,
                ]

                if tile_frame.size == 0:
                    raise RuntimeError(
                        f"Generated an empty tile at {row}-{column}"
                    )

                success, encoded_tile = cv2.imencode(
                    ".jpg",
                    tile_frame,
                    [
                        int(cv2.IMWRITE_JPEG_QUALITY),
                        jpeg_quality,
                    ],
                )

                if not success:
                    raise RuntimeError(
                        f"Could not encode tile {row}-{column}"
                    )

                tile_id = f"tile-{row}-{column}"

                tiles.append(
                    ImageTile(
                        frame_id=frame_id,
                        tile_id=tile_id,
                        row=row,
                        column=column,
                        crop_x=crop_x_start,
                        crop_y=crop_y_start,
                        crop_width=(
                            crop_x_end - crop_x_start
                        ),
                        crop_height=(
                            crop_y_end - crop_y_start
                        ),
                        core_x=core_x_start,
                        core_y=core_y_start,
                        core_width=(
                            core_x_end - core_x_start
                        ),
                        core_height=(
                            core_y_end - core_y_start
                        ),
                        source_offset_x=(
                            core_x_start - crop_x_start
                        ),
                        source_offset_y=(
                            core_y_start - crop_y_start
                        ),
                        image_bytes=encoded_tile.tobytes(),
                        content_type="image/jpeg",
                    )
                )

        return SplitImageResult(
            frame_id=frame_id,
            original_width=original_width,
            original_height=original_height,
            rows=rows,
            columns=columns,
            layout=f"{columns}x{rows}",
            tiles=tiles,
        )

    def reconstruct(
        self,
        *,
        split_result: SplitImageResult,
        processed_tiles: dict[str, bytes],
    ) -> bytes:
        reconstructed_frame = np.zeros(
            (
                split_result.original_height,
                split_result.original_width,
                3,
            ),
            dtype=np.uint8,
        )

        for tile in split_result.tiles:
            processed_bytes = processed_tiles.get(
                tile.tile_id
            )

            if not processed_bytes:
                raise ValueError(
                    f"Processed tile missing: {tile.tile_id}"
                )

            encoded_tile = np.frombuffer(
                processed_bytes,
                dtype=np.uint8,
            )

            processed_frame = cv2.imdecode(
                encoded_tile,
                cv2.IMREAD_COLOR,
            )

            if processed_frame is None:
                raise ValueError(
                    f"Could not decode processed tile: "
                    f"{tile.tile_id}"
                )

            required_width = (
                tile.source_offset_x + tile.core_width
            )
            required_height = (
                tile.source_offset_y + tile.core_height
            )

            actual_height, actual_width = (
                processed_frame.shape[:2]
            )

            if (
                actual_width < required_width
                or actual_height < required_height
            ):
                raise ValueError(
                    f"Processed tile {tile.tile_id} has "
                    f"invalid dimensions "
                    f"{actual_width}x{actual_height}"
                )

            core_region = processed_frame[
                tile.source_offset_y:
                tile.source_offset_y + tile.core_height,
                tile.source_offset_x:
                tile.source_offset_x + tile.core_width,
            ]

            reconstructed_frame[
                tile.core_y:
                tile.core_y + tile.core_height,
                tile.core_x:
                tile.core_x + tile.core_width,
            ] = core_region

        success, encoded_result = cv2.imencode(
            ".png",
            reconstructed_frame,
        )

        if not success:
            raise RuntimeError(
                "Could not encode reconstructed image"
            )

        return encoded_result.tobytes()


image_splitter = ImageSplitter()
