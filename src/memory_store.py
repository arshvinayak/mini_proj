import json
import uuid
import os
from datetime import datetime
from pathlib import Path
import re

# Simple JSON-backed memory file
MEMORY_FILE = Path("/workspaces/mini_proj/data/memories.json")
MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
# ensure the file exists and contains valid JSON (avoid empty/corrupt file)
if not MEMORY_FILE.exists():
    MEMORY_FILE.write_text(json.dumps({}))
else:
    try:
        with open(MEMORY_FILE, "w") as f:
            content = f.read()
            if not content.strip():
                MEMORY_FILE.write_text(json.dumps({}))
            else:
                json.loads(content)
    except (json.JSONDecodeError, ValueError):
        # replace corrupted file with an empty JSON object
        MEMORY_FILE.write_text(json.dumps({}))

def _read_all():
    try:
        with open(MEMORY_FILE, "r") as f:
            content = f.read()
            if not content.strip():
                return {}
            return json.loads(content)
    except (json.JSONDecodeError, ValueError, FileNotFoundError):
        # if file is missing or invalid, reset it and return empty dict
        try:
            with open(MEMORY_FILE, "w") as f:
                f.write(json.dumps({}))
        except Exception:
            pass
        return {}

def _write_all(data):
    with open(MEMORY_FILE, "w") as f:
        json.dump(data, f, default=str, indent=2)

def add_task(mem_id, namespace, text, scheduled_dt=None):
    """
    namespace: tuple or string namespace used by the store
    text: task description
    scheduled_dt: a datetime (UTC or local) or None
    """
    entry = {
        "id": mem_id,
        "text": text,
        "scheduled": scheduled_dt.isoformat() if scheduled_dt else None,
        "created_at": datetime.now().isoformat()
    }
    # persist to JSON
    all_data = _read_all()
    ns_key = str(namespace)
    all_data.setdefault(ns_key, []).append(entry)
    _write_all(all_data)
    

def get_tasks(namespace):
    all_data = _read_all()
    return all_data.get(str(namespace), [])


def delete_task(namespace, task_id):
    """
    Remove a task by id from the JSON store and try to remove from InMemoryStore.
    Returns True if deleted, False if not found.
    """
    all_data = _read_all()
    ns_key = str(namespace)
    items = all_data.get(ns_key, [])
    # try exact id match first
    new_items = [item for item in items if item.get("id") != task_id]
    if len(new_items) == len(items):
        # no exact match; attempt fallback match by deterministic fallback id
        # (handles legacy entries that may not have an 'id' field)
        found = False
        for item in items:
            item_id = item.get("id")
            if item_id == task_id:
                found = True
                break
        if not found:
            # generate fallback id for each item and compare
            import uuid as _uuid
            fallback_idx = None
            for idx, item in enumerate(items):
                fallback = item.get("id")
                if not fallback:
                    fallback = str(_uuid.uuid5(_uuid.NAMESPACE_URL, (item.get("text") or "") + "|" + (item.get("created_at") or "")))
                if fallback == task_id:
                    fallback_idx = idx
                    break
            if fallback_idx is None:
                return False
            # remove the matched item
            del items[fallback_idx]
            all_data[ns_key] = items
            _write_all(all_data)
    else:
        all_data[ns_key] = new_items
        _write_all(all_data)
    
    return True


# ──────────────────────────────────────────────
#           MEDICATION MANAGEMENT
# ──────────────────────────────────────────────
MEDICATIONS_KEY = "medications"

def add_medication(med_id, name, times, days=None, frequency="daily"):
    """
    Add a medication reminder.
    
    Args:
        med_id: unique identifier for this medication
        name: medication name
        times: list of times (e.g., ["08:00", "14:00"])
        days: list of day names (e.g., ["Monday", "Friday"]) - only used if frequency != "daily"
        frequency: "daily" or "custom"
    
    Returns:
        The medication entry
    """
    entry = {
        "id": med_id,
        "name": name,
        "times": times,
        "days": days or [],
        "frequency": frequency,
        "created_at": datetime.now().isoformat()
    }
    all_data = _read_all()
    all_data.setdefault(MEDICATIONS_KEY, []).append(entry)
    _write_all(all_data)
    return entry


def get_medications():
    """Get all medications."""
    all_data = _read_all()
    return all_data.get(MEDICATIONS_KEY, [])


def delete_medication(med_id):
    """
    Remove a medication by id.
    Returns True if deleted, False if not found.
    """
    all_data = _read_all()
    items = all_data.get(MEDICATIONS_KEY, [])
    new_items = [item for item in items if item.get("id") != med_id]
    if len(new_items) < len(items):
        all_data[MEDICATIONS_KEY] = new_items
        _write_all(all_data)
        return True
    return False
