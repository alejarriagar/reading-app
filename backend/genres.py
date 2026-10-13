"""Tipo de cada obra: novela, relatos, poesía, teatro o ensayo y no ficción.

Prioridad: elección del usuario > Wikidata > clasificación de partida > deducción.
"""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

GENRES = ("NOVELA", "RELATO", "POESIA", "TEATRO", "ENSAYO")
THOUGHT_REGIONS = {"philosophy", "social_sciences", "science_essay"}
SEEDS_FILE = Path(__file__).resolve().parents[1] / "assets" / "genres.json"


def _norm(value):
    value = re.sub(r"\(.*?\)", " ", str(value or ""))
    value = unicodedata.normalize("NFD", value.casefold())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


@lru_cache(maxsize=1)
def load_seeds():
    if not SEEDS_FILE.exists():
        return {}
    data = json.loads(SEEDS_FILE.read_text(encoding="utf-8-sig"))
    seeds = {}
    for genre in GENRES:
        for title in data.get(genre, []):
            seeds[_norm(title)] = genre
    return seeds


def classify_all(books, metadata):
    seeds = load_seeds()
    direct = {}
    for book in books:
        user = (metadata.get(book["id"]) or {}).get("genre")
        if user in GENRES:
            direct[book["id"]] = (user, "user")
        elif book.get("wdGenre") in GENRES:
            direct[book["id"]] = (book["wdGenre"], "catalog")
        elif seeds.get(_norm(book["title"])) in GENRES:
            direct[book["id"]] = (seeds[_norm(book["title"])], "catalog")
        elif THOUGHT_REGIONS & set(book.get("regions", [])):
            direct[book["id"]] = ("ENSAYO", "inferred")

    by_author = defaultdict(Counter)
    for book in books:
        found = direct.get(book["id"])
        if found and found[1] != "inferred":
            by_author[book["author"]][found[0]] += 1

    result = {}
    for book in books:
        genre, source = direct.get(book["id"], (None, None))
        if genre is None:
            counts = by_author.get(book["author"])
            if counts:
                top, n = counts.most_common(1)[0]
                if n >= 2 and n / sum(counts.values()) >= 0.8:
                    genre, source = top, "inferred"
        result[book["id"]] = {"genre": genre, "genreSource": source}
    return result