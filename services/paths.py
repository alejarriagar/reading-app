import json
import re
import unicodedata
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from services import library as lib

ROOT = Path(__file__).resolve().parents[1]
PATHS_FILE = ROOT / "assets" / "paths.json"
RANK = {"LOCKED": 0, "DISCOVERED": 1, "READING": 2, "READ": 3}


def norm(value):
    value = re.sub(r"\(.*?\)", " ", str(value))
    value = unicodedata.normalize("NFD", value.casefold())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


@lru_cache(maxsize=1)
def all_paths():
    data = json.loads(PATHS_FILE.read_text(encoding="utf-8-sig"))
    return data["paths"]


def best_state(states):
    return max(states, key=lambda state: RANK.get(state, 0), default="LOCKED")


def _library_index():
    authors = lib.authors()
    rows = []
    for book in lib.books():
        rows.append({
            "id": book["id"],
            "title": book["title"],
            "title_key": norm(book["title"]),
            "author_key": norm(authors.get(book["author"], {}).get("name", "")),
            "state": lib.book_state(book["id"]),
        })
    return rows


def _author_keys(author):
    return {norm(name) for name in [author["name"], *author.get("aliases", [])]}


def path_status(path):
    index = _library_index()
    result = []

    for author in path["authors"]:
        keys = _author_keys(author)
        own_books = [row for row in index if row["author_key"] in keys]
        matched_ids = set()
        works = []

        for work in author["works"]:
            titles = {norm(t) for t in [work["title"], *work.get("aliases", [])]}
            matches = [row for row in own_books if row["title_key"] in titles]
            match = max(
                matches,
                key=lambda row: RANK.get(row["state"], 0),
                default=None,
            )
            matched_ids.update(row["id"] for row in matches)
            works.append({
                **work,
                "book_id": match["id"] if match else None,
                "state": match["state"] if match else "LOCKED",
            })

        other_read = [
            row["title"] for row in own_books
            if row["id"] not in matched_ids and row["state"] == "READ"
        ]

        state = best_state(
            [row["state"] for row in own_books]
            + [item["state"] for item in works]
        )

        result.append({
            **author,
            "works": works,
            "state": state,
            "other_read": other_read,
        })

    return result


def set_work_state(path, author, work, state):
    if state not in RANK:
        raise ValueError("Estado no válido.")

    book_id = work.get("book_id")

    if book_id is None:
        if state == "LOCKED":
            return None

        keys = _author_keys(author)
        existing_name = next(
            (
                item["name"] for item in lib.authors().values()
                if norm(item["name"]) in keys
            ),
            author["name"],
        )
        regions = lib.regions()
        region_ids = [
            region_id for region_id in path.get("region_ids", [])
            if region_id in regions
        ]
        book_id = lib.add_book(
            work["title"],
            existing_name,
            author.get("country", ""),
            path.get("period", ""),
            [],
            region_ids,
        )

    metadata = dict(lib.profile()["book_metadata"].get(book_id, {}))
    if state == "READ" and not metadata.get("year"):
        metadata["year"] = datetime.now().year

    lib.update_book(book_id, state, metadata)
    return book_id
