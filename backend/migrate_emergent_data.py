import argparse
import os
from datetime import datetime
from typing import Any, Dict, List, Tuple

import requests
from pymongo import MongoClient


def normalize_base_url(url: str) -> str:
    return url.rstrip("/")


def parse_payload(payload: Any) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    if isinstance(payload, dict):
        shades = payload.get("shades", [])
        daily_tasks = payload.get("daily_tasks", payload.get("tasks", []))
        if isinstance(shades, list) and isinstance(daily_tasks, list):
            return shades, daily_tasks

    # Fallback: if payload is only shades list.
    if isinstance(payload, list):
        return payload, []

    raise ValueError("Unsupported JSON format for import")


def clean_shade(shade: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = {
        "shade_number": str(shade.get("shade_number", "")).strip(),
        "original_weight": float(shade.get("original_weight", 0) or 0),
        "program_number": shade.get("program_number") or "P1",
        "rc": shade.get("rc") or "No",
        "dyes": shade.get("dyes") or [],
    }

    created_at = shade.get("created_at")
    if created_at:
        cleaned["created_at"] = created_at

    return cleaned


def clean_daily_task(task: Dict[str, Any]) -> Dict[str, Any]:
    cleaned = {
        "date": str(task.get("date", "")).strip(),
        "m1": task.get("m1") or [],
        "m2": task.get("m2") or [],
        "m3": task.get("m3") or [],
        "m4": task.get("m4") or [],
        "m5": task.get("m5") or [],
    }

    created_at = task.get("created_at")
    if created_at:
        cleaned["created_at"] = created_at
    else:
        cleaned["created_at"] = datetime.utcnow()

    return cleaned


def import_data(base_url: str, mongo_url: str, db_name: str) -> None:
    endpoint = f"{normalize_base_url(base_url)}/api/download-data-json"
    print(f"Fetching export from: {endpoint}")

    response = requests.get(endpoint, timeout=60)
    response.raise_for_status()
    payload = response.json()

    shades, daily_tasks = parse_payload(payload)

    client = MongoClient(mongo_url)
    db = client[db_name]

    shades_upserted = 0
    tasks_upserted = 0

    for shade in shades:
        cleaned = clean_shade(shade)
        shade_number = cleaned.get("shade_number")
        if not shade_number:
            continue

        db.shades.update_one(
            {"shade_number": shade_number},
            {"$set": cleaned},
            upsert=True,
        )
        shades_upserted += 1

    for task in daily_tasks:
        cleaned = clean_daily_task(task)
        date = cleaned.get("date")
        if not date:
            continue

        db.daily_tasks.update_one(
            {"date": date},
            {"$set": cleaned},
            upsert=True,
        )
        tasks_upserted += 1

    client.close()

    print(f"Shades imported/upserted: {shades_upserted}")
    print(f"Daily tasks imported/upserted: {tasks_upserted}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import old Emergent export data into MongoDB Atlas"
    )
    parser.add_argument(
        "--base-url",
        required=True,
        help="Preview URL, example: https://xyz.emergentagi.com",
    )
    parser.add_argument(
        "--mongo-url",
        default=os.environ.get("MONGO_URL", ""),
        help="MongoDB connection string. If omitted, uses MONGO_URL env var",
    )
    parser.add_argument(
        "--db-name",
        default=os.environ.get("DB_NAME", ""),
        help="Database name. If omitted, uses DB_NAME env var",
    )

    args = parser.parse_args()

    if not args.mongo_url:
        raise ValueError("Missing MongoDB URL. Pass --mongo-url or set MONGO_URL")
    if not args.db_name:
        raise ValueError("Missing DB name. Pass --db-name or set DB_NAME")

    import_data(args.base_url, args.mongo_url, args.db_name)


if __name__ == "__main__":
    main()
