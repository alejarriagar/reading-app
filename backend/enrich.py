"""Amplía el catálogo con Wikidata (CC0) y portadas de Open Library.

Uso, desde la carpeta reading-app:
    python -m backend.enrich               (todo)
    python -m backend.enrich --no-covers   (sin portadas, más rápido)
    python -m backend.enrich --refresh     (ignora la caché y vuelve a descargar)

Solo escribe assets/wikidata.json y la caché _cache/. No modifica
reading_progress.json ni assets/catalog.json.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

from backend import store
from backend.atlas import CATALOG_FILE, DEFAULT_PROFILE, PATHS_FILE, ROOT, WIKIDATA_FILE, norm, read_json

UA = "AtlasLiterario/1.1 (https://github.com/alejarriagar/reading-app; personal reading app)"
SPARQL = "https://query.wikidata.org/sparql"
WD_API = "https://www.wikidata.org/w/api.php"
OL_SEARCH = "https://openlibrary.org/search.json"
CACHE_DIR = ROOT / "_cache" / "wikidata"

# Pausa mínima entre peticiones a cada servidor (segundos)
MIN_INTERVAL = {"query.wikidata.org": 2.0, "www.wikidata.org": 1.2, "openlibrary.org": 0.6}

# escritor, novelista, poeta, dramaturgo, ensayista
WRITERS = ["Q36180", "Q6625963", "Q49757", "Q214917", "Q11774202"]
THINKERS = WRITERS + ["Q4964182", "Q901", "Q4773904", "Q2306091", "Q1930187",
                      "Q188094", "Q11063", "Q4220892", "Q1622272"]

LATAM = ["Q414", "Q96", "Q739", "Q298", "Q419", "Q77", "Q241", "Q717"]

EXPANSIONS = {
    "ru_xix": {"countries": ["Q34266", "Q159"], "born": (1790, 1870), "period": "Siglo XIX", "country": "Rusia"},
    "ru_xx": {"countries": ["Q15180", "Q159", "Q34266"], "born": (1871, 1960), "period": "Siglo XX", "country": "Rusia"},
    "es_xvi": {"countries": ["Q29"], "born": (1480, 1620), "period": "Siglos XVI-XVII", "country": "España"},
    "es_xix": {"countries": ["Q29"], "born": (1790, 1865), "period": "Siglo XIX", "country": "España"},
    "es_xx": {"countries": ["Q29"], "born": (1866, 1960), "period": "Siglo XX", "country": "España"},
    "fr_xix": {"countries": ["Q142"], "born": (1770, 1860), "period": "Siglo XIX", "country": "Francia", "min_sitelinks": 40},
    "fr_xx": {"countries": ["Q142"], "born": (1861, 1960), "period": "Siglo XX", "country": "Francia", "min_sitelinks": 40},
    "uk_renaissance": {"countries": ["Q21", "Q179876"], "born": (1500, 1620), "period": "Renacimiento", "country": "Inglaterra"},
    "uk_xix": {"countries": ["Q174193", "Q145", "Q21", "Q22"], "born": (1760, 1860), "period": "Siglo XIX", "country": "Reino Unido", "min_sitelinks": 40},
    "uk_xx": {"countries": ["Q145", "Q174193", "Q21", "Q22"], "born": (1861, 1960), "period": "Siglo XX", "country": "Reino Unido", "min_sitelinks": 40},
    "jp_xx": {"countries": ["Q17", "Q188712"], "born": (1860, 1960), "period": "Siglo XX", "country": "Japón"},
    "us_literature": {"countries": ["Q30"], "born": (1800, 1960), "period": "Siglos XIX-XX", "country": "Estados Unidos", "min_sitelinks": 55},
    "latin_american": {"countries": LATAM, "born": (1850, 1960), "period": "Siglo XX", "country": "Latinoamérica"},
    "german_literature": {"countries": ["Q183", "Q40", "Q39", "Q43287", "Q28513"], "born": (1750, 1950), "period": "Siglos XVIII-XX", "country": "Lengua alemana", "min_sitelinks": 45},
}

MOVEMENT_REGIONS = [
    ("existencialis", "existentialism"),
    ("realis", "realism"),
    ("moderni", "modernism"),
    ("vanguard", "modernism"),
]


class RequestFailed(Exception):
    pass


def log(message):
    print(message, flush=True)


_last_call = {}


def throttle(url):
    host = urllib.parse.urlparse(url).netloc
    wait = MIN_INTERVAL.get(host, 0.5) - (time.monotonic() - _last_call.get(host, 0.0))
    if wait > 0:
        time.sleep(wait)
    _last_call[host] = time.monotonic()


def http_json(url, params=None, data=None, retries=5):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    body = urllib.parse.urlencode(data).encode("utf-8") if data else None
    headers = {"User-Agent": UA, "Accept": "application/sparql-results+json, application/json"}
    if body:
        headers["Content-Type"] = "application/x-www-form-urlencoded"

    for attempt in range(1, retries + 1):
        throttle(url)
        try:
            request = urllib.request.Request(url, data=body, headers=headers)
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503) and attempt < retries:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                wait = int(retry_after) if retry_after and retry_after.isdigit() else min(90, 15 * attempt)
                log(f"      el servidor pide ir más despacio: espero {wait}s…")
                time.sleep(wait)
                continue
            if exc.code in (500, 502, 504) and attempt < 2:
                log(f"      el servidor tardó demasiado ({exc.code}); reintento una vez…")
                time.sleep(10)
                continue
            raise RequestFailed(f"HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as exc:
            if attempt >= 3:
                raise RequestFailed(str(exc)) from exc
            time.sleep(5 * attempt)
    raise RequestFailed("demasiados reintentos")


def cached(kind, key, fetch):
    digest = hashlib.sha1(f"{kind}:{key}".encode("utf-8")).hexdigest()
    path = CACHE_DIR / f"{kind}-{digest}.json"
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass
    result = fetch()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result


def sparql(query):
    return cached("sparql", query, lambda: http_json(SPARQL, data={"query": query, "format": "json"})["results"]["bindings"])


def safe_sparql(query, label):
    try:
        return sparql(query)
    except RequestFailed as exc:
        log(f"      {label}: omitido ({exc})")
        return []


def val(row, key):
    return row.get(key, {}).get("value")


def qid(uri):
    return uri.rsplit("/", 1)[-1] if uri else None


def values(ids):
    return " ".join(f"wd:{item}" for item in ids)


def year(value):
    if not value:
        return None
    match = re.match(r"^(-?\d+)", value)
    return int(match.group(1)) if match else None


def chunks(items, size):
    items = list(items)
    for index in range(0, len(items), size):
        yield items[index:index + size]


def load_base():
    catalog = read_json(CATALOG_FILE)
    profile = store.load_profile(DEFAULT_PROFILE)
    regions = dict(catalog["regions"])
    for region in profile.get("custom_regions", []):
        regions[region["id"]] = region
    authors = dict(catalog["authors"])
    for author in profile.get("custom_authors", []):
        authors[author["id"]] = author
    books = list(catalog["books"]) + list(profile.get("custom_books", []))
    return regions, authors, books


def resolve_authors(authors, previous):
    resolved, pending = {}, {}
    for author_id, author in authors.items():
        known = previous.get(author_id, {}).get("qid")
        if known:
            resolved[author_id] = known
            continue
        name = author["name"]
        if " y " in name:
            continue
        try:
            ids = cached("search", name, lambda: [
                hit["id"] for hit in http_json(WD_API, params={
                    "action": "wbsearchentities", "search": name, "language": "es",
                    "uselang": "es", "type": "item", "limit": 6, "format": "json",
                }).get("search", [])
            ])
        except RequestFailed as exc:
            log(f"      sin respuesta para {name}: {exc}")
            continue
        if ids:
            pending[author_id] = ids

    fit = {}
    candidates = sorted({item for ids in pending.values() for item in ids})
    for chunk in chunks(candidates, 50):
        rows = safe_sparql(f"""
            SELECT ?item (COUNT(?occ) AS ?fit) WHERE {{
              VALUES ?item {{ {values(chunk)} }}
              ?item wdt:P31 wd:Q5 .
              OPTIONAL {{ ?item wdt:P106 ?occ . VALUES ?occ {{ {values(THINKERS)} }} }}
            }} GROUP BY ?item
        """, "comprobación de autores")
        for row in rows:
            fit[qid(val(row, "item"))] = int(val(row, "fit") or 0)

    for author_id, ids in pending.items():
        humans = [item for item in ids if item in fit]
        fitting = [item for item in humans if fit[item] > 0]
        choice = (fitting or humans or [None])[0]
        if choice:
            resolved[author_id] = choice
    return resolved


def expand_regions(regions, per_region):
    found = {}
    for region_id, cfg in EXPANSIONS.items():
        if region_id not in regions:
            continue
        low, high = cfg["born"]
        start = f"{low:04d}-01-01T00:00:00Z"
        end = f"{high + 1:04d}-01-01T00:00:00Z"
        minimum = cfg.get("min_sitelinks", 30)
        best = {}
        for occupation in WRITERS:
            rows = safe_sparql(f"""
                SELECT ?person ?sl WHERE {{
                  VALUES ?country {{ {values(cfg['countries'])} }}
                  ?person wdt:P106 wd:{occupation} ; wdt:P27 ?country .
                  ?person wdt:P569 ?birth . hint:Prior hint:rangeSafe true .
                  FILTER(?birth >= "{start}"^^xsd:dateTime && ?birth < "{end}"^^xsd:dateTime)
                  ?person wikibase:sitelinks ?sl .
                  FILTER(?sl >= {minimum})
                }} ORDER BY DESC(?sl) LIMIT {per_region * 2}
            """, f"{regions[region_id]['name']} ({occupation})")
            for row in rows:
                person = qid(val(row, "person"))
                best[person] = max(best.get(person, 0), int(val(row, "sl") or 0))
        top = sorted(best.items(), key=lambda item: -item[1])[:per_region]
        for person, sitelinks in top:
            entry = found.setdefault(person, {"regions": set(), "sitelinks": 0})
            entry["regions"].add(region_id)
            entry["sitelinks"] = max(entry["sitelinks"], sitelinks)
        log(f"      {regions[region_id]['name']}: {len(top)} autores")
    return found


def fetch_details(qids):
    details = {}
    for chunk in chunks(sorted(qids), 25):
        rows = safe_sparql(f"""
            SELECT ?person ?labelEs ?labelEn ?birth ?death ?image
              (GROUP_CONCAT(DISTINCT STR(?inf); separator="|") AS ?influences)
              (GROUP_CONCAT(DISTINCT ?movLabel; separator="|") AS ?movements)
              (SAMPLE(?countryLabel) AS ?country)
            WHERE {{
              VALUES ?person {{ {values(chunk)} }}
              OPTIONAL {{ ?person rdfs:label ?labelEs FILTER(LANG(?labelEs) = "es") }}
              OPTIONAL {{ ?person rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }}
              OPTIONAL {{ ?person wdt:P569 ?birth }}
              OPTIONAL {{ ?person wdt:P570 ?death }}
              OPTIONAL {{ ?person wdt:P18 ?image }}
              OPTIONAL {{ ?person wdt:P737 ?inf }}
              OPTIONAL {{ ?person wdt:P135 ?mov . ?mov rdfs:label ?movLabel FILTER(LANG(?movLabel) = "es") }}
              OPTIONAL {{ ?person wdt:P27 ?c . ?c rdfs:label ?countryLabel FILTER(LANG(?countryLabel) = "es") }}
            }} GROUP BY ?person ?labelEs ?labelEn ?birth ?death ?image
        """, "biografías")
        for row in rows:
            person = qid(val(row, "person"))
            if person in details:
                continue
            image = val(row, "image")
            if image:
                image = image.replace("http://", "https://") + "?width=240"
            details[person] = {
                "name": val(row, "labelEs") or val(row, "labelEn") or person,
                "birth": year(val(row, "birth")),
                "death": year(val(row, "death")),
                "image": image,
                "influences": [qid(u) for u in (val(row, "influences") or "").split("|") if u],
                "movements": [m for m in (val(row, "movements") or "").split("|") if m],
                "country": val(row, "country"),
            }
    return details


def parse_works(rows, works):
    for row in rows:
        works[qid(val(row, "person"))].append({
            "qid": qid(val(row, "work")),
            "title": val(row, "title"),
            "published": year(val(row, "published")),
            "popularity": int(val(row, "popularity") or 0),
        })


def fetch_works(qids):
    works = defaultdict(list)
    for chunk in chunks(sorted(qids), 20):
        parse_works(safe_sparql(f"""
            SELECT ?person ?work ?title (MIN(?date) AS ?published) (MAX(?wsl) AS ?popularity) WHERE {{
              VALUES ?person {{ {values(chunk)} }}
              ?person wdt:P800 ?work .
              ?work rdfs:label ?title . FILTER(LANG(?title) = "es")
              OPTIONAL {{ ?work wikibase:sitelinks ?wsl }}
              OPTIONAL {{ ?work wdt:P577 ?date }}
            }} GROUP BY ?person ?work ?title
        """, "obras destacadas"), works)

    missing = [person for person in qids if not works.get(person)]
    for chunk in chunks(sorted(missing), 5):
        parse_works(safe_sparql(f"""
            SELECT ?person ?work ?title (MIN(?date) AS ?published) (MAX(?wsl) AS ?popularity) WHERE {{
              VALUES ?person {{ {values(chunk)} }}
              ?work wdt:P50 ?person ; wikibase:sitelinks ?wsl .
              FILTER(?wsl >= 5)
              ?work rdfs:label ?title . FILTER(LANG(?title) = "es")
              OPTIONAL {{ ?work wdt:P577 ?date }}
            }} GROUP BY ?person ?work ?title
        """, "obras (búsqueda alternativa)"), works)

    return {person: sorted(items, key=lambda w: -w["popularity"]) for person, items in works.items()}


def movement_regions(movements, regions):
    found = set()
    for movement in movements:
        key = norm(movement)
        if "magic" in key:
            continue
        for needle, region_id in MOVEMENT_REGIONS:
            if needle in key and region_id in regions:
                found.add(region_id)
    return sorted(found)


def find_cover(title, author_name):
    surname = author_name.split()[-1] if author_name else ""
    for params in ({"title": title, "author": surname}, {"q": f"{title} {surname}".strip()}):
        try:
            data = http_json(OL_SEARCH, params={**params, "fields": "cover_i", "limit": 5}, retries=3)
        except RequestFailed:
            return None
        for doc in data.get("docs", []):
            if doc.get("cover_i"):
                return f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-M.jpg"
    return ""


def save(output):
    temporary = WIKIDATA_FILE.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(temporary, WIKIDATA_FILE)


def main():
    parser = argparse.ArgumentParser(description="Amplía el catálogo con Wikidata y Open Library.")
    parser.add_argument("--no-covers", action="store_true", help="No buscar portadas")
    parser.add_argument("--refresh", action="store_true", help="Borrar la caché y descargar de nuevo")
    parser.add_argument("--per-region", type=int, default=25, help="Autores máximos por territorio")
    parser.add_argument("--extra-works", type=int, default=2, help="Obras extra para autores existentes")
    args = parser.parse_args()

    if args.refresh and CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)

    regions, authors, books = load_base()
    previous = read_json(WIKIDATA_FILE) if WIKIDATA_FILE.exists() else {}
    paths = read_json(PATHS_FILE).get("paths", []) if PATHS_FILE.exists() else []

    log("1/5 · Identificando tus autores en Wikidata (va despacio a propósito)…")
    resolved = resolve_authors(authors, previous.get("enrich", {}))
    log(f"      {len(resolved)} de {len(authors)} autores identificados")

    log("2/5 · Buscando autores relevantes de cada territorio…")
    expansion = expand_regions(regions, args.per_region)

    qid_to_author = {}
    for author_id, person in resolved.items():
        qid_to_author.setdefault(person, author_id)
    new_qids = [person for person in expansion if person not in qid_to_author]

    log("3/5 · Descargando biografías, corrientes e influencias…")
    details = fetch_details(set(qid_to_author) | set(new_qids))
    log(f"      {len(details)} biografías")

    name_index = {norm(a["name"]): author_id for author_id, a in authors.items()}
    for person in new_qids:
        if person in details:
            qid_to_author[person] = name_index.get(norm(details[person]["name"]), f"wd-{person}")

    log("4/5 · Descargando obras destacadas…")
    works = fetch_works(set(qid_to_author))

    existing_titles = defaultdict(set)
    for book in books:
        existing_titles[book["author"]].add(norm(book["title"]))

    enrich, new_authors, new_books = {}, {}, []
    seen_authors, seen_books = set(), set()

    for person, author_id in qid_to_author.items():
        d = details.get(person)
        if not d or author_id in seen_authors:
            continue
        seen_authors.add(author_id)

        influenced_by = sorted({
            qid_to_author[i] for i in d["influences"]
            if i in qid_to_author and qid_to_author[i] != author_id
        })
        extra_regions = set(movement_regions(d["movements"], regions))
        if person in expansion:
            extra_regions |= expansion[person]["regions"]

        if author_id in authors:
            enrich[author_id] = {
                "qid": person, "birth": d["birth"], "death": d["death"], "image": d["image"],
                "influencedBy": influenced_by, "movements": d["movements"],
                "regions": sorted(extra_regions),
            }
            author_regions = sorted(set(authors[author_id].get("regions", [])) | extra_regions)
            limit = args.extra_works
        else:
            entry = expansion[person]
            cfg = EXPANSIONS[sorted(entry["regions"])[0]]
            author_regions = sorted(extra_regions)
            new_authors[author_id] = {
                "name": d["name"],
                "country": d["country"] or cfg["country"],
                "period": cfg["period"],
                "movements": d["movements"],
                "tier": "RECOMMENDED" if entry["sitelinks"] >= 80 else "SPECIALIZED",
                "regions": author_regions,
                "related": [],
                "qid": person, "birth": d["birth"], "death": d["death"], "image": d["image"],
                "influencedBy": influenced_by,
                "source": "wikidata",
            }
            limit = 3

        added = 0
        for work in works.get(person, []):
            if added >= limit:
                break
            key = norm(work["title"])
            book_id = f"wd-{work['qid']}"
            if not key or re.fullmatch(r"q\d+", key) or key in existing_titles[author_id] or book_id in seen_books:
                continue
            existing_titles[author_id].add(key)
            seen_books.add(book_id)
            new_books.append({
                "id": book_id, "title": work["title"], "author": author_id,
                "regions": author_regions, "published": work["published"], "source": "wikidata",
            })
            added += 1

    work_genres = {
        "Q8261": "NOVELA", "Q149537": "NOVELA",
        "Q49084": "RELATO", "Q1279564": "RELATO",
        "Q5185279": "POESIA", "Q12106333": "POESIA",
        "Q25379": "TEATRO",
        "Q35760": "ENSAYO",
    }
    work_qids = [b["id"][3:] for b in new_books if b["id"].startswith("wd-Q")]
    found_genres = {}
    for chunk in chunks(work_qids, 60):
        rows = safe_sparql(f"""
            SELECT ?work ?type WHERE {{
              VALUES ?work {{ {values(chunk)} }}
              ?work wdt:P31 ?type .
              VALUES ?type {{ {values(work_genres)} }}
            }}
        """, "tipos de obra")
        for row in rows:
            found_genres.setdefault(qid(val(row, "work")), work_genres[qid(val(row, "type"))])
    for book in new_books:
        genre = found_genres.get(book["id"][3:])
        if genre:
            book["wdGenre"] = genre

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Wikidata (CC0) y Open Library",
        "authors": new_authors,
        "enrich": enrich,
        "books": new_books,
        "covers": dict(previous.get("covers", {})),
    }
    save(output)
    influences = sum(len(a["influencedBy"]) for a in list(enrich.values()) + list(new_authors.values()))
    log(f"      Guardado: {len(new_authors)} autores nuevos · {len(new_books)} obras nuevas · {influences} influencias")

    if args.no_covers:
        log("5/5 · Portadas omitidas (--no-covers)")
        return

    log("5/5 · Buscando portadas en Open Library (Ctrl+C para cortar; se guarda lo hecho)…")
    all_authors = {**authors, **new_authors}
    targets = [(b["title"], all_authors.get(b["author"], {}).get("name", "")) for b in books + new_books]
    for path in paths:
        for author in path.get("authors", []):
            for work in author.get("works", []):
                targets.append((work["title"], author["name"]))

    covers = output["covers"]
    pending, queued = [], set()
    for title, author_name in targets:
        key = f"{norm(title)}|{norm(author_name)}"
        if key not in covers and key not in queued:
            queued.add(key)
            pending.append((key, title, author_name))

    try:
        for index, (key, title, author_name) in enumerate(pending, start=1):
            result = find_cover(title, author_name)
            if result is not None:
                covers[key] = result
            if index % 25 == 0 or index == len(pending):
                log(f"      {index}/{len(pending)} obras revisadas")
                save(output)
    except KeyboardInterrupt:
        log("      Interrumpido: se guardan las portadas encontradas hasta ahora.")
    save(output)
    log(f"      {sum(1 for url in covers.values() if url)} portadas disponibles")


if __name__ == "__main__":
    main()