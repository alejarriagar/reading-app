"""Caminos generados automáticamente para los territorios sin camino curado."""
from collections import defaultdict

TIER_ORDER = {"ESSENTIAL": 0, "RECOMMENDED": 1, "SPECIALIZED": 2}
MIN_AUTHORS = 4
MAX_AUTHORS = 14
MAX_WORKS = 4


def _short(name):
    if len(name) <= 16:
        return name
    parts = name.split()
    if len(parts) >= 3 and parts[-2].lower() in {"de", "del", "la", "von", "van", "le", "da", "di"}:
        return " ".join(parts[-2:])
    return parts[-1]


def auto_paths(atlas):
    covered = {path["region_ids"][0] for path in atlas.paths if path.get("region_ids")}

    books_in_region = defaultdict(list)
    for book in atlas.books:
        for region_id in book.get("regions", []):
            books_in_region[(book["author"], region_id)].append(book)

    result = []
    for region_id, region in atlas.regions.items():
        if region_id in covered:
            continue
        author_ids = [
            author_id for author_id, author in atlas.authors.items()
            if region_id in author.get("regions", [])
            and (books_in_region.get((author_id, region_id)) or atlas.books_by_author.get(author_id))
        ]
        if len(author_ids) < MIN_AUTHORS:
            continue
        author_ids.sort(key=lambda aid: (
            TIER_ORDER.get(atlas.tier(region_id, aid), 3),
            -len(atlas.books_by_author.get(aid, [])),
            atlas.authors[aid]["name"],
        ))

        entries = []
        for author_id in author_ids[:MAX_AUTHORS]:
            author = atlas.authors[author_id]
            books = books_in_region.get((author_id, region_id)) or atlas.books_by_author.get(author_id, [])
            books = sorted(books, key=lambda b: (b.get("published") or 9999, b["title"]))[:MAX_WORKS]
            entries.append({
                "id": author_id,
                "name": author["name"],
                "short": _short(author["name"]),
                "tier": atlas.tier(region_id, author_id),
                "country": author.get("country", ""),
                "aliases": [],
                "works": [{"title": b["title"], "year": b.get("published"), "aliases": []} for b in books],
            })

        result.append({
            "id": f"auto-{region_id}",
            "name": region["name"],
            "period": region.get("type", ""),
            "region_ids": [region_id],
            "auto": True,
            "authors": entries,
        })
    return result