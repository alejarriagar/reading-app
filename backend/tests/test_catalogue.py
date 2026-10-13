import json

import pytest

from backend import accounts, catalogue, store
from backend import atlas as atlas_module
from backend.atlas import Atlas


@pytest.fixture
def catalog_env(tmp_path, monkeypatch):
    catalog = {
        "regions": {
            "r1": {"name": "Prueba", "type": "País", "frontiers": []}
        },
        "authors": {
            "a1": {
                "name": "Nombre Original",
                "country": "España",
                "period": "Siglo XX",
                "regions": ["r1"],
                "tier": "ESSENTIAL",
                "movements": [],
                "related": [],
            }
        },
        "books": [
            {
                "id": "b1",
                "title": "Título Original",
                "author": "a1",
                "regions": ["r1"],
                "wdGenre": "NOVELA",
            }
        ],
    }

    paths = {"paths": [{
        "id": "p1",
        "name": "Prueba",
        "region_ids": ["r1"],
        "authors": [{
            "id": "a1",
            "name": "Nombre Original",
            "short": "Original",
            "tier": "ESSENTIAL",
            "country": "España",
            "aliases": [],
            "works": [{"title": "Título Original", "year": None, "aliases": []}],
        }],
    }]}

    (tmp_path / "catalog.json").write_text(json.dumps(catalog), encoding="utf-8")
    (tmp_path / "paths.json").write_text(json.dumps(paths), encoding="utf-8")

    monkeypatch.setattr(atlas_module, "CATALOG_FILE", tmp_path / "catalog.json")
    monkeypatch.setattr(atlas_module, "PATHS_FILE", tmp_path / "paths.json")
    monkeypatch.setattr(atlas_module, "WIKIDATA_FILE", tmp_path / "none.json")

    monkeypatch.setattr(store, "DB_FILE", tmp_path / "atlas.db")
    monkeypatch.setattr(store, "LEGACY_FILE", tmp_path / "legacy.json")
    monkeypatch.setattr(store, "BACKUP_DIR", tmp_path / "backups")

    monkeypatch.setattr(accounts, "ACCOUNTS_FILE", tmp_path / "accounts.db")
    monkeypatch.setattr(accounts, "_FAILURES", {})

    owner = accounts.create_user("Principal", "clave123", is_owner=True)
    other = accounts.create_user("Otro", "clave456")
    return tmp_path, owner, other


def test_corregir_conserva_lecturas_y_caminos(catalog_env):
    _, owner, _ = catalog_env
    atlas = Atlas(user_id=owner["id"])
    atlas.update_book("b1", "READ", 2025, 8.0, False, "Nota privada")

    events_before = len(store.history())

    catalogue.save(
        Atlas(user_id=owner["id"]), owner, "author", "a1",
        {"name": "Nombre Corregido"}, "Corregir nombre", "", None,
    )
    catalogue.save(
        Atlas(user_id=owner["id"]), owner, "book", "b1",
        {"title": "Título Corregido", "genre": "ENSAYO"},
        "Corregir ficha", "", None,
    )

    current = Atlas(user_id=owner["id"])
    snapshot = current.snapshot()
    book = next(b for b in snapshot["books"] if b["id"] == "b1")

    assert book["state"] == "READ"
    assert book["notes"] == "Nota privada"
    assert book["rating"] == 8.0
    assert book["genre"] == "ENSAYO"
    assert snapshot["paths"][0]["authors"][0]["works"][0]["state"] == "READ"
    assert len(store.history()) == events_before

    from backend.library import match_books
    assert match_books(
        [{"id": "copy", "title": "Título Original", "author": "Nombre Original"}],
        current,
    )["copy"] == "b1"


def test_permisos_y_restauracion(catalog_env):
    _, owner, other = catalog_env

    with pytest.raises(PermissionError):
        catalogue.save(
            Atlas(user_id=other["id"]), other, "author", "a1",
            {"country": "Francia"}, "Prueba", "", None,
        )

    catalogue.save(
        Atlas(user_id=owner["id"]), owner, "book", "b1",
        {"cover": "https://example.org/cover.jpg"},
        "Portada correcta", "", None,
    )

    atlas = Atlas(user_id=owner["id"])
    entry = catalogue.detail(atlas, owner, "book", "b1")
    assert entry["info"]["corrected"]
    assert entry["current"]["cover"] == "https://example.org/cover.jpg"

    catalogue.reset(
        atlas, owner, "book", "b1", entry["info"]["updatedAt"]
    )
    restored = Atlas(user_id=owner["id"])
    assert not catalogue.info(restored, "book", "b1")["corrected"]


def test_correcciones_personales_no_se_comparten(catalog_env):
    _, owner, other = catalog_env

    atlas = Atlas(user_id=owner["id"])
    book_id = atlas.add_book("Libro Personal", "Autor Personal")

    catalogue.save(
        Atlas(user_id=owner["id"]), owner, "book", book_id,
        {"title": "Mi Título"}, "Corrección personal", "", None,
    )

    mine = Atlas(user_id=owner["id"])
    another_scope = Atlas(user_id=other["id"])

    assert mine.books_by_id[book_id]["title"] == "Mi Título"
    assert another_scope.books_by_id[book_id]["title"] == "Libro Personal"


def test_validacion_y_conflictos(catalog_env):
    _, owner, _ = catalog_env

    with pytest.raises(ValueError):
        catalogue.save(
            Atlas(user_id=owner["id"]), owner, "book", "b1",
            {"cover": "file:///privado"},
            "Prueba", "", None,
        )

    with pytest.raises(ValueError):
        catalogue.save(
            Atlas(user_id=owner["id"]), owner, "author", "a1",
            {"birth": 2000, "death": 1900},
            "Prueba", "", None,
        )

    catalogue.save(
        Atlas(user_id=owner["id"]), owner, "author", "a1",
        {"country": "Francia"}, "Prueba válida", "", None,
    )

    with pytest.raises(ValueError):
        catalogue.save(
            Atlas(user_id=owner["id"]), owner, "author", "a1",
            {"country": "Italia"}, "Versión antigua", "", None,
        )


def test_revision_no_fusiona_registros(catalog_env):
    tmp_path, owner, _ = catalog_env
    path = tmp_path / "catalog.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["authors"]["a2"] = {
        **data["authors"]["a1"],
        "name": "NOMBRE ORIGINAL",
    }
    path.write_text(json.dumps(data), encoding="utf-8")

    atlas = Atlas(user_id=owner["id"])
    report = catalogue.review(atlas)

    assert report["groups"]
    assert len(atlas.authors) == 2
    assert len(atlas.books) == 1
