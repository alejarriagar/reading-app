import copy
import json
import shutil
import uuid
from functools import lru_cache
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "assets" / "catalog.json"
PROFILE_FILE = ROOT / "reading_progress.json"

BOOK_STATES = ["LOCKED", "DISCOVERED", "READING", "READ"]
TIERS = ["ESSENTIAL", "RECOMMENDED", "SPECIALIZED"]

DEFAULT_PROFILE = {
    "book_statuses": {},
    "book_metadata": {},
    "mastered_regions": [],
    "mastered_authors": [],
    "tier_overrides": {},
    "custom_books": [],
    "custom_authors": [],
    "custom_regions": [],
    "author_region_additions": {},
    "discovered_regions": [],
    "discovered_authors": [],
}


@lru_cache(maxsize=1)
def catalog():
    data = json.loads(
        CATALOG_FILE.read_text(encoding="utf-8-sig")
    )
    if not all(key in data for key in ("regions", "authors", "books")):
        raise ValueError("El catálogo no tiene la estructura esperada.")
    return data


def initialize():
    catalog()
    if "atlas_profile" in st.session_state:
        return

    data = copy.deepcopy(DEFAULT_PROFILE)

    if PROFILE_FILE.exists():
        try:
            saved = json.loads(
                PROFILE_FILE.read_text(encoding="utf-8-sig")
            )
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "El historial no es un JSON válido. "
                "No se ha sobrescrito."
            ) from exc

        if not isinstance(saved, dict):
            raise ValueError("El historial debe ser un objeto JSON.")

        data.update(saved)

        backup = ROOT / "reading_progress.backup.json"
        if not backup.exists():
            shutil.copy2(PROFILE_FILE, backup)

    st.session_state.atlas_profile = data


def profile():
    return st.session_state.atlas_profile


def persist():
    temporary = PROFILE_FILE.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(profile(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(PROFILE_FILE)


def regions():
    result = copy.deepcopy(catalog()["regions"])
    for region in profile()["custom_regions"]:
        result[region["id"]] = copy.deepcopy(region)
    return result


def authors():
    result = copy.deepcopy(catalog()["authors"])
    for author in profile()["custom_authors"]:
        result[author["id"]] = copy.deepcopy(author)

    for author_id, additions in profile()["author_region_additions"].items():
        if author_id in result:
            result[author_id]["regions"] = sorted(
                set(result[author_id].get("regions", []) + additions)
            )
    return result


def books():
    metadata = profile().get("book_metadata", {})
    source = catalog()["books"] + profile()["custom_books"]
    return [
        {
            **copy.deepcopy(book),
            **metadata.get(book["id"], {}),
        }
        for book in source
    ]


def book_state(book_id):
    return profile()["book_statuses"].get(book_id, "LOCKED")


def region_state(region_id):
    if region_id in profile()["mastered_regions"]:
        return "MASTERED"

    states = [
        book_state(book["id"])
        for book in books()
        if region_id in book.get("regions", [])
    ]

    if "READ" in states:
        return "READ"
    if "READING" in states:
        return "READING"
    if "DISCOVERED" in states:
        return "DISCOVERED"
    if region_id in profile()["discovered_regions"]:
        return "DISCOVERED"
    return "LOCKED"


def visible_regions():
    return [
        region_id for region_id in regions()
        if region_state(region_id) != "LOCKED"
    ]


def region_authors(region_id):
    return [
        author_id
        for author_id, author in authors().items()
        if region_id in author.get("regions", [])
    ]


def author_state(author_id, region_id=None):
    applicable = [
        book for book in books()
        if book["author"] == author_id
        and (
            region_id is None
            or region_id in book.get("regions", [])
        )
    ]
    states = [book_state(book["id"]) for book in applicable]

    if "READ" in states:
        if author_id in profile()["mastered_authors"]:
            return "MASTERED"
        return "READ"
    if "READING" in states:
        return "READING"
    if "DISCOVERED" in states:
        return "DISCOVERED"
    if author_id in profile()["discovered_authors"]:
        return "DISCOVERED"

    author = authors().get(author_id, {})
    if set(visible_regions()).intersection(author.get("regions", [])):
        return "DISCOVERED"

    return "LOCKED"


def author_tier(region_id, author_id):
    default = authors()[author_id].get("tier", "SPECIALIZED")
    key = f"{region_id}::{author_id}"
    return profile()["tier_overrides"].get(key, default)


def region_stats(region_id):
    ids = region_authors(region_id)
    completed = {
        author_id for author_id in ids
        if author_state(author_id, region_id) in {"READ", "MASTERED"}
    }

    counts = {}
    for tier in TIERS:
        members = [
            author_id for author_id in ids
            if author_tier(region_id, author_id) == tier
        ]
        counts[tier] = {
            "read": len(completed.intersection(members)),
            "total": len(members),
        }

    return {
        "authors": ids,
        "read": len(completed),
        "total": len(ids),
        "rate": len(completed) / len(ids) if ids else 0.0,
        "tiers": counts,
    }


def update_book(book_id, state, metadata):
    if state not in BOOK_STATES:
        raise ValueError("Estado de lectura no válido.")
    profile()["book_statuses"][book_id] = state
    profile()["book_metadata"][book_id] = metadata
    persist()


def set_tier(region_id, author_id, tier):
    if tier not in TIERS:
        raise ValueError("Clasificación no válida.")
    profile()["tier_overrides"][f"{region_id}::{author_id}"] = tier
    persist()


def toggle_mastery(entity_id, entity_type):
    key = "mastered_regions" if entity_type == "region" else "mastered_authors"
    collection = profile()[key]
    if entity_id in collection:
        collection.remove(entity_id)
    else:
        collection.append(entity_id)
    persist()


def discover_region(region_id):
    if region_id not in regions():
        raise ValueError("La región no existe.")
    if region_id not in profile()["discovered_regions"]:
        profile()["discovered_regions"].append(region_id)
        persist()


def discover_author(author_id):
    if author_id not in authors():
        raise ValueError("El autor no existe.")
    if author_id not in profile()["discovered_authors"]:
        profile()["discovered_authors"].append(author_id)
        persist()


def add_region(name, region_type):
    if not name.strip():
        raise ValueError("El nombre de la región es obligatorio.")

    region_id = f"custom-region-{uuid.uuid4().hex[:12]}"
    profile()["custom_regions"].append({
        "id": region_id,
        "name": name.strip(),
        "type": region_type,
        "frontiers": [],
    })
    persist()
    return region_id


def add_book(title, author_name, country, period, movements, region_ids):
    if not title.strip() or not author_name.strip():
        raise ValueError("El título y el autor son obligatorios.")
    if not set(region_ids).issubset(regions()):
        raise ValueError("Una de las regiones seleccionadas no existe.")

    author_id = next(
        (
            key for key, author in authors().items()
            if author["name"].strip().casefold()
            == author_name.strip().casefold()
        ),
        None,
    )

    if author_id is None:
        author_id = f"custom-author-{uuid.uuid4().hex[:12]}"
        profile()["custom_authors"].append({
            "id": author_id,
            "name": author_name.strip(),
            "country": country.strip() or "No especificado",
            "period": period.strip() or "No especificado",
            "movements": movements,
            "tier": "SPECIALIZED",
            "regions": list(region_ids),
            "related": [],
        })
    else:
        additions = profile()["author_region_additions"].get(author_id, [])
        profile()["author_region_additions"][author_id] = sorted(
            set(additions + list(region_ids))
        )

    book_id = f"custom-book-{uuid.uuid4().hex[:12]}"
    profile()["custom_books"].append({
        "id": book_id,
        "title": title.strip(),
        "author": author_id,
        "regions": list(region_ids),
    })
    profile()["book_statuses"][book_id] = "DISCOVERED"
    persist()
    return book_id
