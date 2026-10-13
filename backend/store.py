"""Tus datos personales en SQLite, con historial de cambios, deshacer y copias de seguridad."""
import copy
import json
import shutil
import sqlite3
import time
from contextlib import closing
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_FILE = ROOT / "atlas.db"
LEGACY_FILE = ROOT / "reading_progress.json"
BACKUP_DIR = ROOT / "backups"

SCHEMA_VERSION = "1"
KEEP_BACKUPS = 30
KEEP_EVENTS = 200
BACKUP_EVERY_HOURS = 12

BOOK_STATES = ("LOCKED", "DISCOVERED", "READING", "READ")
TIERS = ("ESSENTIAL", "RECOMMENDED", "SPECIALIZED")
LIST_MARKS = ("mastered_regions", "mastered_authors", "discovered_regions", "discovered_authors")
CUSTOM = {"custom_books": "book", "custom_authors": "author", "custom_regions": "region"}
KNOWN = {"book_statuses", "book_metadata", "tier_overrides", "author_region_additions", *LIST_MARKS, *CUSTOM}

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS book_state (
  book_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('LOCKED', 'DISCOVERED', 'READING', 'READ')),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS book_metadata (
  book_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_record (
  kind TEXT NOT NULL CHECK (kind IN ('book', 'author', 'region')),
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS mark (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS tier_override (
  region_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('ESSENTIAL', 'RECOMMENDED', 'SPECIALIZED')),
  PRIMARY KEY (region_id, author_id)
);
CREATE TABLE IF NOT EXISTS author_region (
  author_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  PRIMARY KEY (author_id, region_id)
);
CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  snapshot TEXT NOT NULL
);
"""


def _now():
    return datetime.now().isoformat(timespec="seconds")


def migrated_file():
    return LEGACY_FILE.with_name("reading_progress.migrated.json")


def connect():
    conn = sqlite3.connect(DB_FILE, timeout=15)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.executescript(SCHEMA)
    return conn


def _set_meta(conn, key, value):
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def _sanitize(profile):
    clean = copy.deepcopy(profile)
    clean["book_statuses"] = {k: v for k, v in clean.get("book_statuses", {}).items() if v in BOOK_STATES}
    clean["tier_overrides"] = {k: v for k, v in clean.get("tier_overrides", {}).items() if v in TIERS and "::" in k}
    return clean


def _write(conn, profile):
    now = _now()

    existing = {row[0]: row[1] for row in conn.execute("SELECT book_id, state FROM book_state")}
    statuses = profile.get("book_statuses", {})
    for book_id, state in statuses.items():
        if existing.get(book_id) != state:
            conn.execute(
                "INSERT INTO book_state (book_id, state, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(book_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
                (book_id, state, now),
            )
    conn.executemany("DELETE FROM book_state WHERE book_id = ?", [(b,) for b in set(existing) - set(statuses)])

    conn.execute("DELETE FROM book_metadata")
    conn.executemany(
        "INSERT INTO book_metadata (book_id, data) VALUES (?, ?)",
        [(k, json.dumps(v, ensure_ascii=False)) for k, v in profile.get("book_metadata", {}).items()],
    )

    conn.execute("DELETE FROM custom_record")
    for key, kind in CUSTOM.items():
        seen, rows = set(), []
        for position, record in enumerate(profile.get(key, [])):
            record_id = str(record.get("id") or f"{kind}-{position}")
            if record_id in seen:
                continue
            seen.add(record_id)
            rows.append((kind, record_id, position, json.dumps(record, ensure_ascii=False)))
        conn.executemany("INSERT INTO custom_record (kind, id, position, data) VALUES (?, ?, ?, ?)", rows)

    conn.execute("DELETE FROM mark")
    for key in LIST_MARKS:
        ids = list(dict.fromkeys(profile.get(key, [])))
        conn.executemany("INSERT INTO mark (kind, id, position) VALUES (?, ?, ?)", [(key, i, n) for n, i in enumerate(ids)])

    conn.execute("DELETE FROM tier_override")
    tier_rows = []
    for key, tier in profile.get("tier_overrides", {}).items():
        region_id, _, author_id = key.partition("::")
        if region_id and author_id:
            tier_rows.append((region_id, author_id, tier))
    conn.executemany("INSERT INTO tier_override (region_id, author_id, tier) VALUES (?, ?, ?)", tier_rows)

    conn.execute("DELETE FROM author_region")
    pairs = {(a, r) for a, regions in profile.get("author_region_additions", {}).items() for r in regions}
    conn.executemany("INSERT INTO author_region (author_id, region_id) VALUES (?, ?)", sorted(pairs))

    extra = {k: v for k, v in profile.items() if k not in KNOWN}
    _set_meta(conn, "extra", json.dumps(extra, ensure_ascii=False))


def _read(conn, default):
    profile = copy.deepcopy(default)
    profile["book_statuses"] = {r[0]: r[1] for r in conn.execute("SELECT book_id, state FROM book_state")}
    profile["book_metadata"] = {r[0]: json.loads(r[1]) for r in conn.execute("SELECT book_id, data FROM book_metadata")}
    for key, kind in CUSTOM.items():
        profile[key] = [json.loads(r[0]) for r in conn.execute(
            "SELECT data FROM custom_record WHERE kind = ? ORDER BY position", (kind,))]
    for key in LIST_MARKS:
        profile[key] = [r[0] for r in conn.execute("SELECT id FROM mark WHERE kind = ? ORDER BY position", (key,))]
    profile["tier_overrides"] = {
        f"{r[0]}::{r[1]}": r[2] for r in conn.execute("SELECT region_id, author_id, tier FROM tier_override")
    }
    additions = {}
    for author_id, region_id in conn.execute("SELECT author_id, region_id FROM author_region ORDER BY author_id, region_id"):
        additions.setdefault(author_id, []).append(region_id)
    profile["author_region_additions"] = additions
    row = conn.execute("SELECT value FROM meta WHERE key = 'extra'").fetchone()
    if row:
        profile.update({k: v for k, v in json.loads(row[0]).items() if k not in KNOWN})
    return profile


def _initialize(conn, default):
    profile = copy.deepcopy(default)
    source = None
    if LEGACY_FILE.exists():
        saved = json.loads(LEGACY_FILE.read_text(encoding="utf-8-sig"))
        if not isinstance(saved, dict):
            raise RuntimeError("reading_progress.json no tiene un formato válido.")
        profile.update(saved)
        source = LEGACY_FILE.name
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copy2(LEGACY_FILE, BACKUP_DIR / f"reading_progress-antes-de-sqlite-{datetime.now():%Y%m%d-%H%M%S}.json")
    with conn:
        _write(conn, _sanitize(profile))
        _set_meta(conn, "schema_version", SCHEMA_VERSION)
        _set_meta(conn, "created_at", _now())
        if source:
            _set_meta(conn, "migrated_from", source)
    if source:
        LEGACY_FILE.replace(migrated_file())


def load_profile(default):
    with closing(connect()) as conn:
        if conn.execute("SELECT 1 FROM meta WHERE key = 'schema_version'").fetchone() is None:
            _initialize(conn, default)
        return _read(conn, default)


def _summary(before, after):
    old = before.get("book_statuses", {})
    new = after.get("book_statuses", {})
    changes = [{"book": k, "from": old.get(k, "LOCKED"), "to": v} for k, v in new.items() if old.get(k, "LOCKED") != v]
    return {
        "books": changes[:20],
        "customBooks": len(after.get("custom_books", [])) - len(before.get("custom_books", [])),
    }


def save_profile(profile, before, label):
    maybe_backup()
    with closing(connect()) as conn:
        with conn:
            _write(conn, profile)
            conn.execute(
                "INSERT INTO event (at, label, summary, snapshot) VALUES (?, ?, ?, ?)",
                (_now(), label, json.dumps(_summary(before, profile), ensure_ascii=False), json.dumps(before, ensure_ascii=False)),
            )
            conn.execute("DELETE FROM event WHERE id NOT IN (SELECT id FROM event ORDER BY id DESC LIMIT ?)", (KEEP_EVENTS,))


def undo_last():
    with closing(connect()) as conn:
        row = conn.execute("SELECT id, label, snapshot FROM event ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            raise ValueError("No hay cambios que deshacer.")
        with conn:
            _write(conn, json.loads(row[2]))
            conn.execute("DELETE FROM event WHERE id = ?", (row[0],))
        return row[1]


def history(limit=30):
    with closing(connect()) as conn:
        rows = conn.execute("SELECT id, at, label, summary FROM event ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{"id": r[0], "at": r[1], "label": r[2], "summary": json.loads(r[3])} for r in rows]


def backup(reason="auto"):
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    target = BACKUP_DIR / f"atlas-{datetime.now():%Y%m%d-%H%M%S}-{reason}.db"
    with closing(connect()) as source, closing(sqlite3.connect(target)) as destination:
        source.backup(destination)
    for old in sorted(BACKUP_DIR.glob("atlas-*.db"))[:-KEEP_BACKUPS]:
        old.unlink(missing_ok=True)
    return target


def maybe_backup():
    if not DB_FILE.exists():
        return None
    newest = max((p.stat().st_mtime for p in BACKUP_DIR.glob("atlas-*.db")), default=0) if BACKUP_DIR.exists() else 0
    if time.time() - newest >= BACKUP_EVERY_HOURS * 3600:
        return backup("auto")
    return None


def state_timestamps():
    if not DB_FILE.exists():
        return {}
    with closing(connect()) as conn:
        return {r[0]: r[1] for r in conn.execute("SELECT book_id, updated_at FROM book_state")}


def get_meta(key):
    if not DB_FILE.exists():
        return None
    with closing(connect()) as conn:
        row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None
