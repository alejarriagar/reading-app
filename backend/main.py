from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.atlas import Atlas

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="Atlas literario")
LOCK = Lock()


def execute(action=None):
    with LOCK:
        try:
            atlas = Atlas()
            if action is not None:
                action(atlas)
            return atlas.snapshot()
        except (KeyError, IndexError) as exc:
            raise HTTPException(status_code=404, detail=f"No encontrado: {exc}") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc


class BookUpdate(BaseModel):
    state: str
    year: int | None = Field(default=None, ge=1000, le=2200)
    rating: float | None = Field(default=None, ge=0, le=10)
    reread: bool = False
    notes: str = Field(default="", max_length=5000)


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
    return execute(lambda a: a.update_book(
        book_id, body.state, body.year, body.rating, body.reread, body.notes
    ))


@app.post("/api/books")
def add_book(body: NewBook):
    return execute(lambda a: a.add_book(
        body.title, body.author, body.country, body.period,
        body.movements, body.region_ids, body.state,
    ))


@app.put("/api/tiers")
def set_tier(body: TierUpdate):
    return execute(lambda a: a.set_tier(body.region_id, body.author_id, body.tier))


@app.post("/api/regions/{region_id}/mastery")
def toggle_mastery(region_id: str):
    return execute(lambda a: a.toggle_region_mastery(region_id))


@app.post("/api/regions/{region_id}/discover")
def discover_region(region_id: str):
    return execute(lambda a: a.discover_region(region_id))


@app.post("/api/paths/{path_id}/works")
def set_path_work(path_id: str, body: PathWorkUpdate):
    return execute(lambda a: a.set_path_work(
        path_id, body.author_id, body.work_index, body.state
    ))


if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
else:
    @app.get("/", response_class=HTMLResponse)
    def frontend_missing():
        return "<h1>Falta compilar el frontend</h1><p>Ejecuta start.ps1.</p>"