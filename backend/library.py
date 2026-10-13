"""Biblioteca física familiar: casas, ejemplares, préstamos e importación CSV.

Es compartida entre perfiles y se guarda en data/accounts.db.
Las lecturas siguen siendo de cada perfil: un ejemplar se relaciona con
las obras de cada uno por título y autor.
"""
import csv
import io
import json
import re
import unicodedata
import urllib.parse
import urllib.request
import uuid
from collections import defaultdict
from contextlib import closing
from datetime import datetime

from backend import accounts

FORMATS = {
    "HARDCOVER": "Tapa dura",
    "PAPERBACK": "Tapa blanda",
    "POCKET": "Bolsillo",
    "EBOOK": "Libro electrónico",
    "AUDIO": "Audiolibro",
    "OTHER": "Otro",
}
FORMAT_ALIASES = {
    "tapa dura": "HARDCOVER", "cartone": "HARDCOVER", "hardcover": "HARDCOVER",
    "tapa blanda": "PAPERBACK", "rustica": "PAPERBACK", "paperback": "PAPERBACK",
    "bolsillo": "POCKET", "pocket": "POCKET",
    "ebook": "EBOOK", "e book": "EBOOK", "digital": "EBOOK", "kindle": "EBOOK",
    "electronico": "EBOOK", "libro electronico": "EBOOK",
    "audio": "AUDIO", "audiolibro": "AUDIO", "audiobook": "AUDIO",
}
DEFAULT_HOUSES = ("Pozuelo", "Boadilla")
FAMILY_WORDS = {"familia", "ambos", "compartido", "compartida", "los dos", "todos"}
UA = "AtlasLiterario/1.2 (https://github.com/alejarriagar/reading-app; personal reading app)"
MAX_IMPORT = 3000

HEADERS = {
    "title": ["titulo", "título", "title", "libro", "obra"],
    "author": ["autor", "autora", "author", "autores", "authors"],
    "isbn": ["isbn", "isbn13", "isbn10", "isbn 13", "isbn 10"],
    "publisher": ["editorial", "publisher", "editor"],
    "edition_year": ["año", "ano", "year", "año edicion", "año de edicion", "fecha", "publicacion"],
    "house": ["casa", "ubicacion", "ubicación", "house", "lugar", "location"],
    "owner": ["propietario", "propietaria", "dueño", "dueno", "owner"],
    "format": ["formato", "format", "encuadernacion"],
    "notes": ["notas", "notes", "comentarios", "observaciones"],
    "language": ["idioma", "language", "lengua"],
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS house (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS copy (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  work_key TEXT NOT NULL,
  isbn TEXT,
  publisher TEXT,
  edition_year INTEGER,
  language TEXT,
  format TEXT,
  house_id TEXT NOT NULL,
  owner_id TEXT,
  signed INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  loan_to TEXT,
  loan_since TEXT,
  move_to TEXT,
  cover TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS copy_house ON copy (house_id);
"""
COLUMNS = ("title", "author", "work_key", "isbn", "publisher", "edition_year", "language", "format",
           "house_id", "owner_id", "signed", "notes", "loan_to", "loan_since", "move_to", "cover")


def _norm(value):
    value = re.sub(r"\(.*?\)", " ", str(value or ""))
    value = unicodedata.normalize("NFD", value.casefold())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _connect():
    conn = accounts.connect()
    conn.executescript(SCHEMA)
    return conn


def _text(value, limit, label, required=False):
    text = str(value or "").strip()
    if required and not text:
        raise ValueError(f"Falta {label}.")
    if len(text) > limit:
        raise ValueError(f"{label[0].upper() + label[1:]} es demasiado largo.")
    return text


def _date(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        datetime.strptime(text, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError(f"Fecha no válida: «{text}». Usa AAAA-MM-DD.") from exc
    return text


def _year(value):
    if value in (None, ""):
        return None
    if isinstance(value, int):
        year = value
    else:
        match = re.search(r"\d{4}", str(value))
        if not match:
            return None
        year = int(match.group())
    return year if 1000 <= year <= 2200 else None


def _format(value):
    key = _norm(value)
    if not key:
        return None
    if key.upper() in FORMATS:
        return key.upper()
    return FORMAT_ALIASES.get(key, "OTHER")


def clean_isbn(value):
    text = re.sub(r"[^0-9Xx]", "", str(value or "")).upper()
    if not text:
        return ""
    if len(text) not in (10, 13) or "X" in text[:-1]:
        raise ValueError(f"ISBN no válido: «{value}». Debe tener 10 o 13 cifras.")
    return text


def work_key(title, author):
    first = re.split(r",|;| y | & ", str(author or ""))[0]
    return f"{_norm(title)}|{_norm(first)}"


# ------------------------------- casas -------------------------------

def _insert_house(conn, name):
    house_id = uuid.uuid4().hex[:10]
    position = conn.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM house").fetchone()[0]
    conn.execute("INSERT INTO house (id, name, position) VALUES (?, ?, ?)", (house_id, name, position))
    return house_id


def list_houses():
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT id, name FROM house ORDER BY position, name").fetchall()
        if not rows:
            with conn:
                for name in DEFAULT_HOUSES:
                    _insert_house(conn, name)
            rows = conn.execute("SELECT id, name FROM house ORDER BY position, name").fetchall()
    return [{"id": r[0], "name": r[1]} for r in rows]


def add_house(name):
    name = _text(name, 40, "el nombre de la casa", True)
    list_houses()
    with closing(_connect()) as conn:
        try:
            with conn:
                return _insert_house(conn, name)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Ya existe una casa con ese nombre.") from exc


def rename_house(house_id, name):
    name = _text(name, 40, "el nombre de la casa", True)
    with closing(_connect()) as conn:
        if conn.execute("SELECT 1 FROM house WHERE id = ?", (house_id,)).fetchone() is None:
            raise KeyError(house_id)
        try:
            with conn:
                conn.execute("UPDATE house SET name = ? WHERE id = ?", (name, house_id))
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Ya existe una casa con ese nombre.") from exc


def delete_house(house_id):
    with closing(_connect()) as conn:
        if conn.execute("SELECT 1 FROM house WHERE id = ?", (house_id,)).fetchone() is None:
            raise KeyError(house_id)
        if conn.execute("SELECT COUNT(*) FROM house").fetchone()[0] <= 1:
            raise ValueError("Tiene que quedar al menos una casa.")
        if conn.execute("SELECT 1 FROM copy WHERE house_id = ? OR move_to = ?", (house_id, house_id)).fetchone():
            raise ValueError("Esa casa tiene libros. Muévelos o elimínalos antes.")
        with conn:
            conn.execute("DELETE FROM house WHERE id = ?", (house_id,))


# ------------------------------- ejemplares -------------------------------

def clean_copy(payload, house_ids, user_ids):
    title = _text(payload.get("title"), 300, "el título", True)
    author = _text(payload.get("author"), 200, "el autor")
    house_id = payload.get("house_id")
    if house_id not in house_ids:
        raise ValueError("Elige en qué casa está el libro.")
    owner_id = payload.get("owner_id") or None
    if owner_id and owner_id not in user_ids:
        raise ValueError("Propietario desconocido.")
    move_to = payload.get("move_to") or None
    if move_to and (move_to not in house_ids or move_to == house_id):
        move_to = None
    fmt = payload.get("format") or None
    if fmt and fmt not in FORMATS:
        fmt = "OTHER"
    cover = _text(payload.get("cover"), 500, "la portada")
    loan_to = _text(payload.get("loan_to"), 80, "a quién se ha prestado") or None
    return {
        "title": title,
        "author": author,
        "work_key": work_key(title, author),
        "isbn": clean_isbn(payload.get("isbn")) or None,
        "publisher": _text(payload.get("publisher"), 120, "la editorial") or None,
        "edition_year": _year(payload.get("edition_year")),
        "language": _text(payload.get("language"), 40, "el idioma") or None,
        "format": fmt,
        "house_id": house_id,
        "owner_id": owner_id,
        "signed": 1 if payload.get("signed") else 0,
        "notes": _text(payload.get("notes"), 2000, "las notas"),
        "loan_to": loan_to,
        "loan_since": _date(payload.get("loan_since")) if loan_to else None,
        "move_to": move_to,
        "cover": cover if cover.startswith("https://") else None,
    }


def _context():
    return {h["id"] for h in list_houses()}, {u["id"] for u in accounts.list_users()}


def _insert_copy(conn, data, created_by):
    copy_id = uuid.uuid4().hex[:12]
    now = _now()
    placeholders = ", ".join("?" * (len(COLUMNS) + 4))
    conn.execute(
        f"INSERT INTO copy (id, {', '.join(COLUMNS)}, created_by, created_at, updated_at) VALUES ({placeholders})",
        (copy_id, *[data[c] for c in COLUMNS], created_by, now, now),
    )
    return copy_id


def add_copy(payload, created_by):
    data = clean_copy(payload, *_context())
    with closing(_connect()) as conn:
        with conn:
            return _insert_copy(conn, data, created_by)


def update_copy(copy_id, payload):
    data = clean_copy(payload, *_context())
    with closing(_connect()) as conn:
        if conn.execute("SELECT 1 FROM copy WHERE id = ?", (copy_id,)).fetchone() is None:
            raise KeyError(copy_id)
        with conn:
            conn.execute(
                f"UPDATE copy SET {', '.join(f'{c} = ?' for c in COLUMNS)}, updated_at = ? WHERE id = ?",
                (*[data[c] for c in COLUMNS], _now(), copy_id),
            )


def delete_copy(copy_id):
    with closing(_connect()) as conn:
        with conn:
            if conn.execute("DELETE FROM copy WHERE id = ?", (copy_id,)).rowcount == 0:
                raise KeyError(copy_id)


def arrived(copy_id):
    with closing(_connect()) as conn:
        row = conn.execute("SELECT move_to FROM copy WHERE id = ?", (copy_id,)).fetchone()
        if row is None:
            raise KeyError(copy_id)
        if not row[0]:
            raise ValueError("Este libro no estaba marcado para llevar a otra casa.")
        with conn:
            conn.execute("UPDATE copy SET house_id = move_to, move_to = NULL, updated_at = ? WHERE id = ?", (_now(), copy_id))


def list_copies():
    keys = ("id", "title", "author", "workKey", "isbn", "publisher", "editionYear", "language", "format",
            "houseId", "ownerId", "signed", "notes", "loanTo", "loanSince", "moveTo", "cover", "createdAt", "updatedAt")
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT id, title, author, work_key, isbn, publisher, edition_year, language, format, house_id, owner_id, "
            "signed, notes, loan_to, loan_since, move_to, cover, created_at, updated_at FROM copy"
        ).fetchall()
    result = [dict(zip(keys, row)) for row in rows]
    for item in result:
        item["signed"] = bool(item["signed"])
    return result


# ------------------------------- relación con las lecturas -------------------------------

def match_books(copies, atlas):
    """Relaciona cada ejemplar con una obra de la biblioteca de lecturas de un perfil."""
    by_title = defaultdict(list)
    for book in atlas.books:
        author_name = atlas.authors.get(book["author"], {}).get("name", "")
        names = atlas.authors.get(book["author"], {}).get("_catalog_names", [author_name])
        titles = book.get("_catalog_titles", [book["title"]])
        for title in titles:
            for name in names:
                candidate = (book["id"], _norm(name))
                if candidate not in by_title[_norm(title)]:
                    by_title[_norm(title)].append(candidate)

    result = {}
    for item in copies:
        options = by_title.get(_norm(item["title"]), [])
        if not options:
            continue
        author = _norm(item["author"])
        exact = next((bid for bid, a in options if a and a == author), None)
        if exact:
            result[item["id"]] = exact
            continue
        parts = [_norm(p) for p in re.split(r",|;| y | & ", item["author"] or "")]
        surnames = {p.split()[-1] for p in parts if p}
        loose = next((bid for bid, a in options if surnames and any(s in a.split() for s in surnames)), None)
        if loose:
            result[item["id"]] = loose
        elif not author and len({bid for bid, _ in options}) == 1:
            result[item["id"]] = options[0][0]
    return result


def shelf_for(atlas):
    houses = list_houses()
    house_names = {h["id"]: h["name"] for h in houses}
    users = {u["id"]: u["name"] for u in accounts.list_users()}
    copies = list_copies()
    by_book = defaultdict(list)
    for copy_id, book_id in match_books(copies, atlas).items():
        item = next(c for c in copies if c["id"] == copy_id)
        by_book[book_id].append({
            "id": copy_id,
            "houseName": house_names.get(item["houseId"]),
            "ownerName": users.get(item["ownerId"], "la familia") if item["ownerId"] else "la familia",
            "loanTo": item["loanTo"],
            "moveTo": house_names.get(item["moveTo"]),
        })
    return {"houses": houses, "count": len(copies), "byBook": dict(by_book)}


# ------------------------------- ISBN -------------------------------

def _get_json(url, params):
    request = urllib.request.Request(f"{url}?{urllib.parse.urlencode(params)}", headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def lookup_isbn(value):
    isbn = clean_isbn(value)
    if not isbn:
        raise ValueError("Escribe un ISBN.")
    result = {"isbn": isbn}

    try:
        data = _get_json("https://www.googleapis.com/books/v1/volumes", {"q": f"isbn:{isbn}", "maxResults": 1})
        if data.get("items"):
            info = data["items"][0].get("volumeInfo", {})
            result["title"] = info.get("title")
            result["author"] = ", ".join(info.get("authors") or [])
            result["publisher"] = info.get("publisher")
            result["edition_year"] = _year(info.get("publishedDate"))
            result["language"] = info.get("language")
            thumb = (info.get("imageLinks") or {}).get("thumbnail")
            if thumb:
                result["cover"] = thumb.replace("http://", "https://").replace("&edge=curl", "")
    except Exception:  # noqa: BLE001
        pass

    try:
        data = _get_json("https://openlibrary.org/api/books", {"bibkeys": f"ISBN:{isbn}", "format": "json", "jscmd": "data"})
        info = data.get(f"ISBN:{isbn}") or {}
        if info:
            result["title"] = result.get("title") or info.get("title")
            result["author"] = result.get("author") or ", ".join(a.get("name", "") for a in info.get("authors", []))
            if not result.get("publisher") and info.get("publishers"):
                result["publisher"] = info["publishers"][0].get("name")
            result["edition_year"] = result.get("edition_year") or _year(info.get("publish_date"))
            cover = info.get("cover") or {}
            result["cover"] = result.get("cover") or cover.get("medium") or cover.get("large")
    except Exception:  # noqa: BLE001
        pass

    if not result.get("title"):
        raise KeyError("No he encontrado ese ISBN en Google Books ni en Open Library.")
    result["cover"] = result.get("cover") or f"https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg?default=false"
    return result


# ------------------------------- CSV -------------------------------

def parse_csv(text):
    text = (text or "").lstrip("\ufeff")
    if not text.strip():
        raise ValueError("El archivo está vacío.")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
    except csv.Error:
        class Fallback(csv.excel):
            delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        dialect = Fallback

    rows = list(csv.reader(io.StringIO(text), dialect))
    if not rows:
        raise ValueError("El archivo está vacío.")

    header = [_norm(h) for h in rows[0]]
    mapping = {}
    for field, names in HEADERS.items():
        wanted = {_norm(n) for n in names}
        for index, name in enumerate(header):
            if name in wanted and field not in mapping:
                mapping[field] = index
    if "title" not in mapping and "isbn" not in mapping:
        raise ValueError("No encuentro una columna de título ni de ISBN. Revisa la primera fila (las cabeceras).")

    parsed = []
    for raw in rows[1:]:
        if not any(cell.strip() for cell in raw):
            continue
        parsed.append({field: (raw[i].strip() if i < len(raw) else "") for field, i in mapping.items()})
    if len(parsed) > MAX_IMPORT:
        raise ValueError(f"Máximo {MAX_IMPORT} filas por importación.")
    return {"columns": {field: rows[0][i] for field, i in mapping.items()}, "rows": parsed}


def preview_csv(text):
    parsed = parse_csv(text)
    copies = list_copies()
    keys = {c["workKey"] for c in copies}
    isbns = {c["isbn"] for c in copies if c["isbn"]}

    def duplicate(row):
        if row.get("title") and work_key(row["title"], row.get("author")) in keys:
            return True
        try:
            return bool(row.get("isbn")) and clean_isbn(row["isbn"]) in isbns
        except ValueError:
            return False

    rows = parsed["rows"]
    return {
        "columns": parsed["columns"],
        "rows": rows,
        "total": len(rows),
        "withoutTitle": sum(1 for r in rows if not r.get("title")),
        "isbnOnly": sum(1 for r in rows if not r.get("title") and r.get("isbn")),
        "duplicates": sum(1 for r in rows if duplicate(r)),
    }


def import_rows(rows, default_house_id, default_owner_id, skip_duplicates, created_by):
    houses = {_norm(h["name"]): h["id"] for h in list_houses()}
    users = {_norm(u["name"]): u["id"] for u in accounts.list_users()}
    if default_house_id not in houses.values():
        raise ValueError("Elige una casa por defecto.")
    if default_owner_id and default_owner_id not in users.values():
        raise ValueError("Propietario por defecto desconocido.")

    copies = list_copies()
    existing = {(c["workKey"], c["houseId"]) for c in copies} | {(c["isbn"], c["houseId"]) for c in copies if c["isbn"]}
    created, skipped, errors = 0, 0, []

    with closing(_connect()) as conn:
        with conn:
            for number, row in enumerate(rows[:MAX_IMPORT], start=2):
                title = str(row.get("title") or "").strip()
                if not title:
                    errors.append(f"Fila {number}: sin título")
                    continue

                house_key = _norm(row.get("house"))
                if house_key and house_key not in houses:
                    houses[house_key] = _insert_house(conn, str(row["house"]).strip()[:40])
                house_id = houses.get(house_key) or default_house_id

                owner_key = _norm(row.get("owner"))
                if not owner_key:
                    owner_id = default_owner_id
                elif owner_key in FAMILY_WORDS:
                    owner_id = None
                else:
                    owner_id = users.get(owner_key)
                    if owner_id is None:
                        errors.append(f"Fila {number}: propietario «{row.get('owner')}» desconocido; queda como familia")

                try:
                    isbn = clean_isbn(row.get("isbn"))
                except ValueError:
                    errors.append(f"Fila {number}: ISBN no válido, se ignora")
                    isbn = ""

                payload = {
                    "title": title,
                    "author": row.get("author", ""),
                    "isbn": isbn,
                    "publisher": row.get("publisher", ""),
                    "edition_year": row.get("edition_year"),
                    "language": row.get("language", ""),
                    "format": _format(row.get("format")),
                    "house_id": house_id,
                    "owner_id": owner_id,
                    "notes": row.get("notes", ""),
                    "cover": row.get("cover") or "",
                }
                try:
                    data = clean_copy(payload, set(houses.values()), set(users.values()))
                except ValueError as exc:
                    errors.append(f"Fila {number}: {exc}")
                    continue

                key = (data["work_key"], house_id)
                isbn_key = (data["isbn"], house_id)
                if skip_duplicates and (key in existing or (data["isbn"] and isbn_key in existing)):
                    skipped += 1
                    continue
                _insert_copy(conn, data, created_by)
                existing.add(key)
                if data["isbn"]:
                    existing.add(isbn_key)
                created += 1

    return {"created": created, "skipped": skipped, "errors": errors[:50], "errorCount": len(errors)}