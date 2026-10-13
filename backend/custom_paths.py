"""Caminos creados o personalizados por los usuarios. Se comparten entre perfiles."""
import uuid

from backend import accounts

TIERS = ("ESSENTIAL", "RECOMMENDED", "SPECIALIZED")
MAX_AUTHORS = 40
MAX_WORKS = 12


def _text(value, limit, field, required=False):
    text = str(value or "").strip()
    if required and not text:
        raise ValueError(f"Falta {field}.")
    if len(text) > limit:
        raise ValueError(f"{field[0].upper() + field[1:]} es demasiado largo.")
    return text


def clean(payload, regions):
    name = _text(payload.get("name"), 80, "el nombre del camino", True)
    description = _text(payload.get("description"), 300, "la descripción")
    region_ids = [r for r in (payload.get("region_ids") or []) if r in regions][:3]
    items = payload.get("authors") or []
    if not items:
        raise ValueError("Añade al menos un autor al camino.")
    if len(items) > MAX_AUTHORS:
        raise ValueError(f"Un camino puede tener como máximo {MAX_AUTHORS} autores.")

    authors, names, ids = [], set(), set()
    for item in items:
        author_name = _text(item.get("name"), 120, "el nombre de un autor", True)
        key = author_name.casefold()
        if key in names:
            raise ValueError(f"{author_name} aparece dos veces en el camino.")
        names.add(key)

        works, titles = [], set()
        for work in (item.get("works") or [])[:MAX_WORKS]:
            title = _text(work.get("title"), 200, "el título de una obra")
            if not title or title.casefold() in titles:
                continue
            titles.add(title.casefold())
            year = work.get("year")
            works.append({
                "title": title,
                "year": year if isinstance(year, int) else None,
                "aliases": [str(a)[:200] for a in (work.get("aliases") or [])][:5],
            })
        if not works:
            raise ValueError(f"Elige al menos una obra de {author_name}.")

        author_id = _text(item.get("id"), 120, "el identificador") or f"a-{uuid.uuid4().hex[:8]}"
        if author_id in ids:
            author_id = f"a-{uuid.uuid4().hex[:8]}"
        ids.add(author_id)

        authors.append({
            "id": author_id,
            "name": author_name,
            "short": _text(item.get("short"), 40, "el nombre corto") or author_name,
            "tier": item.get("tier") if item.get("tier") in TIERS else "RECOMMENDED",
            "country": _text(item.get("country"), 80, "el país"),
            "aliases": [str(a)[:120] for a in (item.get("aliases") or [])][:5],
            "works": works,
        })

    return {"name": name, "description": description, "region_ids": region_ids, "period": "", "authors": authors}


def _me(atlas):
    return getattr(atlas, "user_id", None)


def expand(atlas):
    me = _me(atlas)
    return [{**p, "custom": True, "mine": p.get("ownerId") in (None, me)} for p in accounts.list_shared()]


def create(atlas, payload):
    path = clean(payload, atlas.regions)
    path["id"] = f"mine-{uuid.uuid4().hex[:10]}"
    accounts.add_shared(path, _me(atlas))
    atlas._all_paths = None
    return path["id"]


def update(atlas, path_id, payload):
    path = clean(payload, atlas.regions)
    path["id"] = path_id
    accounts.update_shared(path_id, path, _me(atlas))
    atlas._all_paths = None
    return path_id


def delete(atlas, path_id):
    accounts.delete_shared(path_id, _me(atlas))
    atlas._all_paths = None


def duplicate(atlas, path_id):
    source = next((p for p in atlas.all_paths() if p["id"] == path_id), None)
    if source is None:
        raise KeyError(path_id)
    return create(atlas, {
        "name": f"Mi versión: {source['name']}"[:80],
        "description": source.get("description", ""),
        "region_ids": source.get("region_ids", []),
        "authors": source["authors"],
    })


def migrate_from_profile(atlas):
    """Mueve los caminos propios antiguos (guardados en el perfil) al espacio compartido."""
    for path in atlas.profile.get("custom_paths", []):
        if path.get("id") and path.get("authors"):
            accounts.add_shared(path, _me(atlas))