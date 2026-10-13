import sqlite3
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import custom_paths, store
from backend.atlas import DEFAULT_PROFILE, Atlas

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="Atlas literario")
LOCK = Lock()

try:
    store.load_profile(DEFAULT_PROFILE)
    store.maybe_backup()
except Exception as exc:  # noqa: BLE001
    print(f"Aviso: no se pudo preparar la base de datos: {exc}")


def execute(action=None):
    with LOCK:
        try:
            atlas = Atlas()
            if action is not None:
                action(atlas)
            return atlas.snapshot()
        except (KeyError, IndexError) as exc:
            raise HTTPException(status_code=404, detail=f"No encontrado: {exc}") from exc
        except (ValueError, sqlite3.IntegrityError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc


class ReadingIn(BaseModel):
    id: str | None = None
    status: str = "done"
    started: str | None = None
    finished: str | None = None
    reread: bool = False
    note: str = Field(default="", max_length=500)


class BookUpdate(BaseModel):
    state: str
    year: int | None = Field(default=None, ge=1000, le=2200)
    rating: float | None = Field(default=None, ge=0, le=10)
    reread: bool = False
    notes: str = Field(default="", max_length=5000)
    readings: list[ReadingIn] | None = None
    genre: str | None = None


class NewBook(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    author: str = Field(min_length=1, max_length=200)
    country: str = ""
    period: str = ""
    movements: list[str] = []
    region_ids: list[str] = []
    state: str = "DISCOVERED"


class TierUpdate(BaseModel):
    region_id: str
    author_id: str
    tier: str


class PathWorkUpdate(BaseModel):
    author_id: str
    work_index: int = Field(ge=0)
    state: str


@app.get("/api/state")
def get_state():
    return execute()


@app.patch("/api/books/{book_id}")
def update_book(book_id: str, body: BookUpdate):
    def action(atlas):
        title = atlas.books_by_id.get(book_id, {}).get("title", book_id)
        atlas.label = f"Editar «{title}»"
        atlas.update_book(book_id, body.state, body.year, body.rating, body.reread, body.notes,
                          None if body.readings is None else [r.model_dump() for r in body.readings],
                          genre=body.genre)
    return execute(action)


@app.post("/api/books")
def add_book(body: NewBook):
    def action(atlas):
        atlas.label = f"Añadir «{body.title}»"
        atlas.add_book(body.title, body.author, body.country, body.period, body.movements, body.region_ids, body.state)
    return execute(action)


@app.put("/api/tiers")
def set_tier(body: TierUpdate):
    def action(atlas):
        atlas.label = "Cambiar clasificación"
        atlas.set_tier(body.region_id, body.author_id, body.tier)
    return execute(action)


@app.post("/api/regions/{region_id}/mastery")
def toggle_mastery(region_id: str):
    def action(atlas):
        atlas.label = "Exploración profunda"
        atlas.toggle_region_mastery(region_id)
    return execute(action)


@app.post("/api/regions/{region_id}/discover")
def discover_region(region_id: str):
    def action(atlas):
        atlas.label = "Descubrir territorio"
        atlas.discover_region(region_id)
    return execute(action)


@app.post("/api/paths/{path_id}/works")
def set_path_work(path_id: str, body: PathWorkUpdate):
    def action(atlas):
        atlas.label = "Cambiar estado desde un camino"
        atlas.set_path_work(path_id, body.author_id, body.work_index, body.state)
    return execute(action)


@app.post("/api/books/{book_id}/reread")
def reread_book(book_id: str):
    def action(atlas):
        title = atlas.books_by_id.get(book_id, {}).get("title", book_id)
        atlas.label = f"Releer «{title}»"
        atlas.start_reread(book_id)
    return execute(action)


@app.post("/api/recommendations/{book_id}/dismiss")
def dismiss_recommendation(book_id: str):
    def action(atlas):
        if book_id not in atlas.books_by_id:
            raise KeyError(book_id)
        atlas.label = f"Descartar sugerencia «{atlas.books_by_id[book_id]['title']}»"
        dismissed = atlas.profile.setdefault("dismissed_recommendations", [])
        if book_id not in dismissed:
            dismissed.append(book_id)
            atlas.save()
    return execute(action)


class CustomPathIn(BaseModel):
    name: str
    description: str = ""
    region_ids: list[str] = []
    authors: list[dict] = []


def execute_create(fn, label):
    created = {}

    def action(atlas):
        atlas.label = label
        created["id"] = fn(atlas)

    snapshot = execute(action)
    snapshot["createdId"] = created.get("id")
    return snapshot


@app.post("/api/paths/custom")
def create_path(body: CustomPathIn):
    return execute_create(lambda a: custom_paths.create(a, body.model_dump()), f"Crear camino «{body.name}»")


@app.put("/api/paths/custom/{path_id}")
def update_path(path_id: str, body: CustomPathIn):
    return execute_create(lambda a: custom_paths.update(a, path_id, body.model_dump()), f"Editar camino «{body.name}»")


@app.delete("/api/paths/custom/{path_id}")
def delete_path(path_id: str):
    def action(atlas):
        atlas.label = "Eliminar camino"
        custom_paths.delete(atlas, path_id)
    return execute(action)


@app.post("/api/paths/{path_id}/duplicate")
def duplicate_path(path_id: str):
    return execute_create(lambda a: custom_paths.duplicate(a, path_id), "Personalizar camino")


@app.post("/api/undo")
def undo():
    with LOCK:
        try:
            label = store.undo_last()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        snapshot = Atlas().snapshot()
        snapshot["undone"] = label
        return snapshot


@app.get("/api/history")
def get_history():
    return store.history()


@app.get("/api/export")
def export_profile():
    with LOCK:
        profile = store.load_profile(DEFAULT_PROFILE)
    return JSONResponse(
        content=profile,
        headers={"Content-Disposition": 'attachment; filename="atlas-mis-datos.json"'},
    )


if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
else:
    @app.get("/", response_class=HTMLResponse)
    def frontend_missing():
        return "<h1>Falta compilar el frontend</h1><p>Ejecuta start.ps1.</p>"