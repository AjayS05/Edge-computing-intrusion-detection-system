from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.services.storage_service import storage_service

router = APIRouter(prefix="/api/v1/events", tags=["events"])


@router.get("")
def list_events(limit: int = Query(20, ge=1, le=100)):
    event_keys = storage_service.list_metadata_keys("events/")

    # newest-looking keys last by object key sort, so reverse it
    event_keys = list(reversed(event_keys))[:limit]

    events = []

    for key in event_keys:
        try:
            event = storage_service.read_metadata_json(key)

            event["event_metadata_key"] = key
            event["raw_image_url"] = storage_service.build_public_image_url(
                event.get("raw_image_key")
            )
            event["annotated_image_url"] = storage_service.build_public_image_url(
                event.get("annotated_image_key")
            )

            events.append(event)
        except Exception:
            continue

    return {
        "count": len(events),
        "events": events,
    }


@router.get("/{event_id}")
def get_event(event_id: str):
    event_key = f"events/{event_id}.json"

    try:
        event = storage_service.read_metadata_json(event_key)
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Event not found: {event_id}",
        ) from exc

    event["event_metadata_key"] = event_key
    event["raw_image_url"] = storage_service.build_public_image_url(
        event.get("raw_image_key")
    )
    event["annotated_image_url"] = storage_service.build_public_image_url(
        event.get("annotated_image_key")
    )

    return event
