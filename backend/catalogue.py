import copy
import json
import re
from collections import defaultdict
from contextlib import closing
from datetime import datetime, timezone
from urllib.parse import urlparse

from backend import accounts, genres

AUTHOR_FIELDS = (
    "name", "country", "period", "birth", "death", "image", "movements"
)
BOOK_FIELDS = ("title", "published", "cover", "genre")

SCHEMA = """
CREATE TABLE IF NOT EXISTS catalog_correction (
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    fields TEXT NOT NULL,
    reason TEXT NOT NULL,
    source_url TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (scope, kind, resource_id)
);
CREATE TABLE IF NOT EXISTS catalog_correction_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    before_data TEXT,
    after_data TEXT,
    actor_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    at TEXT NOT NULL
);
"""


def connect():
    conn = accounts.connect()
    conn.executescript(SCHEMA)
    return conn


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def private_scope(atlas):
    return f"user:{getattr(atlas, 'user_id', None) or 'local'}"


def scope_for(atlas, kind, resource_id):
    key = "custom_authors" if kind == "author" else "custom_books"
    private_ids = {item["id"] for item in atlas.profile.get(key, [])}
    return private_scope(atlas) if resource_id in private_ids else "shared"


def _records(atlas):
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT scope, kind, resource_id, fields, reason, source_url, "
            "updated_by, updated_at FROM catalog_correction "
            "WHERE scope IN (?, ?)",
            ("shared", private_scope(atlas)),
        ).fetchall()

    return {
        (r[0], r[1], r[2]): {
            "fields": json.loads(r[3]),
            "reason": r[4],
            "sourceUrl": r[5],
            "updatedBy": r[6],
            "updatedAt": r[7],
        }
        for r in rows
    }


def _record(atlas, kind, resource_id):
    scope = scope_for(atlas, kind, resource_id)
    return atlas._catalog_changes.get((scope, kind, resource_id))


def apply(atlas, authors, books, normalize):
    """Aplica una capa de correcciones sin modificar el catálogo original."""
    atlas._catalog_original_authors = copy.deepcopy(authors)
    atlas._catalog_original_books = {
        book["id"]: copy.deepcopy(book) for book in books
    }
    atlas._catalog_changes = _records(atlas)

    atlas._catalog_original_genres = genres.classify_all(
        list(atlas._catalog_original_books.values()), {}
    )

    for author_id, author in authors.items():
        original = atlas._catalog_original_authors[author_id]
        change = _record(atlas, "author", author_id)

        if change:
            for field, value in change["fields"].items():
                author[field] = copy.deepcopy(value)

        author["_catalog_names"] = list(dict.fromkeys(
            [author["name"], original["name"]]
        ))

    for book in books:
        original = atlas._catalog_original_books[book["id"]]
        change = _record(atlas, "book", book["id"])

        if change:
            for field, value in change["fields"].items():
                if field == "genre":
                    book["catalogGenre"] = value
                elif field != "cover":
                    book[field] = copy.deepcopy(value)

        book["_catalog_titles"] = list(dict.fromkeys(
            [book["title"], original["title"]]
        ))
        book["catalogSeedTitle"] = original["title"]

    # Mantener portadas al corregir títulos o nombres.
    atlas._cover_lookup = dict(atlas.covers)

    for book in books:
        original = atlas._catalog_original_books[book["id"]]
        author_id = book["author"]
        original_author = atlas._catalog_original_authors.get(author_id, {})
        current_author = authors.get(author_id, {})

        original_key = (
            f"{normalize(original['title'])}|"
            f"{normalize(original_author.get('name', ''))}"
        )

        change = _record(atlas, "book", book["id"])
        if change and "cover" in change["fields"]:
            cover = change["fields"]["cover"]
        else:
            cover = atlas.covers.get(original_key)

        for title in book["_catalog_titles"]:
            names = current_author.get(
                "_catalog_names", [current_author.get("name", "")]
            )
            for name in names:
                atlas._cover_lookup[
                    f"{normalize(title)}|{normalize(name)}"
                ] = cover


def info(atlas, kind, resource_id):
    scope = scope_for(atlas, kind, resource_id)
    change = _record(atlas, kind, resource_id)
    wiki = atlas.wikidata or {}

    if scope != "shared":
        origin = "Añadido en este perfil"
        fetched = None
    elif kind == "author":
        is_wiki = (
            resource_id in wiki.get("authors", {})
            or resource_id in wiki.get("enrich", {})
        )
        origin = "Catálogo y Wikidata" if is_wiki else "Catálogo manual"
        fetched = wiki.get("generatedAt") if is_wiki else None
    else:
        is_wiki = any(
            book["id"] == resource_id
            for book in wiki.get("books", [])
        )
        origin = "Wikidata" if is_wiki else "Catálogo manual"
        fetched = wiki.get("generatedAt") if is_wiki else None

    names = {user["id"]: user["name"] for user in accounts.list_users()}

    return {
        "scope": scope,
        "scopeLabel": "Compartido" if scope == "shared" else "Solo este perfil",
        "origin": origin,
        "fetchedAt": fetched,
        "corrected": bool(change),
        "editedFields": list(change["fields"]) if change else [],
        "reason": change["reason"] if change else "",
        "sourceUrl": change["sourceUrl"] if change else "",
        "updatedAt": change["updatedAt"] if change else None,
        "updatedBy": names.get(change["updatedBy"]) if change else None,
    }


def _fields(atlas, kind, resource_id, original=False):
    if kind == "author":
        source = (
            atlas._catalog_original_authors
            if original else atlas.authors
        )
        if resource_id not in source:
            raise KeyError(resource_id)

        author = source[resource_id]
        return {
            "name": author["name"],
            "country": author.get("country") or "",
            "period": author.get("period") or "",
            "birth": author.get("birth"),
            "death": author.get("death"),
            "image": author.get("image") or "",
            "movements": author.get("movements") or [],
        }

    if kind != "book":
        raise KeyError(kind)

    source = (
        atlas._catalog_original_books
        if original else atlas.books_by_id
    )
    if resource_id not in source:
        raise KeyError(resource_id)

    book = source[resource_id]

    if original:
        author = atlas._catalog_original_authors.get(book["author"], {})
        cover = atlas.covers.get(
            f"{_normalize(book['title'])}|{_normalize(author.get('name', ''))}"
        )
        genre = atlas._catalog_original_genres.get(resource_id, {}).get("genre")
    else:
        author = atlas.authors.get(book["author"], {})
        cover = atlas.cover_for(book["title"], author.get("name", ""))
        genre = genres.classify_all(atlas.books, {}).get(resource_id, {}).get("genre")

    return {
        "title": book["title"],
        "published": book.get("published"),
        "cover": cover or "",
        "genre": genre,
    }


def _normalize(value):
    # Misma normalización utilizada por el catálogo.
    from backend.atlas import norm
    return norm(value)


def detail(atlas, user, kind, resource_id):
    current = _fields(atlas, kind, resource_id)
    original = _fields(atlas, kind, resource_id, original=True)
    metadata = info(atlas, kind, resource_id)

    return {
        "kind": kind,
        "id": resource_id,
        "current": current,
        "original": original,
        "info": metadata,
        "canEdit": metadata["scope"] != "shared" or bool(user.get("isOwner")),
        "qid": (
            atlas.authors[resource_id].get("qid")
            if kind == "author" else None
        ),
    }


def _text(value, max_length, required=False):
    value = str(value or "").strip()
    if required and not value:
        raise ValueError("El nombre o título no puede estar vacío.")
    if len(value) > max_length:
        raise ValueError("Uno de los textos es demasiado largo.")
    return value


def _year(value):
    if value in (None, ""):
        return None

    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("Los años deben ser números enteros.")

    if value == 0 or not -5000 <= value <= 2200:
        raise ValueError("Año fuera de rango. Para antes de Cristo usa un número negativo.")

    return value


def _url(value):
    value = _text(value, 1500)
    if not value:
        return ""

    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Las direcciones deben empezar por https://.")

    return value


def _clean(kind, fields):
    allowed = AUTHOR_FIELDS if kind == "author" else BOOK_FIELDS
    if len(fields) > len(allowed) or set(fields) - set(allowed):
        raise ValueError("Se ha enviado un campo no editable.")

    result = {}
    for key, value in fields.items():
        if key in ("birth", "death", "published"):
            result[key] = _year(value)
        elif key in ("image", "cover"):
            result[key] = _url(value)
        elif key == "genre":
            if value not in (None, "") and value not in genres.GENRES:
                raise ValueError("Tipo de obra no válido.")
            result[key] = value or None
        elif key == "movements":
            if not isinstance(value, list) or len(value) > 30:
                raise ValueError("Las corrientes deben ser una lista de hasta 30 elementos.")
            result[key] = list(dict.fromkeys(
                _text(item, 120) for item in value if str(item).strip()
            ))
        else:
            result[key] = _text(
                value, 300 if key in ("name", "title") else 200,
                required=key in ("name", "title"),
            )

    return result


def _authorize(atlas, user, kind, resource_id):
    detail_data = detail(atlas, user, kind, resource_id)
    if not detail_data["canEdit"]:
        raise PermissionError(
            "Solo el perfil principal puede corregir el catálogo compartido."
        )

    if getattr(atlas, "user_id", None) != user["id"]:
        raise PermissionError("El perfil activo no coincide.")

    return detail_data


def _current_row(conn, scope, kind, resource_id):
    return conn.execute(
        "SELECT fields, updated_at FROM catalog_correction "
        "WHERE scope = ? AND kind = ? AND resource_id = ?",
        (scope, kind, resource_id),
    ).fetchone()


def _check_version(row, expected_version):
    actual = row[1] if row else None
    if actual != expected_version:
        raise ValueError(
            "Los datos han cambiado en otra ventana. Cierra y vuelve a abrir el editor."
        )


def save(atlas, user, kind, resource_id, fields, reason, source_url, expected_version):
    data = _authorize(atlas, user, kind, resource_id)
    fields = _clean(kind, fields)
    reason = _text(reason, 500, required=True)
    source_url = _url(source_url)

    combined = {**data["current"], **fields}
    if kind == "author":
        birth, death = combined.get("birth"), combined.get("death")
        if birth is not None and death is not None and death < birth:
            raise ValueError("El fallecimiento no puede ser anterior al nacimiento.")

    scope = data["info"]["scope"]

    with closing(connect()) as conn:
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            row = _current_row(conn, scope, kind, resource_id)
            _check_version(row, expected_version)

            previous = json.loads(row[0]) if row else {}
            updated = {**previous, **fields}

            if not updated:
                raise ValueError("No hay campos corregidos que guardar.")

            timestamp = now()

            conn.execute(
                "INSERT INTO catalog_correction "
                "(scope, kind, resource_id, fields, reason, source_url, updated_by, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(scope, kind, resource_id) DO UPDATE SET "
                "fields = excluded.fields, reason = excluded.reason, "
                "source_url = excluded.source_url, updated_by = excluded.updated_by, "
                "updated_at = excluded.updated_at",
                (
                    scope, kind, resource_id,
                    json.dumps(updated, ensure_ascii=False),
                    reason, source_url, user["id"], timestamp,
                ),
            )

            conn.execute(
                "INSERT INTO catalog_correction_event "
                "(scope, kind, resource_id, before_data, after_data, actor_id, reason, at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    scope, kind, resource_id,
                    json.dumps(previous, ensure_ascii=False),
                    json.dumps(updated, ensure_ascii=False),
                    user["id"], reason, timestamp,
                ),
            )

    atlas._index()


def reset(atlas, user, kind, resource_id, expected_version):
    data = _authorize(atlas, user, kind, resource_id)
    scope = data["info"]["scope"]

    with closing(connect()) as conn:
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            row = _current_row(conn, scope, kind, resource_id)
            _check_version(row, expected_version)

            if row is None:
                return

            conn.execute(
                "DELETE FROM catalog_correction "
                "WHERE scope = ? AND kind = ? AND resource_id = ?",
                (scope, kind, resource_id),
            )

            conn.execute(
                "INSERT INTO catalog_correction_event "
                "(scope, kind, resource_id, before_data, after_data, actor_id, reason, at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    scope, kind, resource_id,
                    row[0], None, user["id"],
                    "Restaurar datos importados", now(),
                ),
            )

    atlas._index()


def review(atlas):
    groups = []
    seen = set()

    def add(kind, reason, ids):
        ids = sorted(set(ids))
        key = (kind, tuple(ids))
        if len(ids) < 2 or key in seen:
            return
        seen.add(key)

        if kind == "author":
            records = [
                {
                    "id": aid,
                    "name": atlas.authors[aid]["name"],
                    "state": atlas.author_state(aid),
                    "origin": info(atlas, kind, aid)["origin"],
                }
                for aid in ids
            ]
        else:
            records = [
                {
                    "id": bid,
                    "name": atlas.books_by_id[bid]["title"],
                    "state": atlas.books_by_id[bid]["state"],
                    "origin": info(atlas, kind, bid)["origin"],
                }
                for bid in ids
            ]

        groups.append({"kind": kind, "reason": reason, "records": records})

    names, qids, titles = defaultdict(list), defaultdict(list), defaultdict(list)

    for aid, author in atlas.authors.items():
        names[_normalize(author["name"])].append(aid)
        if author.get("qid"):
            qids[author["qid"]].append(aid)

    for name, ids in names.items():
        add("author", "Nombres equivalentes al normalizarlos", ids)

    for identifier, ids in qids.items():
        add("author", f"Mismo identificador {identifier}; revisar la identificación", ids)

    for book in atlas.books:
        author_name = atlas.authors.get(book["author"], {}).get("name", "")
        titles[(_normalize(book["title"]), _normalize(author_name))].append(book["id"])

    for key, ids in titles.items():
        add("book", "Mismo título y nombre de autor", ids)

    return {"groups": groups}
