"""Sugerencias para la siguiente lectura.

Cada sugerencia explica por qué aparece. Nunca es una obligación:
el usuario puede descartarla o pedir otra.
"""
from collections import defaultdict

TIER_ORDER = {"ESSENTIAL": 0, "RECOMMENDED": 1, "SPECIALIZED": 2}
TIER_BONUS = {"ESSENTIAL": 1.5, "RECOMMENDED": 0.7, "SPECIALIZED": 0.0}
LOVED = 8.0      # nota a partir de la cual un libro cuenta como favorito
DISLIKED = 6.0   # nota media por debajo de la cual no se insiste con un autor


def _fmt(value):
    return f"{value:g}"


def _plural(n, one, many):
    return one if n == 1 else many


def recommend(atlas, regions, limit=12, owned=None):
    authors = atlas.authors
    region_by_id = {r["id"]: r for r in regions}
    dismissed = set(atlas.profile.get("dismissed_recommendations", []))

    ratings = defaultdict(list)
    loved = {}
    for book in atlas.books:
        if book["state"] != "READ":
            continue
        rating = book.get("rating")
        if isinstance(rating, (int, float)):
            ratings[book["author"]].append(rating)
            if rating >= LOVED and rating > loved.get(book["author"], (0, ""))[0]:
                loved[book["author"]] = (rating, book["title"])
    reading_authors = {b["author"] for b in atlas.books if b["state"] == "READING"}

    entry_books = {}
    for path in atlas.paths:
        for entry in atlas.path_status(path):
            first = entry["works"][0] if entry["works"] else None
            if first and first.get("bookId"):
                entry_books.setdefault(first["bookId"], path["name"])

    explored_frontiers = {}
    for region in regions:
        if region["read"] > 0:
            for frontier in region["frontiers"]:
                explored_frontiers.setdefault(frontier, region)

    best = {}
    for book in atlas.books:
        if book["state"] not in ("LOCKED", "DISCOVERED") or book["id"] in dismissed:
            continue
        author_id = book["author"]
        author = authors.get(author_id)
        if not author:
            continue
        scores = ratings.get(author_id)
        if scores and sum(scores) / len(scores) < DISLIKED:
            continue

        score, reasons, kind = 0.0, [], None

        if author_id in loved:
            rating, title = loved[author_id]
            score += 3 + (rating - LOVED)
            reasons.append(f"Te encantó «{title}» ({_fmt(rating)}), del mismo autor")
            kind = "favorite"
        else:
            link = None
            for loved_id, (rating, title) in loved.items():
                other = authors.get(loved_id, {})
                name = other.get("name", "")
                if author_id in other.get("influencedBy", []):
                    text = f"Influyó en {name}, y te encantó «{title}» ({_fmt(rating)})"
                elif loved_id in author.get("influencedBy", []):
                    text = f"Influido por {name}, y te encantó «{title}» ({_fmt(rating)})"
                elif author_id in other.get("related", []) or loved_id in author.get("related", []):
                    text = f"Conectado con {name}, y te encantó «{title}» ({_fmt(rating)})"
                else:
                    continue
                if link is None or rating > link[0]:
                    link = (rating, text)
            if link:
                score += 2 + (link[0] - LOVED) * 0.5
                reasons.append(link[1])
                kind = "favorite"

        book_regions = [region_by_id[r] for r in book.get("regions", []) if r in region_by_id]
        tier = min(
            (atlas.tier(r["id"], author_id) for r in book_regions),
            key=lambda t: TIER_ORDER.get(t, 3),
            default=author.get("tier", "SPECIALIZED"),
        )
        explored = [r for r in book_regions if r["read"] > 0]
        if explored:
            region = max(explored, key=lambda r: r["read"])
            score += 1.0 + min(region["read"], 5) * 0.2
            if tier == "ESSENTIAL":
                reasons.append(
                    f"Esencial en {region['name']}, donde ya has leído "
                    f"{region['read']} {_plural(region['read'], 'autor', 'autores')}"
                )
            else:
                reasons.append(f"Amplía {region['name']} ({round(region['rate'] * 100)}% explorado)")
            kind = kind or "deepen"
        elif book_regions:
            frontier = next((r for r in book_regions if r["id"] in explored_frontiers), None)
            target = frontier or book_regions[0]
            if frontier:
                score += 1.5
                reasons.append(f"Abre un territorio nuevo: {target['name']}, vecino de {explored_frontiers[target['id']]['name']}")
            else:
                score += 0.6
                reasons.append(f"Abre un territorio nuevo: {target['name']}")
            kind = kind or "new"

        score += TIER_BONUS.get(tier, 0.0)
        if tier == "ESSENTIAL" and not explored:
            reasons.append("Considerado esencial en su tradición")
        if book["id"] in entry_books:
            score += 1.0
            reasons.append(f"Puerta de entrada del camino {entry_books[book['id']]}")
        if book["state"] == "DISCOVERED":
            score += 0.5
            reasons.append("Ya la tenías marcada como descubierta")
        home = (owned or {}).get(book["id"])
        if home:
            score += 1.2
            reasons.append(f"Lo tenéis en casa ({home})")
        if author_id in reading_authors:
            score -= 1.5

        if not reasons or score < 1.0:
            continue

        candidate = {
            "bookId": book["id"],
            "authorId": author_id,
            "kind": kind or "new",
            "score": round(score, 2),
            "reasons": reasons[:3],
        }
        current = best.get(author_id)
        if current is None or candidate["score"] > current["score"]:
            best[author_id] = candidate

    ranked = sorted(best.values(), key=lambda c: -c["score"])
    result, recent = [], []
    while ranked and len(result) < limit:
        pick = next((c for c in ranked if c["kind"] not in recent[-2:]), ranked[0])
        ranked.remove(pick)
        result.append(pick)
        recent.append(pick["kind"])
    return result