import os
import sqlite3
from pathlib import Path
from threading import Lock

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import accounts, custom_paths, library, store
from backend.atlas import DEFAULT_PROFILE, Atlas

from backend import wishlist
from backend import catalogue

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
SESSION_COOKIE = "atlas_session"
SECURE_COOKIES = os.environ.get("ATLAS_SECURE_COOKIES") == "1"

app = FastAPI(title="Atlas literario", docs_url=None, redoc_url=None, openapi_url=None)

# Todas las operaciones se serializan: así cada petición trabaja con la base de datos de su perfil.
LOCK = Lock()


# ------------------------------- sesión -------------------------------

def current_user(request: Request):
    user = accounts.session_user(request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="Inicia sesión para continuar.")
    return user


def activate(user):
    db_file, backup_dir, legacy_file = accounts.user_files(user)
    store.DB_FILE = db_file
    store.BACKUP_DIR = backup_dir
    store.LEGACY_FILE = legacy_file


def open_atlas(user):
    activate(user)
    atlas = Atlas(user_id=user["id"])
    return atlas


def execute(user, action=None, created=False):
    with LOCK:
        try:
            atlas = open_atlas(user)
            result = action(atlas) if action is not None else None
            snapshot = atlas.snapshot()
            snapshot["me"] = user
            if created:
                snapshot["createdId"] = result
            return snapshot
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except (KeyError, IndexError) as exc:
            raise HTTPException(status_code=404, detail=f"No encontrado: {exc}") from exc
        except (ValueError, sqlite3.IntegrityError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc


def set_session(response, user_id):
    response.set_cookie(
        SESSION_COOKIE,
        accounts.create_session(user_id),
        max_age=accounts.SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=SECURE_COOKIES,
        path="/",
    )


# ------------------------------- modelos -------------------------------

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


class CustomPathIn(BaseModel):
    name: str
    description: str = ""
    region_ids: list[str] = []
    authors: list[dict] = []


class SetupIn(BaseModel):
    name: str
    pin: str


class LoginIn(BaseModel):
    user_id: str
    pin: str


class PinIn(BaseModel):
    old: str
    new: str


class UserIn(BaseModel):
    name: str
    pin: str


# ------------------------------- acceso -------------------------------

@app.get("/api/auth/status")
def auth_status(request: Request):
    return {
        "setup": not accounts.has_users(),
        "users": [{"id": u["id"], "name": u["name"]} for u in accounts.list_users()],
        "me": accounts.session_user(request.cookies.get(SESSION_COOKIE)),
    }


@app.post("/api/auth/setup")
def auth_setup(body: SetupIn, response: Response):
    with LOCK:
        if accounts.has_users():
            raise HTTPException(status_code=409, detail="La aplicación ya está configurada.")
        try:
            owner = accounts.create_user(body.name, body.pin, is_owner=True)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        custom_paths.migrate_from_profile(open_atlas(owner))
    set_session(response, owner["id"])
    return {"ok": True}


@app.post("/api/auth/login")
def auth_login(body: LoginIn, response: Response):
    try:
        ok = accounts.verify(body.user_id, body.pin)
    except accounts.TooManyAttempts as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=401, detail="PIN o contraseña incorrectos.")
    set_session(response, body.user_id)
    return {"ok": True}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    accounts.delete_session(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.post("/api/auth/pin")
def auth_pin(body: PinIn, user: dict = Depends(current_user)):
    try:
        accounts.change_pin(user["id"], body.old, body.new)
    except accounts.TooManyAttempts as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@app.post("/api/auth/users")
def auth_create_user(body: UserIn, user: dict = Depends(current_user)):
    if not user["isOwner"]:
        raise HTTPException(status_code=403, detail="Solo el perfil principal puede crear perfiles.")
    try:
        created = accounts.create_user(body.name, body.pin)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": created["id"], "name": created["name"]}


# ------------------------------- datos -------------------------------

@app.get("/api/state")
def get_state(user: dict = Depends(current_user)):
    return execute(user)


@app.patch("/api/books/{book_id}")
def update_book(book_id: str, body: BookUpdate, user: dict = Depends(current_user)):
    def action(atlas):
        title = atlas.books_by_id.get(book_id, {}).get("title", book_id)
        atlas.label = f"Editar «{title}»"
        atlas.update_book(book_id, body.state, body.year, body.rating, body.reread, body.notes,
                          None if body.readings is None else [r.model_dump() for r in body.readings],
                          genre=body.genre)
    return execute(user, action)


@app.post("/api/books")
def add_book(body: NewBook, user: dict = Depends(current_user)):
    def action(atlas):
        atlas.label = f"Añadir «{body.title}»"
        atlas.add_book(body.title, body.author, body.country, body.period, body.movements, body.region_ids, body.state)
    return execute(user, action)


@app.post("/api/books/{book_id}/reread")
def reread_book(book_id: str, user: dict = Depends(current_user)):
    def action(atlas):
        title = atlas.books_by_id.get(book_id, {}).get("title", book_id)
        atlas.label = f"Releer «{title}»"
        atlas.start_reread(book_id)
    return execute(user, action)


@app.put("/api/tiers")
def set_tier(body: TierUpdate, user: dict = Depends(current_user)):
    def action(atlas):
        atlas.label = "Cambiar clasificación"
        atlas.set_tier(body.region_id, body.author_id, body.tier)
    return execute(user, action)


@app.post("/api/regions/{region_id}/mastery")
def toggle_mastery(region_id: str, user: dict = Depends(current_user)):
    def action(atlas):
        atlas.label = "Exploración profunda"
        atlas.toggle_region_mastery(region_id)
    return execute(user, action)


@app.post("/api/regions/{region_id}/discover")
def discover_region(region_id: str, user: dict = Depends(current_user)):
    def action(atlas):
        atlas.label = "Descubrir territorio"
        atlas.discover_region(region_id)
    return execute(user, action)


@app.post("/api/paths/{path_id}/works")
def set_path_work(path_id: str, body: PathWorkUpdate, user: dict = Depends(current_user)):
    def action(atlas):
        atlas.label = "Cambiar estado desde un camino"
        atlas.set_path_work(path_id, body.author_id, body.work_index, body.state)
    return execute(user, action)


@app.post("/api/recommendations/{book_id}/dismiss")
def dismiss_recommendation(book_id: str, user: dict = Depends(current_user)):
    def action(atlas):
        if book_id not in atlas.books_by_id:
            raise KeyError(book_id)
        atlas.label = f"Descartar sugerencia «{atlas.books_by_id[book_id]['title']}»"
        dismissed = atlas.profile.setdefault("dismissed_recommendations", [])
        if book_id not in dismissed:
            dismissed.append(book_id)
            atlas.save()
    return execute(user, action)


@app.post("/api/paths/custom")
def create_path(body: CustomPathIn, user: dict = Depends(current_user)):
    return execute(user, lambda a: custom_paths.create(a, body.model_dump()), created=True)


@app.put("/api/paths/custom/{path_id}")
def update_path(path_id: str, body: CustomPathIn, user: dict = Depends(current_user)):
    return execute(user, lambda a: custom_paths.update(a, path_id, body.model_dump()), created=True)


@app.delete("/api/paths/custom/{path_id}")
def delete_path(path_id: str, user: dict = Depends(current_user)):
    return execute(user, lambda a: custom_paths.delete(a, path_id))


@app.post("/api/paths/{path_id}/duplicate")
def duplicate_path(path_id: str, user: dict = Depends(current_user)):
    return execute(user, lambda a: custom_paths.duplicate(a, path_id), created=True)


class CopyIn(BaseModel):
    title: str = ""
    author: str = ""
    isbn: str | None = ""
    publisher: str | None = ""
    edition_year: int | None = None
    language: str | None = ""
    format: str | None = None
    house_id: str | None = None
    owner_id: str | None = None
    signed: bool = False
    notes: str | None = ""
    loan_to: str | None = ""
    loan_since: str | None = None
    move_to: str | None = None
    cover: str | None = ""


class HouseIn(BaseModel):
    name: str


class CsvIn(BaseModel):
    text: str = Field(max_length=5_000_000)


class ImportIn(BaseModel):
    rows: list[dict] = []
    default_house_id: str
    default_owner_id: str | None = None
    lookup_missing: bool = True
    skip_duplicates: bool = True


def library_payload(user):
    copies = library.list_copies()
    houses = library.list_houses()
    users = accounts.list_users()
    readers = {c["id"]: [] for c in copies}
    my_books = {}
    for person in users:
        atlas = open_atlas(person)
        for copy_id, book_id in library.match_books(copies, atlas).items():
            book = atlas.books_by_id.get(book_id)
            if book is None:
                continue
            readers[copy_id].append({"userId": person["id"], "name": person["name"],
                                     "state": book["state"], "rating": book.get("rating")})
            if person["id"] == user["id"]:
                my_books[copy_id] = book_id
    activate(user)
    return {
        "houses": houses,
        "users": [{"id": u["id"], "name": u["name"]} for u in users],
        "formats": library.FORMATS,
        "copies": [{**c, "readers": readers[c["id"]], "myBookId": my_books.get(c["id"])} for c in copies],
    }


def library_call(user, fn=None):
    with LOCK:
        try:
            if fn is not None:
                fn()
            return library_payload(user)
        except (KeyError, IndexError) as exc:
            raise HTTPException(status_code=404, detail=f"No encontrado: {exc}") from exc
        except (ValueError, sqlite3.IntegrityError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/library")
def get_library(user: dict = Depends(current_user)):
    return library_call(user)


@app.post("/api/library/copies")
def add_copy(body: CopyIn, user: dict = Depends(current_user)):
    return library_call(user, lambda: library.add_copy(body.model_dump(), user["id"]))


@app.put("/api/library/copies/{copy_id}")
def update_copy(copy_id: str, body: CopyIn, user: dict = Depends(current_user)):
    return library_call(user, lambda: library.update_copy(copy_id, body.model_dump()))


@app.delete("/api/library/copies/{copy_id}")
def delete_copy(copy_id: str, user: dict = Depends(current_user)):
    return library_call(user, lambda: library.delete_copy(copy_id))


@app.post("/api/library/copies/{copy_id}/arrived")
def copy_arrived(copy_id: str, user: dict = Depends(current_user)):
    return library_call(user, lambda: library.arrived(copy_id))


@app.post("/api/library/houses")
def add_house(body: HouseIn, user: dict = Depends(current_user)):
    return library_call(user, lambda: library.add_house(body.name))


@app.put("/api/library/houses/{house_id}")
def rename_house(house_id: str, body: HouseIn, user: dict = Depends(current_user)):
    return library_call(user, lambda: library.rename_house(house_id, body.name))


@app.delete("/api/library/houses/{house_id}")
def delete_house(house_id: str, user: dict = Depends(current_user)):
    return library_call(user, lambda: library.delete_house(house_id))


@app.get("/api/isbn/{isbn}")
def isbn_lookup(isbn: str, user: dict = Depends(current_user)):
    try:
        return library.lookup_isbn(isbn)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=exc.args[0] if exc.args else "No encontrado") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/library/import/preview")
def import_preview(body: CsvIn, user: dict = Depends(current_user)):
    with LOCK:
        try:
            return library.preview_csv(body.text)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/library/import")
def import_library(body: ImportIn, user: dict = Depends(current_user)):
    rows = [dict(r) for r in body.rows][:library.MAX_IMPORT]
    if body.lookup_missing:
        looked = 0
        for row in rows:
            if row.get("title") or not row.get("isbn") or looked >= 300:
                continue
            looked += 1
            try:
                info = library.lookup_isbn(row["isbn"])
            except (KeyError, ValueError):
                continue
            for key in ("title", "author", "publisher", "edition_year", "language", "cover"):
                if not row.get(key) and info.get(key):
                    row[key] = info[key]
    with LOCK:
        try:
            result = library.import_rows(rows, body.default_house_id, body.default_owner_id,
                                         body.skip_duplicates, user["id"])
            payload = library_payload(user)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    payload["import"] = result
    return payload


class WishIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    author: str = Field(default="", max_length=200)
    isbn: str = ""
    publisher: str = ""
    edition_year: int | None = None
    language: str = ""
    cover: str = ""
    priority: str = "NORMAL"
    notes: str = Field(default="", max_length=2000)


class WishReserveIn(BaseModel):
    reserved: bool


class WishAcquireIn(CopyIn):
    allow_duplicate: bool = False


def wishlist_call(action=None):
    with LOCK:
        try:
            result = action() if action is not None else None
            payload = {"items": wishlist.list_items()}
            if result is not None:
                payload["resultId"] = result
            return payload
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Deseo no encontrado.") from exc
        except (ValueError, sqlite3.IntegrityError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/wishlist")
def get_wishlist(user: dict = Depends(current_user)):
    return wishlist_call()


@app.post("/api/wishlist")
def add_wish(body: WishIn, user: dict = Depends(current_user)):
    return wishlist_call(lambda: wishlist.create(body.model_dump(), user))


@app.put("/api/wishlist/{wish_id}")
def update_wish(wish_id: str, body: WishIn, user: dict = Depends(current_user)):
    return wishlist_call(lambda: wishlist.update(wish_id, body.model_dump()))


@app.delete("/api/wishlist/{wish_id}")
def delete_wish(wish_id: str, user: dict = Depends(current_user)):
    return wishlist_call(lambda: wishlist.delete(wish_id))


@app.post("/api/wishlist/{wish_id}/reserve")
def reserve_wish(wish_id: str, body: WishReserveIn, user: dict = Depends(current_user)):
    return wishlist_call(lambda: wishlist.reserve(wish_id, user, body.reserved))


@app.post("/api/wishlist/{wish_id}/acquire")
def acquire_wish(wish_id: str, body: WishAcquireIn, user: dict = Depends(current_user)):
    return wishlist_call(lambda: wishlist.acquire(
        wish_id,
        body.model_dump(exclude={"allow_duplicate"}),
        user,
        body.allow_duplicate,
    ))


class CatalogCorrectionIn(BaseModel):
    fields: dict
    reason: str = Field(min_length=1, max_length=500)
    source_url: str = Field(default="", max_length=1500)
    expected_version: str | None = None


class CatalogResetIn(BaseModel):
    expected_version: str | None = None


@app.get("/api/catalog/review")
def catalog_review(user: dict = Depends(current_user)):
    with LOCK:
        return catalogue.review(open_atlas(user))


@app.get("/api/catalog/{kind}/{resource_id}")
def catalog_detail(kind: str, resource_id: str, user: dict = Depends(current_user)):
    with LOCK:
        try:
            return catalogue.detail(open_atlas(user), user, kind, resource_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="Registro no encontrado.") from exc


@app.put("/api/catalog/{kind}/{resource_id}")
def catalog_correct(kind: str, resource_id: str, body: CatalogCorrectionIn,
                    user: dict = Depends(current_user)):
    return execute(user, lambda atlas: catalogue.save(
        atlas, user, kind, resource_id,
        body.fields, body.reason, body.source_url, body.expected_version,
    ))


@app.post("/api/catalog/{kind}/{resource_id}/reset")
def catalog_reset(kind: str, resource_id: str, body: CatalogResetIn,
                  user: dict = Depends(current_user)):
    return execute(user, lambda atlas: catalogue.reset(
        atlas, user, kind, resource_id, body.expected_version,
    ))


@app.post("/api/undo")
def undo(user: dict = Depends(current_user)):
    with LOCK:
        activate(user)
        try:
            label = store.undo_last()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        snapshot = open_atlas(user).snapshot()
        snapshot["me"] = user
        snapshot["undone"] = label
        return snapshot


@app.get("/api/history")
def get_history(user: dict = Depends(current_user)):
    with LOCK:
        activate(user)
        return store.history()


@app.get("/api/export")
def export_profile(user: dict = Depends(current_user)):
    with LOCK:
        activate(user)
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