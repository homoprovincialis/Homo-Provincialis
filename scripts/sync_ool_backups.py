#!/usr/bin/env python3
"""Mirror the single published OOL catalogue into the two backup files.

The live catalogue is authoritative. Backups are never read to assemble the
website catalogue, and they are never used to overwrite the live JSON.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIVE = ROOT / "homoprovincialis-site/data/open-online-library.json"
BACKUPS = (
    ROOT / "homoprovincialis-site/data/open-online-library-backup.json",
    ROOT / "homoprovincialis-site/documents/open-online-library-backup.json",
)


def verify_catalogue(contents: bytes) -> None:
    catalogue = json.loads(contents.decode("utf-8"))
    if not isinstance(catalogue, dict) or set(catalogue) != {"read", "queue"}:
        raise ValueError("OOL catalogue must contain only read and queue arrays")
    ids: set[str] = set()
    for shelf in ("read", "queue"):
        books = catalogue[shelf]
        if not isinstance(books, list):
            raise ValueError(f"{shelf} must be an array")
        for book in books:
            if not isinstance(book, dict) or not isinstance(book.get("id"), str) or not book["id"]:
                raise ValueError(f"Invalid book in {shelf}")
            if book["id"] in ids:
                raise ValueError(f"Duplicate OOL ID: {book['id']}")
            ids.add(book["id"])
            rating = book.get("rating")
            if shelf == "queue":
                if rating is not None:
                    raise ValueError("Queued books must have null rating")
            elif type(rating) is not int or not 1 <= rating <= 10:
                raise ValueError("Completed books must have a rating from 1 to 10")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if backups are out of date")
    args = parser.parse_args()

    live_bytes = LIVE.read_bytes()
    verify_catalogue(live_bytes)  # Never overwrite backups with invalid JSON.
    outdated = []
    for backup in BACKUPS:
        if not backup.is_file() or backup.read_bytes() != live_bytes:
            outdated.append(backup)
            if not args.check:
                backup.parent.mkdir(parents=True, exist_ok=True)
                backup.write_bytes(live_bytes)
                print(f"Updated {backup.relative_to(ROOT)}")
    if args.check and outdated:
        print("Outdated OOL backups: " + ", ".join(str(p.relative_to(ROOT)) for p in outdated), file=sys.stderr)
        return 1
    if not outdated:
        print("OOL backups already match the published catalogue.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
