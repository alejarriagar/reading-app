"""Perfiles, PIN, sesiones y caminos compartidos entre perfiles.

Cada perfil tiene su propia base de datos de lecturas. El perfil principal
usa la base de datos original (atlas.db), así que no se pierde nada.
"""
import hashlib
import hmac
import json
import secrets
import sqlite3
import time
import uuid
from contextlib import closing
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACCOUNTS_FILE = ROOT / "data" / "accounts.db"
OWNER_DIR = ROOT
PROFILES_DIR = ROOT / "data" / "profiles"

MIN_PIN = 6
MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60
SESSION_DAYS = 30
_FAILURES = {}


class TooManyAttempts(Exception):
    pass


SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  is_owner INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS shared_path (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  position INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""


def connect():
    ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(ACCOUNTS_FILE, timeout=15)
    conn.executescript(SCHEMA)
    return conn


def _now():
    return datetime.now().isoformat(timespec="seconds")


def _hash_pin(pin, salt):
    return hashlib.scrypt(pin.encode("utf-8"), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32).hex()


def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _clean_name(name):
    name = str(name or "").strip()
    if not 1 <= len(name) <= 40:
        raise ValueError("El nombre debe tener entre 1 y 40 caracteres.")
    return name


def _check_pin(pin):
    pin = str(pin or "")
    if len(pin) < MIN_PIN:
        raise ValueError(f"El PIN o contraseña debe tener al menos {MIN_PIN} caracteres.")
    if len(pin) > 128:
        raise ValueError("El PIN o contraseña es demasiado largo.")
    return pin


def _user(row):
    return {"id": row[0], "name": row[1], "isOwner": bool(row[2])} if row else None


def has_users():
    with closing(connect()) as conn:
        return conn.execute("SELECT 1 FROM user LIMIT 1").fetchone() is not None


def list_users():
    with closing(connect()) as conn:
        rows = conn.execute("SELECT id, name, is_owner FROM user ORDER BY is_owner DESC, name").fetchall()
    return [_user(r) for r in rows]


def create_user(name, pin, is_owner=False):
    name = _clean_name(name)
    pin = _check_pin(pin)
    salt = secrets.token_hex(16)
    user_id = uuid.uuid4().hex[:12]
    with closing(connect()) as conn:
        if is_owner and conn.execute("SELECT 1 FROM user WHERE is_owner = 1").fetchone():
            raise ValueError("Ya existe un perfil principal.")
        try:
            with conn:
                conn.execute(
                    "INSERT INTO user (id, name, pin_hash, salt, is_owner, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (user_id, name, _hash_pin(pin, salt), salt, 1 if is_owner else 0, _now()),
                )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Ya existe un perfil con ese nombre.") from exc
    return {"id": user_id, "name": name, "isOwner": bool(is_owner)}


def verify(user_id, pin):
    now = time.time()
    recent = [t for t in _FAILURES.get(user_id, []) if now - t < LOCK_SECONDS]
    _FAILURES[user_id] = recent
    if len(recent) >= MAX_FAILURES:
        raise TooManyAttempts("Demasiados intentos fallidos. Espera 15 minutos.")
    with closing(connect()) as conn:
        row = conn.execute("SELECT pin_hash, salt FROM user WHERE id = ?", (user_id,)).fetchone()
    ok = bool(row) and hmac.compare_digest(row[0], _hash_pin(str(pin or ""), row[1]))
    if ok:
        _FAILURES.pop(user_id, None)
    else:
        _FAILURES[user_id].append(now)
    return ok


def change_pin(user_id, old_pin, new_pin):
    if not verify(user_id, old_pin):
        raise ValueError("El PIN actual no es correcto.")
    new_pin = _check_pin(new_pin)
    salt = secrets.token_hex(16)
    with closing(connect()) as conn:
        with conn:
            conn.execute("UPDATE user SET pin_hash = ?, salt = ? WHERE id = ?", (_hash_pin(new_pin, salt), salt, user_id))


def create_session(user_id):
    token = secrets.token_urlsafe(32)
    with closing(connect()) as conn:
        with conn:
            conn.execute("DELETE FROM session WHERE expires_at < ?", (time.time(),))
            conn.execute(
                "INSERT INTO session (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (_hash_token(token), user_id, time.time() + SESSION_DAYS * 86400),
            )
    return token


def session_user(token):
    if not token:
        return None
    with closing(connect()) as conn:
        row = conn.execute(
            "SELECT u.id, u.name, u.is_owner FROM session s JOIN user u ON u.id = s.user_id "
            "WHERE s.token_hash = ? AND s.expires_at > ?",
            (_hash_token(token), time.time()),
        ).fetchone()
    return _user(row)


def delete_session(token):
    if not token:
        return
    with closing(connect()) as conn:
        with conn:
            conn.execute("DELETE FROM session WHERE token_hash = ?", (_hash_token(token),))


def user_files(user):
    """Base de datos, carpeta de copias y archivo antiguo de cada perfil."""
    if user.get("isOwner"):
        base = OWNER_DIR
    else:
        base = PROFILES_DIR / user["id"]
        base.mkdir(parents=True, exist_ok=True)
    return base / "atlas.db", base / "backups", base / "reading_progress.json"


# --------------------------- caminos compartidos ---------------------------

def list_shared():
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT p.id, p.owner_id, p.data, u.name FROM shared_path p "
            "LEFT JOIN user u ON u.id = p.owner_id ORDER BY p.position, p.updated_at"
        ).fetchall()
    return [{**json.loads(r[2]), "id": r[0], "ownerId": r[1], "ownerName": r[3]} for r in rows]


def add_shared(path, owner_id):
    with closing(connect()) as conn:
        with conn:
            position = conn.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM shared_path").fetchone()[0]
            conn.execute(
                "INSERT OR IGNORE INTO shared_path (id, owner_id, position, data, updated_at) VALUES (?, ?, ?, ?, ?)",
                (path["id"], owner_id, position, json.dumps(path, ensure_ascii=False), _now()),
            )


def _check_owner(conn, path_id, user_id, verb):
    row = conn.execute("SELECT owner_id FROM shared_path WHERE id = ?", (path_id,)).fetchone()
    if row is None:
        raise KeyError(path_id)
    if row[0] is not None and row[0] != user_id:
        raise PermissionError(f"Solo quien creó este camino puede {verb}. Puedes personalizarlo para tener tu propia versión.")


def update_shared(path_id, path, user_id):
    with closing(connect()) as conn:
        with conn:
            _check_owner(conn, path_id, user_id, "editarlo")
            conn.execute(
                "UPDATE shared_path SET data = ?, updated_at = ? WHERE id = ?",
                (json.dumps(path, ensure_ascii=False), _now(), path_id),
            )


def delete_shared(path_id, user_id):
    with closing(connect()) as conn:
        with conn:
            _check_owner(conn, path_id, user_id, "eliminarlo")
            conn.execute("DELETE FROM shared_path WHERE id = ?", (path_id,))