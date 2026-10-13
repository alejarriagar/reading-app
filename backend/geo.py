"""Ubica a los autores en el mapa mundial (país ISO) y en la línea temporal (época)."""
import re
import unicodedata
from collections import defaultdict

READ = {"READ", "MASTERED"}
TIER_ORDER = {"ESSENTIAL": 0, "RECOMMENDED": 1, "SPECIALIZED": 2}


def _norm(value):
    value = unicodedata.normalize("NFD", str(value or "").casefold())
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return " ".join(value.split())


# Código ISO 3166-1 numérico (el que usa el mapa) -> nombres posibles, incluidos estados históricos.
_GROUPS = {
    ("643", "Rusia"): ["rusia", "imperio ruso", "union sovietica", "union de republicas socialistas sovieticas",
                       "federacion de rusia", "rusia sovietica", "zarato ruso",
                       "republica socialista federativa sovietica de rusia"],
    ("724", "España"): ["espana", "corona de castilla", "monarquia hispanica", "reino de espana", "corona de aragon",
                        "segunda republica espanola", "espana franquista", "estado espanol", "primera republica espanola"],
    ("250", "Francia"): ["francia", "reino de francia", "primer imperio frances", "segundo imperio frances",
                         "tercera republica francesa", "primera republica francesa", "republica francesa",
                         "segunda republica francesa", "cuarta republica francesa", "quinta republica francesa"],
    ("826", "Reino Unido"): ["reino unido", "reino unido de gran bretana e irlanda", "reino de inglaterra",
                             "reino unido de gran bretana e irlanda del norte", "inglaterra", "escocia", "gales",
                             "reino de gran bretana", "reino de escocia", "irlanda del norte", "gran bretana"],
    ("372", "Irlanda"): ["irlanda", "estado libre irlandes", "republica de irlanda"],
    ("840", "Estados Unidos"): ["estados unidos", "estados unidos de america", "eeuu"],
    ("392", "Japón"): ["japon", "imperio del japon", "imperio de japon"],
    ("276", "Alemania"): ["alemania", "imperio aleman", "republica de weimar", "alemania nazi", "reino de prusia",
                          "prusia", "republica federal de alemania", "republica democratica alemana",
                          "confederacion germanica", "sacro imperio romano germanico", "reino de baviera",
                          "reino de sajonia", "confederacion alemana del norte"],
    ("040", "Austria"): ["austria", "austria hungria", "imperio austriaco", "imperio austrohungaro",
                         "primera republica de austria", "cisleitania", "archiducado de austria"],
    ("756", "Suiza"): ["suiza"],
    ("203", "Chequia"): ["chequia", "republica checa", "checoslovaquia", "bohemia", "reino de bohemia", "europa central"],
    ("380", "Italia"): ["italia", "reino de italia", "republica de florencia", "republica de venecia"],
    ("300", "Grecia"): ["grecia", "antigua grecia", "atenas", "reino de grecia"],
    ("620", "Portugal"): ["portugal", "reino de portugal"],
    ("410", "Corea del Sur"): ["corea del sur", "corea"],
    ("578", "Noruega"): ["noruega"],
    ("752", "Suecia"): ["suecia"],
    ("208", "Dinamarca"): ["dinamarca"],
    ("246", "Finlandia"): ["finlandia", "gran ducado de finlandia"],
    ("352", "Islandia"): ["islandia"],
    ("616", "Polonia"): ["polonia", "reino de polonia", "zarato de polonia", "segunda republica polaca"],
    ("348", "Hungría"): ["hungria", "reino de hungria"],
    ("642", "Rumanía"): ["rumania", "reino de rumania"],
    ("804", "Ucrania"): ["ucrania"],
    ("112", "Bielorrusia"): ["bielorrusia"],
    ("528", "Países Bajos"): ["paises bajos", "holanda"],
    ("056", "Bélgica"): ["belgica"],
    ("032", "Argentina"): ["argentina"],
    ("484", "México"): ["mexico"],
    ("170", "Colombia"): ["colombia"],
    ("152", "Chile"): ["chile"],
    ("604", "Perú"): ["peru"],
    ("858", "Uruguay"): ["uruguay"],
    ("192", "Cuba"): ["cuba"],
    ("862", "Venezuela"): ["venezuela"],
    ("076", "Brasil"): ["brasil", "imperio del brasil"],
    ("320", "Guatemala"): ["guatemala"],
    ("558", "Nicaragua"): ["nicaragua"],
    ("124", "Canadá"): ["canada"],
    ("036", "Australia"): ["australia"],
    ("356", "India"): ["india", "india britanica"],
    ("156", "China"): ["china", "republica popular china", "republica de china"],
    ("422", "Líbano"): ["libano"],
    ("376", "Israel"): ["israel"],
    ("818", "Egipto"): ["egipto"],
    ("792", "Turquía"): ["turquia", "imperio otomano"],
    ("364", "Irán"): ["iran", "persia"],
    ("566", "Nigeria"): ["nigeria"],
    ("710", "Sudáfrica"): ["sudafrica"],
    ("404", "Kenia"): ["kenia"],
}
COUNTRIES = {_norm(alias): key for key, aliases in _GROUPS.items() for alias in aliases}


def country_of(raw):
    if not raw:
        return None
    for part in re.split(r"[/,;]", str(raw)):
        hit = COUNTRIES.get(_norm(part))
        if hit:
            return hit
    return None


_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50}


def _roman(text):
    total, previous = 0, 0
    for char in reversed(text):
        value = _ROMAN[char]
        total = total - value if value < previous else total + value
        previous = max(previous, value)
    return total


def century_of(author):
    birth = author.get("birth")
    if isinstance(birth, int):
        active = birth + 35
        return (active - 1) // 100 + 1 if active > 0 else -((-active) // 100 + 1)
    raw = str(author.get("period") or "")
    key = _norm(raw)
    if "antig" in key:
        return -4
    if "medieval" in key or "edad media" in key:
        return 12
    if "renacim" in key:
        return 16
    match = re.search(r"\b([IVXL]+)\b", raw.upper())
    return _roman(match.group(1)) if match else None


BUCKETS = [
    ("ancient", "Antigüedad", "hasta s. V"),
    ("medieval", "Edad Media", "s. VI–XIV"),
    ("c15", "Siglo XV", "1401–1500"),
    ("c16", "Siglo XVI", "1501–1600"),
    ("c17", "Siglo XVII", "1601–1700"),
    ("c18", "Siglo XVIII", "1701–1800"),
    ("c19", "Siglo XIX", "1801–1900"),
    ("c20", "Siglo XX", "1901–2000"),
    ("c21", "Siglo XXI", "2001–"),
]


def bucket_of(century):
    if century <= 5:
        return "ancient"
    if century <= 14:
        return "medieval"
    return f"c{min(century, 21)}"


def _finish(group, authors):
    entries = group["authors"]
    read = sum(1 for e in entries if e["state"] in READ)
    reading = sum(1 for e in entries if e["state"] == "READING")
    discovered = sum(1 for e in entries if e["state"] == "DISCOVERED")
    group["total"] = len(entries)
    group["read"] = read
    group["reading"] = reading
    group["rate"] = read / len(entries) if entries else 0.0
    group["state"] = "READ" if read else "READING" if reading else "DISCOVERED" if discovered else "LOCKED"
    entries.sort(key=lambda e: (0 if e["state"] in READ else 1, TIER_ORDER.get(e["tier"], 3), authors[e["id"]]["name"]))
    return group


def world_summary(authors, author_state, books_by_author):
    countries = {}
    buckets = {bid: {"id": bid, "label": label, "range": span, "authors": [], "booksRead": 0}
               for bid, label, span in BUCKETS}
    unplaced = defaultdict(int)

    for author_id, author in authors.items():
        state = author_state(author_id)
        books_read = sum(1 for b in books_by_author.get(author_id, []) if b["state"] == "READ")
        entry = {"id": author_id, "tier": author.get("tier", "SPECIALIZED"), "state": state}

        hit = country_of(author.get("country"))
        if hit:
            code, name = hit
            group = countries.setdefault(code, {"id": code, "name": name, "authors": [], "booksRead": 0})
            group["authors"].append(entry)
            group["booksRead"] += books_read
        else:
            unplaced[str(author.get("country") or "Sin país")] += 1

        century = century_of(author)
        if century is not None:
            bucket = buckets[bucket_of(century)]
            bucket["authors"].append(dict(entry))
            bucket["booksRead"] += books_read

    timeline = [_finish(buckets[bid], authors) for bid, _, _ in BUCKETS]
    filled = [i for i, b in enumerate(timeline) if b["total"]]
    if filled:
        timeline = timeline[filled[0]:filled[-1] + 1]

    names = sorted(unplaced.items(), key=lambda item: -item[1])[:10]
    return {
        "countries": sorted((_finish(g, authors) for g in countries.values()), key=lambda g: g["name"]),
        "timeline": timeline,
        "unplaced": sum(unplaced.values()),
        "unplacedNames": [f"{name} ({count})" for name, count in names],
    }