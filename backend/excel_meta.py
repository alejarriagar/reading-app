import json
from contextlib import closing

from backend import accounts

SCHEMA = """
CREATE TABLE IF NOT EXISTS excel_copy_source (
    copy_id TEXT NOT NULL,
    row_key TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (copy_id, row_key)
);
CREATE TABLE IF NOT EXISTS excel_import_row (
    user_id TEXT NOT NULL,
    row_key TEXT NOT NULL,
    copy_id TEXT NOT NULL,
    PRIMARY KEY (user_id, row_key)
);
"""


def connect():
    conn = accounts.connect()
    conn.executescript(SCHEMA)
    return conn


def decorate(copies):
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT copy_id, data FROM excel_copy_source ORDER BY rowid"
        ).fetchall()

    sources = {}
    for copy_id, data in rows:
        sources.setdefault(copy_id, []).append(json.loads(data))

    for item in copies:
        imported = sources.get(item["id"], [])
        item["excelSources"] = imported
        item["excel"] = imported[0] if imported else None
        item["mediaKind"] = (
            imported[0].get("mediaKind", "BOOK") if imported else "BOOK"
        )

    return copies
