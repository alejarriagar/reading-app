"""Deseos familiares compartidos.

Añadir un deseo no crea una lectura ni un ejemplar.
Adquirirlo crea el ejemplar y archiva el deseo en una sola transacción.
"""
import json
import uuid
from contextlib import closing
from datetime import datetime

from backend import accounts, library

PRIORITIES = ("HIGH", "NORMAL", "LOW")

SCHEMA = """
CREATE TABLE IF NOT EXISTS wishlist (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'WANTED'
        CHECK (state IN ('WANTED', 'RESERVED', 'ACQUIRED')),
    created_by TEXT NOT NULL,
    reserved_by TEXT,
    copy_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _connect():
    conn = accounts.connect()
    conn.executescript(SCHEMA)
    return conn


def clean(payload):
    title = library._text(payload.get("title"), 300, "el título", True)
    author = library._text(payload.get("author"), 200, "el autor")
    priority = payload.get("priority") or "NORMAL"

    if priority not in PRIORITIES:
        raise ValueError("Prioridad no válida.")

    cover = library._text(payload.get("cover"), 500, "la portada")

    return {
        "title": title,
        "author": author,
        "isbn": library.clean_isbn(payload.get("isbn")),
        "publisher": library._text(payload.get("publisher"), 120, "la editorial"),
        "edition_year": library._year(payload.get("edition_year")),
        "language": library._text(payload.get("language"), 40, "el idioma"),
        "cover": cover if cover.startswith("https://") else "",
        "priority": priority,
        "notes": library._text(payload.get("notes"), 2000, "las notas"),
    }


def matching_copies(data, copies):
    result = []

    for copy in copies:
        reason = None

        if data.get("isbn") and copy.get("isbn") == data["isbn"]:
            reason = "Mismo ISBN"
        elif library._norm(copy["title"]) == library._norm(data["title"]):
            left = library._norm(copy.get("author"))
            right = library._norm(data.get("author"))

            if left and right and left == right:
                reason = "Mismo título y autor"
            elif not left or not right:
                reason = "Posible coincidencia de título"

        if reason:
            result.append({**copy, "matchReason": reason})

    return result


def list_items():
    users = {u["id"]: u["name"] for u in accounts.list_users()}
    houses = {h["id"]: h["name"] for h in library.list_houses()}
    copies = library.list_copies()

    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT id, data, state, created_by, reserved_by, copy_id, created_at, updated_at "
            "FROM wishlist"
        ).fetchall()

    result = []

    for row in rows:
        data = json.loads(row[1])

        matches = [
            {
                "id": c["id"],
                "houseName": houses.get(c["houseId"], "Casa desconocida"),
                "loanTo": c.get("loanTo"),
                "matchReason": c["matchReason"],
            }
            for c in matching_copies(data, copies)
        ]

        result.append({
            **data,
            "id": row[0],
            "state": row[2],
            "createdBy": row[3],
            "requestedName": users.get(row[3], "Otro perfil"),
            "reservedBy": row[4],
            "reservedName": users.get(row[4]),
            "copyId": row[5],
            "createdAt": row[6],
            "updatedAt": row[7],
            "matches": matches,
        })

    priority_order = {"HIGH": 0, "NORMAL": 1, "LOW": 2}
    result.sort(key=lambda item: (
        item["state"] == "ACQUIRED",
        priority_order.get(item["priority"], 1),
        item["title"].casefold(),
    ))

    return result


def create(payload, user):
    data = clean(payload)
    wish_id = uuid.uuid4().hex[:12]
    now = _now()

    with closing(_connect()) as conn:
        with conn:
            conn.execute(
                "INSERT INTO wishlist "
                "(id, data, state, created_by, created_at, updated_at) "
                "VALUES (?, ?, 'WANTED', ?, ?, ?)",
                (wish_id, json.dumps(data, ensure_ascii=False), user["id"], now, now),
            )

    return wish_id


def update(wish_id, payload):
    data = clean(payload)

    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT state FROM wishlist WHERE id = ?", (wish_id,)
        ).fetchone()

        if row is None:
            raise KeyError(wish_id)
        if row[0] == "ACQUIRED":
            raise ValueError("Este deseo ya está conseguido. Edita su ejemplar desde Estanterías.")

        with conn:
            conn.execute(
                "UPDATE wishlist SET data = ?, updated_at = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=False), _now(), wish_id),
            )


def delete(wish_id):
    with closing(_connect()) as conn:
        with conn:
            if conn.execute(
                "DELETE FROM wishlist WHERE id = ?", (wish_id,)
            ).rowcount == 0:
                raise KeyError(wish_id)


def reserve(wish_id, user, reserved):
    with closing(_connect()) as conn:
        with conn:
            row = conn.execute(
                "SELECT state, reserved_by FROM wishlist WHERE id = ?",
                (wish_id,),
            ).fetchone()

            if row is None:
                raise KeyError(wish_id)
            if row[0] == "ACQUIRED":
                raise ValueError("Este libro ya está conseguido.")

            current = row[1]

            if reserved and current and current != user["id"]:
                raise PermissionError("Otro perfil ya se encarga de este libro.")

            if not reserved and current and current != user["id"] and not user.get("isOwner"):
                raise PermissionError("Solo quien se encarga, o el perfil principal, puede liberar la reserva.")

            conn.execute(
                "UPDATE wishlist SET state = ?, reserved_by = ?, updated_at = ? WHERE id = ?",
                (
                    "RESERVED" if reserved else "WANTED",
                    user["id"] if reserved else None,
                    _now(),
                    wish_id,
                ),
            )


def acquire(wish_id, payload, user, allow_duplicate=False):
    house_ids, user_ids = library._context()

    with closing(_connect()) as conn:
        with conn:
            conn.execute("BEGIN IMMEDIATE")

            row = conn.execute(
                "SELECT data, state, reserved_by, copy_id FROM wishlist WHERE id = ?",
                (wish_id,),
            ).fetchone()

            if row is None:
                raise KeyError(wish_id)

            # Repetir la petición no crea otro ejemplar.
            if row[1] == "ACQUIRED":
                return row[3]

            if row[2] and row[2] != user["id"] and not user.get("isOwner"):
                raise PermissionError("Otro perfil se encarga de este libro.")

            wish = json.loads(row[0])
            merged = {
                **wish,
                **payload,
                "title": wish["title"],
                "author": wish["author"],
            }

            data = library.clean_copy(merged, house_ids, user_ids)

            existing_rows = conn.execute(
                "SELECT id, title, author, isbn FROM copy"
            ).fetchall()

            copies = [
                {"id": r[0], "title": r[1], "author": r[2], "isbn": r[3]}
                for r in existing_rows
            ]

            if matching_copies(data, copies) and not allow_duplicate:
                raise ValueError(
                    "Ya existe un ejemplar o una posible coincidencia. "
                    "Confirma que quieres registrar otro ejemplar."
                )

            copy_id = library._insert_copy(conn, data, user["id"])

            conn.execute(
                "UPDATE wishlist SET state = 'ACQUIRED', copy_id = ?, "
                "reserved_by = NULL, updated_at = ? WHERE id = ?",
                (copy_id, _now(), wish_id),
            )

    return copy_id