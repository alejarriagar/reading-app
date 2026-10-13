import json

import pytest

from backend import atlas as atlas_module
from backend import store
from backend.atlas import DEFAULT_PROFILE, Atlas
from backend.geo import century_of, country_of

CATALOG = {
    "regions": {"r1": {"name": "Región de prueba", "type": "País + periodo", "frontiers": []}},
    "authors": {
        "a1": {"name": "Autora Uno", "country": "España", "period": "Siglo XIX", "tier": "ESSENTIAL", "regions": ["r1"], "related": []},
        "a2": {"name": "Autor Dos", "country": "Imperio ruso", "period": "Siglo XIX", "tier": "RECOMMENDED", "regions": ["r1"], "related": []},
    },
    "books": [
        {"id": "b1", "title": "Libro Uno", "author": "a1", "regions": ["r1"]},
        {"id": "b2", "title": "Libro Dos", "author": "a2", "regions": ["r1"]},
    ],
}

PATHS = {"paths": [{
    "id": "p1", "name": "Camino de prueba", "period": "Siglo XX", "region_ids": ["r1"],
    "authors": [{"id": "x", "name": "Autor Nuevo", "short": "Nuevo", "tier": "ESSENTIAL", "country": "Francia",
                 "aliases": [], "works": [{"title": "Obra Nueva", "year": 1950, "aliases": []}]}],
}]}


@pytest.fixture
def env(tmp_path, monkeypatch):
    (tmp_path / "catalog.json").write_text(json.dumps(CATALOG), encoding="utf-8")
    (tmp_path / "paths.json").write_text(json.dumps(PATHS), encoding="utf-8")
    monkeypatch.setattr(atlas_module, "CATALOG_FILE", tmp_path / "catalog.json")
    monkeypatch.setattr(atlas_module, "PATHS_FILE", tmp_path / "paths.json")
    monkeypatch.setattr(atlas_module, "WIKIDATA_FILE", tmp_path / "no-existe.json")
    monkeypatch.setattr(store, "DB_FILE", tmp_path / "atlas.db")
    monkeypatch.setattr(store, "LEGACY_FILE", tmp_path / "reading_progress.json")
    monkeypatch.setattr(store, "BACKUP_DIR", tmp_path / "backups")
    return tmp_path


def region(snapshot, region_id="r1"):
    return next(r for r in snapshot["regions"] if r["id"] == region_id)


def test_migracion_desde_json_conserva_todo(env):
    legacy = {
        "book_statuses": {"b1": "READ"},
        "book_metadata": {"b1": {"year": 2024, "rating": 9.0, "reread": True, "notes": "nota"}},
        "custom_books": [{"id": "c1", "title": "Mío", "author": "a1", "regions": []}],
        "tier_overrides": {"r1::a2": "ESSENTIAL"},
        "clave_desconocida": 5,
    }
    store.LEGACY_FILE.write_text(json.dumps(legacy), encoding="utf-8")

    profile = store.load_profile(DEFAULT_PROFILE)

    assert profile["book_statuses"] == {"b1": "READ"}
    assert profile["book_metadata"]["b1"]["notes"] == "nota"
    assert profile["custom_books"][0]["title"] == "Mío"
    assert profile["tier_overrides"] == {"r1::a2": "ESSENTIAL"}
    assert profile["clave_desconocida"] == 5
    assert not store.LEGACY_FILE.exists()
    assert store.migrated_file().exists()
    assert list(store.BACKUP_DIR.glob("reading_progress-antes-de-sqlite-*.json"))


def test_progreso_por_region_y_clasificacion(env):
    before = region(Atlas().snapshot())
    assert before["state"] == "LOCKED"
    assert before["rate"] == 0

    Atlas().update_book("b1", "READ", 2024, 8.0, False, "")
    after = region(Atlas().snapshot())

    assert after["state"] == "READ"
    assert after["rate"] == pytest.approx(0.5)
    assert after["tiers"]["ESSENTIAL"] == {"read": 1, "total": 1}
    assert after["tiers"]["RECOMMENDED"] == {"read": 0, "total": 1}


def test_una_lectura_nunca_es_exploracion_profunda(env):
    a = Atlas()
    a.update_book("b1", "READ", None, None, False, "")
    a.update_book("b2", "READ", None, None, False, "")
    snapshot = Atlas().snapshot()
    assert region(snapshot)["state"] == "READ"
    assert snapshot["authors"]["a1"]["state"] == "READ"


def test_estado_invalido_rechazado(env):
    with pytest.raises(ValueError):
        Atlas().update_book("b1", "INVENTADO", None, None, False, "")


def test_deshacer_restaura_el_estado_anterior(env):
    Atlas().update_book("b1", "READ", 2025, 7.0, False, "")
    assert Atlas().books_by_id["b1"]["state"] == "READ"
    store.undo_last()
    assert Atlas().books_by_id["b1"]["state"] == "LOCKED"
    with pytest.raises(ValueError):
        store.undo_last()


def test_camino_crea_la_obra_en_la_biblioteca(env):
    Atlas().set_path_work("p1", "x", 0, "READ")
    snapshot = Atlas().snapshot()
    book = next(b for b in snapshot["books"] if b["title"] == "Obra Nueva")
    assert book["state"] == "READ"
    assert snapshot["paths"][0]["authors"][0]["state"] == "READ"


def test_copias_de_seguridad(env, monkeypatch):
    monkeypatch.setattr(store, "KEEP_BACKUPS", 2)
    store.load_profile(DEFAULT_PROFILE)
    for reason in ("a", "b", "c"):
        store.backup(reason)
    assert 1 <= len(list(store.BACKUP_DIR.glob("atlas-*.db"))) <= 2


def test_ubicacion_geografica_y_temporal():
    assert country_of("Imperio ruso") == ("643", "Rusia")
    assert country_of("Líbano / Estados Unidos") == ("422", "Líbano")
    assert country_of("Atlántida") is None
    assert century_of({"birth": 1821}) == 19
    assert century_of({"birth": 1871}) == 20
    assert century_of({"birth": -384}) < 0
    assert century_of({"period": "Siglos XVI-XVII"}) == 16

def test_recomendaciones_explican_y_respetan_descartes(env):
    new_id = Atlas().add_book("Libro Tres", "Autora Uno", "", "", [], ["r1"], "DISCOVERED")
    Atlas().update_book("b1", "READ", 2025, 9.0, False, "")

    recs = Atlas().snapshot()["recommendations"]
    ids = [r["bookId"] for r in recs]
    assert new_id in ids
    assert "b1" not in ids
    first = next(r for r in recs if r["bookId"] == new_id)
    assert any("Te encantó" in reason for reason in first["reasons"])

    atlas = Atlas()
    atlas.profile.setdefault("dismissed_recommendations", []).append(new_id)
    atlas.save()
    assert new_id not in [r["bookId"] for r in Atlas().snapshot()["recommendations"]]


def test_no_recomienda_lo_que_estas_leyendo(env):
    Atlas().update_book("b2", "READING", None, None, False, "")
    recs = Atlas().snapshot()["recommendations"]
    assert "b2" not in [r["bookId"] for r in recs]