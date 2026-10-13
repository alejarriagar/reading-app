import copy
import json
import os
import re
import shutil
import unicodedata
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from backend import store
from backend.geo import world_summary
from backend.recommend import recommend
from backend.paths_auto import auto_paths
from backend import custom_paths
from backend import genres
from backend import library
from backend import readings
from backend import catalogue

ROOT = Path(__file__).resolve().parents[1]
CATALOG_FILE = ROOT / "assets" / "catalog.json"
PATHS_FILE = ROOT / "assets" / "paths.json"
WIKIDATA_FILE = ROOT / "assets" / "wikidata.json"
PROFILE_FILE = ROOT / "reading_progress.json"
BACKUP_FILE = ROOT / "reading_progress.backup.json"

BOOK_STATES = ["LOCKED", "DISCOVERED", "READING", "READ"]
TIERS = ["ESSENTIAL", "RECOMMENDED", "SPECIALIZED"]
RANK = {state: index for index, state in enumerate(BOOK_STATES)}

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


def norm(value):
    value = re.sub(r"\(.*?\)", " ", str(value))
    value = unicodedata.normalize("NFD", value.casefold())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def best_state(states):
    return max(states, key=lambda state: RANK.get(state, 0), default="LOCKED")


class Atlas:
    def __init__(self, user_id=None):
        self.user_id = user_id
        if not CATALOG_FILE.exists():
            raise RuntimeError("Falta assets/catalog.json.")
        self.catalog = read_json(CATALOG_FILE)
        self.paths = read_json(PATHS_FILE).get("paths", []) if PATHS_FILE.exists() else []
        self.wikidata = read_json(WIKIDATA_FILE) if WIKIDATA_FILE.exists() else {}

        self.profile = store.load_profile(DEFAULT_PROFILE)
        self._before = copy.deepcopy(self.profile)
        self.label = "Cambio"
        self.state_since = store.state_timestamps()
        self.tracking_since = store.get_meta("created_at")
        self._index()
        if readings.initialize(self.profile):
            self.label = "Preparar historial de lecturas"
            self.save()
            self.label = "Cambio"

    # ------------------------------------------------------------------
    def _index(self):
        profile = self.profile
        self._all_paths = None

        regions = copy.deepcopy(self.catalog["regions"])
        for region in profile["custom_regions"]:
            regions[region["id"]] = copy.deepcopy(region)

        authors = copy.deepcopy(self.catalog["authors"])
        for author in profile["custom_authors"]:
            authors[author["id"]] = copy.deepcopy(author)
        wiki = self.wikidata or {}
        self.covers = wiki.get("covers", {})
        for author_id, author in wiki.get("authors", {}).items():
            if author_id not in authors:
                authors[author_id] = copy.deepcopy(author)
        for author_id, info in wiki.get("enrich", {}).items():
            if author_id not in authors:
                continue
            target = authors[author_id]
            for key in ("qid", "birth", "death", "image", "influencedBy"):
                if info.get(key) is not None:
                    target[key] = info[key]
            target["movements"] = list(dict.fromkeys(target.get("movements", []) + info.get("movements", [])))
            target["regions"] = sorted(set(target.get("regions", []) + [r for r in info.get("regions", []) if r in regions]))
        for author_id, extra in profile["author_region_additions"].items():
            if author_id in authors:
                authors[author_id]["regions"] = sorted(
                    set(authors[author_id].get("regions", []) + extra)
                )

        metadata = profile.get("book_metadata", {})
        books = []
        for book in self.catalog["books"] + wiki.get("books", []) + profile["custom_books"]:
            merged = {**copy.deepcopy(book), **metadata.get(book["id"], {})}
            merged["state"] = profile["book_statuses"].get(book["id"], "LOCKED")
            books.append(merged)

        catalogue.apply(self, authors, books, norm)
        self.regions = regions
        self.authors = authors
        self.books = books
        self.books_by_id = {book["id"]: book for book in books}
        self.books_by_author = defaultdict(list)
        for book in books:
            self.books_by_author[book["author"]].append(book)

        self._library = [
            {
                "id": book["id"],
                "title": book["title"],
                "title_key": norm(book["title"]),
                "title_keys": {norm(t) for t in book.get("_catalog_titles", [book["title"]])},
                "author_key": norm(authors.get(book["author"], {}).get("name", "")),
                "author_keys": {norm(n) for n in authors.get(book["author"], {}).get("_catalog_names", [])},
                "state": book["state"],
            }
            for book in books
        ]

    def save(self):
        store.save_profile(self.profile, self._before, self.label)
        self.state_since = store.state_timestamps()
        self._before = copy.deepcopy(self.profile)
        self._index()

    # ------------------------------------------------------------------
    def all_paths(self):
        if getattr(self, "_all_paths", None) is None:
            self._all_paths = self.paths + custom_paths.expand(self) + auto_paths(self)
        return self._all_paths

    def cover_for(self, title, author_name):
        return self._cover_lookup.get(f"{norm(title)}|{norm(author_name)}") or None

    def region_state(self, region_id):
        if region_id in self.profile["mastered_regions"]:
            return "MASTERED"
        states = [b["state"] for b in self.books if region_id in b.get("regions", [])]
        for state in ("READ", "READING", "DISCOVERED"):
            if state in states:
                return state
        if region_id in self.profile["discovered_regions"]:
            return "DISCOVERED"
        return "LOCKED"

    def author_state(self, author_id, region_id=None):
        states = [
            b["state"] for b in self.books_by_author.get(author_id, [])
            if region_id is None or region_id in b.get("regions", [])
        ]
        if "READ" in states:
            return "MASTERED" if author_id in self.profile["mastered_authors"] else "READ"
        if "READING" in states:
            return "READING"
        if "DISCOVERED" in states or author_id in self.profile["discovered_authors"]:
            return "DISCOVERED"
        return "LOCKED"

    def tier(self, region_id, author_id):
        default = self.authors[author_id].get("tier", "SPECIALIZED")
        return self.profile["tier_overrides"].get(f"{region_id}::{author_id}", default)

    def region_summary(self, region_id):
        region = self.regions[region_id]
        entries = [
            {
                "id": author_id,
                "tier": self.tier(region_id, author_id),
                "state": self.author_state(author_id, region_id),
            }
            for author_id, author in self.authors.items()
            if region_id in author.get("regions", [])
        ]
        entries.sort(key=lambda e: (TIERS.index(e["tier"]), self.authors[e["id"]]["name"]))
        done = [e for e in entries if e["state"] in ("READ", "MASTERED")]
        tiers = {
            tier: {
                "read": sum(1 for e in done if e["tier"] == tier),
                "total": sum(1 for e in entries if e["tier"] == tier),
            }
            for tier in TIERS
        }
        return {
            "id": region_id,
            "name": region["name"],
            "type": region.get("type", ""),
            "state": self.region_state(region_id),
            "read": len(done),
            "total": len(entries),
            "rate": len(done) / len(entries) if entries else 0.0,
            "tiers": tiers,
            "authors": entries,
            "works": sum(1 for b in self.books if region_id in b.get("regions", [])),
            "frontiers": [f for f in region.get("frontiers", []) if f in self.regions],
        }

    def path_status(self, path):
        result = []
        for author in path.get("authors", []):
            keys = {norm(n) for n in [author["name"], *author.get("aliases", [])]}
            own = [row for row in self._library if row["author_keys"].intersection(keys)]
            matched = set()
            works = []
            for work in author.get("works", []):
                titles = {norm(t) for t in [work["title"], *work.get("aliases", [])]}
                matches = [row for row in own if row["title_keys"].intersection(titles)]
                matched.update(row["id"] for row in matches)
                best = max(matches, key=lambda row: RANK.get(row["state"], 0), default=None)
                works.append({
                    "title": work["title"],
                    "year": work.get("year"),
                    "aliases": work.get("aliases", []),
                    "state": best["state"] if best else "LOCKED",
                    "bookId": best["id"] if best else None,
                    "cover": self.cover_for(work["title"], author["name"]),
                })
            result.append({
                "id": author["id"],
                "name": author["name"],
                "short": author.get("short") or author["name"],
                "tier": author.get("tier", "SPECIALIZED"),
                "country": author.get("country", ""),
                "aliases": author.get("aliases", []),
                "state": best_state([r["state"] for r in own] + [w["state"] for w in works]),
                "otherRead": [r["title"] for r in own if r["id"] not in matched and r["state"] == "READ"],
                "works": works,
            })
        return result

    def snapshot(self):
        mastered_authors = set(self.profile["mastered_authors"])
        reading_index = readings.index(self.profile)
        genre_index = genres.classify_all(self.books, self.profile["book_metadata"])
        books = []
        for b in self.books:
            books.append({
                "id": b["id"],
                "title": b["title"],
                "author": b["author"],
                "authorName": self.authors.get(b["author"], {}).get("name", "Autor desconocido"),
                "state": b["state"],
                "year": b.get("year"),
                "rating": b.get("rating"),
                "reread": bool(b.get("reread")),
                "notes": b.get("notes") or "",
                "published": b.get("published"),
                "stateSince": self.state_since.get(b["id"]),
                "catalogInfo": catalogue.info(self, "book", b["id"]),
                **readings.fields(reading_index.get(b["id"], [])),
                **genre_index.get(b["id"], {"genre": None, "genreSource": None}),
                "cover": self.cover_for(b["title"], self.authors.get(b["author"], {}).get("name", "")),
                "regions": [r for r in b.get("regions", []) if r in self.regions],
            })

        influenced = defaultdict(set)
        for source_id, source in self.authors.items():
            for target_id in source.get("influencedBy", []):
                if target_id in self.authors:
                    influenced[target_id].add(source_id)

        authors = {
            author_id: {
                "id": author_id,
                "name": a["name"],
                "country": a.get("country", ""),
                "period": a.get("period", ""),
                "movements": a.get("movements", []),
                "regions": [r for r in a.get("regions", []) if r in self.regions],
                "related": [r for r in a.get("related", []) if r in self.authors],
                "state": self.author_state(author_id),
                "mastered": author_id in mastered_authors,
                "catalogInfo": catalogue.info(self, "author", author_id),
                "qid": a.get("qid"),
                "birth": a.get("birth"),
                "death": a.get("death"),
                "image": a.get("image"),
                "influencedBy": [i for i in a.get("influencedBy", []) if i in self.authors],
                "influenced": sorted(influenced.get(author_id, [])),
            }
            for author_id, a in self.authors.items()
        }

        regions = [self.region_summary(region_id) for region_id in self.regions]
        read = [b for b in books if b["state"] == "READ"]
        ratings = [b["rating"] for b in read if b["rating"] is not None]
        by_year = readings.finished_by_year(self.profile, read)
        shelf = library.shelf_for(self)
        shelf_owned = {
            book_id: " y ".join(sorted({c["houseName"] for c in items if c["houseName"]}))
            for book_id, items in shelf["byBook"].items()
        }

        return {
            "summary": {
                "booksRead": len(read),
                "reading": sum(1 for b in books if b["state"] == "READING"),
                "authorsRead": len({b["author"] for b in read}),
                "regionsUnlocked": sum(1 for r in regions if r["state"] != "LOCKED"),
                "regionsTotal": len(regions),
                "averageRating": sum(ratings) / len(ratings) if ratings else None,
                "byYear": dict(by_year),
                "trackingSince": self.tracking_since,
                "finishedThisYear": by_year.get(str(datetime.now().year), 0),
            },
            "regions": regions,
            "authors": authors,
            "books": books,
            "world": world_summary(self.authors, self.author_state, self.books_by_author),
            "recommendations": recommend(self, regions, owned=shelf_owned),
            "shelf": shelf,
            "paths": [
                {"id": p["id"], "name": p["name"], "period": p.get("period", ""), "auto": bool(p.get("auto")),
                 "custom": bool(p.get("custom")), "description": p.get("description", ""),
                 "mine": bool(p.get("mine")), "ownerName": p.get("ownerName"),
                 "regionIds": p.get("region_ids", []), "authors": self.path_status(p)}
                for p in self.all_paths()
            ],
        }

    # ------------------------------------------------------------------
    def update_book(self, book_id, state, year, rating, reread, notes, reading_items=None, genre=None):
        if book_id not in self.books_by_id:
            raise KeyError(book_id)
        if state not in BOOK_STATES:
            raise ValueError("Estado no válido.")
        if genre not in (None, "") and genre not in genres.GENRES:
            raise ValueError("Tipo de obra no válido.")
        previous_genre = self.profile["book_metadata"].get(book_id, {}).get("genre")
        old_state = self.profile["book_statuses"].get(book_id, "LOCKED")
        if reading_items is not None:
            readings.replace(self.profile, book_id, reading_items)
        readings.apply_state(self.profile, book_id, old_state, state)
        self.profile["book_statuses"][book_id] = state
        self.profile["book_metadata"][book_id] = {
            "year": readings.latest_year(self.profile, book_id) or year,
            "rating": rating,
            "reread": readings.is_reread(self.profile, book_id) or bool(reread),
            "notes": notes or "",
            "genre": previous_genre if genre is None else (genre or None),
        }
        self.save()

    def start_reread(self, book_id):
        if book_id not in self.books_by_id:
            raise KeyError(book_id)
        readings.start_reread(self.profile, book_id)
        self.profile["book_statuses"][book_id] = "READING"
        metadata = dict(self.profile["book_metadata"].get(book_id, {}))
        metadata["reread"] = True
        self.profile["book_metadata"][book_id] = metadata
        self.save()

    def add_book(self, title, author_name, country="", period="", movements=None,
                 region_ids=None, state="DISCOVERED", save=True):
        title = (title or "").strip()
        author_name = (author_name or "").strip()
        if not title or not author_name:
            raise ValueError("El título y el autor son obligatorios.")
        if state not in BOOK_STATES:
            raise ValueError("Estado no válido.")

        region_ids = list(dict.fromkeys(region_ids or []))
        unknown = [r for r in region_ids if r not in self.regions]
        if unknown:
            raise ValueError(f"Territorios desconocidos: {unknown}")

        title_key, author_key = norm(title), norm(author_name)
        if any(title_key in r["title_keys"] and author_key in r["author_keys"] for r in self._library):
            raise ValueError("Esa obra ya está en tu biblioteca.")

        movements = [m.strip() for m in (movements or []) if m and m.strip()]
        author_id = next(
            (aid for aid, a in self.authors.items() if author_key in {norm(n) for n in a.get("_catalog_names", [a["name"]])}),
            None,
        )

        if author_id is None:
            author_id = f"custom-author-{uuid.uuid4().hex[:12]}"
            self.profile["custom_authors"].append({
                "id": author_id,
                "name": author_name,
                "country": (country or "").strip() or "No especificado",
                "period": (period or "").strip() or "No especificado",
                "movements": movements,
                "tier": "SPECIALIZED",
                "regions": region_ids,
                "related": [],
            })
        else:
            extra = self.profile["author_region_additions"].get(author_id, [])
            self.profile["author_region_additions"][author_id] = sorted(set(extra + region_ids))
            for custom in self.profile["custom_authors"]:
                if custom["id"] == author_id:
                    custom["regions"] = sorted(set(custom.get("regions", []) + region_ids))

        book_id = f"custom-book-{uuid.uuid4().hex[:12]}"
        self.profile["custom_books"].append({
            "id": book_id,
            "title": title,
            "author": author_id,
            "regions": region_ids,
        })
        self.profile["book_statuses"][book_id] = state
        readings.apply_state(self.profile, book_id, "LOCKED", state)
        if state == "READ":
            self.profile["book_metadata"][book_id] = {
                "year": datetime.now().year, "rating": None, "reread": False, "notes": "",
            }
        if save:
            self.save()
        return book_id

    def set_tier(self, region_id, author_id, tier):
        if region_id not in self.regions:
            raise KeyError(region_id)
        if author_id not in self.authors:
            raise KeyError(author_id)
        if tier not in TIERS:
            raise ValueError("Clasificación no válida.")
        self.profile["tier_overrides"][f"{region_id}::{author_id}"] = tier
        self.save()

    def toggle_region_mastery(self, region_id):
        if region_id not in self.regions:
            raise KeyError(region_id)
        mastered = self.profile["mastered_regions"]
        if region_id in mastered:
            mastered.remove(region_id)
        else:
            mastered.append(region_id)
        self.save()

    def discover_region(self, region_id):
        if region_id not in self.regions:
            raise KeyError(region_id)
        if region_id not in self.profile["discovered_regions"]:
            self.profile["discovered_regions"].append(region_id)
            self.save()

    def set_path_work(self, path_id, author_id, work_index, state):
        if state not in BOOK_STATES:
            raise ValueError("Estado no válido.")
        path = next((p for p in self.all_paths() if p["id"] == path_id), None)
        if path is None:
            raise KeyError(path_id)
        author = next((a for a in self.path_status(path) if a["id"] == author_id), None)
        if author is None or not 0 <= work_index < len(author["works"]):
            raise KeyError(author_id)

        work = author["works"][work_index]
        book_id = work["bookId"]

        if book_id is None:
            if state == "LOCKED":
                return
            keys = {norm(n) for n in [author["name"], *author.get("aliases", [])]}
            existing = next(
                (a["name"] for a in self.authors.values() if {norm(n) for n in a.get("_catalog_names", [a["name"]])}.intersection(keys)),
                author["name"],
            )
            region_ids = [r for r in path.get("region_ids", []) if r in self.regions]
            book_id = self.add_book(
                work["title"], existing, author.get("country", ""),
                path.get("period", ""), [], region_ids, "DISCOVERED", save=False,
            )

        metadata = dict(self.profile["book_metadata"].get(book_id, {}))
        readings.apply_state(self.profile, book_id, self.profile["book_statuses"].get(book_id, "LOCKED"), state)
        metadata["year"] = readings.latest_year(self.profile, book_id) or metadata.get("year")
        self.profile["book_statuses"][book_id] = state
        self.profile["book_metadata"][book_id] = metadata
        self.save()