"""Historial de lecturas de cada obra: fechas de inicio y fin, y relecturas.

Una lectura tiene estado "open" (en curso) o "done" (terminada).
Las fechas admiten AAAA, AAAA-MM o AAAA-MM-DD.
"""
import re
import uuid
from collections import defaultdict
from datetime import date, datetime

DATE_RE = re.compile(r"^\d{4}(-\d{2}){0,2}$")
FORMATS = {4: "%Y", 7: "%Y-%m", 10: "%Y-%m-%d"}


def today():
    return date.today().isoformat()


def clean_date(value):
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None
    if not DATE_RE.match(value):
        raise ValueError(f"Fecha no válida: «{value}». Usa AAAA, AAAA-MM o AAAA-MM-DD.")
    try:
        datetime.strptime(value, FORMATS[len(value)])
    except ValueError as exc:
        raise ValueError(f"Fecha no válida: «{value}».") from exc
    return value


def _new(book_id, status, started=None, finished=None, reread=False, note=""):
    return {
        "id": uuid.uuid4().hex[:12],
        "book": book_id,
        "status": status,
        "started": started,
        "finished": finished,
        "reread": bool(reread),
        "note": note or "",
    }


def index(profile):
    result = defaultdict(list)
    for item in profile.get("readings", []):
        result[item["book"]].append(item)
    return result


def for_book(profile, book_id):
    return [r for r in profile.get("readings", []) if r["book"] == book_id]


def _open(profile, book_id):
    return next((r for r in for_book(profile, book_id) if r.get("status") == "open"), None)


def _done(profile, book_id):
    return [r for r in for_book(profile, book_id) if r.get("status") == "done"]


def replace(profile, book_id, items):
    clean, seen = [], set()
    for item in items:
        status = item.get("status") or "done"
        if status not in ("open", "done"):
            raise ValueError("Estado de lectura no válido.")
        started = clean_date(item.get("started"))
        finished = clean_date(item.get("finished")) if status == "done" else None
        if started and finished:
            n = min(len(started), len(finished))
            if finished[:n] < started[:n]:
                raise ValueError("La fecha de fin es anterior a la de inicio.")
        reading_id = str(item.get("id") or uuid.uuid4().hex[:12])
        if reading_id in seen:
            reading_id = uuid.uuid4().hex[:12]
        seen.add(reading_id)
        clean.append({
            "id": reading_id,
            "book": book_id,
            "status": status,
            "started": started,
            "finished": finished,
            "reread": bool(item.get("reread")),
            "note": str(item.get("note") or "")[:500],
        })
    if sum(1 for r in clean if r["status"] == "open") > 1:
        raise ValueError("Solo puede haber una lectura en curso por obra.")
    profile["readings"] = [r for r in profile.get("readings", []) if r["book"] != book_id] + clean


def apply_state(profile, book_id, old_state, new_state):
    """Mantiene las lecturas coherentes con el estado de la obra."""
    current = _open(profile, book_id)
    readings = profile.setdefault("readings", [])
    if new_state == "READING":
        if current is None:
            readings.append(_new(book_id, "open", started=today(), reread=bool(_done(profile, book_id))))
    elif new_state == "READ":
        if current is not None:
            current["status"] = "done"
            current["finished"] = current.get("finished") or today()
        elif not _done(profile, book_id):
            readings.append(_new(book_id, "done", finished=today()))
    elif current is not None:
        profile["readings"] = [r for r in readings if r is not current]


def start_reread(profile, book_id):
    if _open(profile, book_id) is not None:
        raise ValueError("Ya hay una lectura en curso de esta obra.")
    profile.setdefault("readings", []).append(_new(book_id, "open", started=today(), reread=True))


def latest_year(profile, book_id):
    years = [int(r["finished"][:4]) for r in _done(profile, book_id) if r.get("finished")]
    return max(years) if years else None


def is_reread(profile, book_id):
    done = _done(profile, book_id)
    return len(done) > 1 or any(r.get("reread") for r in for_book(profile, book_id))


def fields(items):
    ordered = sorted(items, key=lambda r: (r.get("finished") or r.get("started") or "0000", r.get("status") == "open"))
    current = next((r for r in ordered if r.get("status") == "open"), None)
    done = [r for r in ordered if r.get("status") == "done"]
    dated = [r["finished"] for r in done if r.get("finished")]
    return {
        "readings": ordered,
        "currentReading": current,
        "lastFinished": max(dated) if dated else None,
        "readCount": len(done),
    }


def finished_by_year(profile, read_books):
    counts = defaultdict(int)
    dated_books = set()
    for r in profile.get("readings", []):
        if r.get("status") == "done" and r.get("finished"):
            counts[r["finished"][:4]] += 1
            dated_books.add(r["book"])
    for book in read_books:
        if book["id"] not in dated_books and book.get("year"):
            counts[str(book["year"])] += 1
    return dict(counts)


def initialize(profile):
    """Crea el historial a partir de los datos anteriores. Devuelve True si ha creado algo."""
    if profile.get("readings_initialized"):
        return False
    existing = {r["book"] for r in profile.get("readings", [])}
    metadata = profile.get("book_metadata", {})
    created = 0
    for book_id, state in profile.get("book_statuses", {}).items():
        if book_id in existing:
            continue
        info = metadata.get(book_id, {})
        if state == "READ":
            year = info.get("year")
            profile.setdefault("readings", []).append(
                _new(book_id, "done", finished=str(year) if year else None, reread=bool(info.get("reread"))))
            created += 1
        elif state == "READING":
            profile.setdefault("readings", []).append(_new(book_id, "open"))
            created += 1
    profile["readings_initialized"] = True
    return created > 0