import json
import uuid
from pathlib import Path

import streamlit as st


st.set_page_config(page_title="Atlas literario", page_icon="📚", layout="wide")

DATA_FILE = Path(__file__).resolve().parent / "reading_progress.json"
BOOK_STATES = ["LOCKED", "DISCOVERED", "READING", "READ"]
TIERS = ["ESSENTIAL", "RECOMMENDED", "SPECIALIZED"]

REGIONS = {
    "ru_xix": {"name": "🇷🇺 Rusia · Siglo XIX", "type": "País + periodo", "frontiers": ["ru_xx", "existentialism", "fr_xix", "es_xix"]},
    "ru_xx": {"name": "🇷🇺 Rusia · Siglo XX", "type": "País + periodo", "frontiers": ["modernism", "jp_xx"]},
    "es_xvi": {"name": "🇪🇸 España · Siglo XVI", "type": "País + periodo", "frontiers": ["es_xix", "uk_renaissance"]},
    "es_xix": {"name": "🇪🇸 España · Siglo XIX", "type": "País + periodo", "frontiers": ["fr_xix", "ru_xix", "es_xx"]},
    "es_xx": {"name": "🇪🇸 España · Siglo XX", "type": "País + periodo", "frontiers": ["modernism", "existentialism"]},
    "fr_xix": {"name": "🇫🇷 Francia · Siglo XIX", "type": "País + periodo", "frontiers": ["ru_xix", "es_xix", "fr_xx"]},
    "fr_xx": {"name": "🇫🇷 Francia · Siglo XX", "type": "País + periodo", "frontiers": ["existentialism", "modernism"]},
    "uk_xix": {"name": "🇬🇧 Reino Unido · Siglo XIX", "type": "País + periodo", "frontiers": ["uk_xx", "realism"]},
    "uk_xx": {"name": "🇬🇧 Reino Unido · Siglo XX", "type": "País + periodo", "frontiers": ["modernism", "existentialism"]},
    "uk_renaissance": {"name": "🇬🇧 Inglaterra · Renacimiento", "type": "País + periodo", "frontiers": ["uk_xix", "es_xvi"]},
    "jp_xx": {"name": "🇯🇵 Japón · Siglo XX", "type": "País + periodo", "frontiers": ["modernism", "ru_xx"]},
    "period_xix": {"name": "⏳ Literatura del siglo XIX", "type": "Periodo", "frontiers": ["modernism", "existentialism"]},
    "realism": {"name": "📚 Realismo", "type": "Movimiento", "frontiers": ["modernism", "existentialism"]},
    "existentialism": {"name": "🧠 Existencialismo", "type": "Movimiento", "frontiers": ["modernism", "fr_xx"]},
    "modernism": {"name": "📚 Modernismo y modernidad", "type": "Movimiento", "frontiers": ["jp_xx", "uk_xx"]},
    "psychological": {"name": "🧠 Novela psicológica", "type": "Tema", "frontiers": ["existentialism", "realism"]},
}

AUTHORS = {
    "dostoevsky": {"name": "Fiódor Dostoyevski", "country": "Rusia", "period": "Siglo XIX", "movements": ["Realismo", "novela psicológica"], "tier": "ESSENTIAL", "regions": ["ru_xix", "period_xix", "realism", "psychological", "existentialism"], "related": ["camus", "sartre"]},
    "tolstoy": {"name": "León Tolstói", "country": "Rusia", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "ESSENTIAL", "regions": ["ru_xix", "period_xix", "realism"], "related": ["dostoevsky", "chekhov"]},
    "chekhov": {"name": "Antón Chéjov", "country": "Rusia", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "ESSENTIAL", "regions": ["ru_xix", "period_xix", "realism"], "related": ["tolstoy", "turgenev"]},
    "gogol": {"name": "Nikolái Gógol", "country": "Rusia", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "ESSENTIAL", "regions": ["ru_xix", "period_xix", "realism"], "related": ["dostoevsky", "turgenev"]},
    "turgenev": {"name": "Iván Turguénev", "country": "Rusia", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "RECOMMENDED", "regions": ["ru_xix", "period_xix", "realism"], "related": ["dostoevsky", "chekhov"]},
    "goncharov": {"name": "Iván Goncharov", "country": "Rusia", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "RECOMMENDED", "regions": ["ru_xix", "period_xix", "realism"], "related": ["turgenev"]},
    "bulgakov": {"name": "Mijaíl Bulgákov", "country": "Rusia", "period": "Siglo XX", "movements": ["Sátira", "modernidad"], "tier": "ESSENTIAL", "regions": ["ru_xx", "modernism"], "related": []},
    "cervantes": {"name": "Miguel de Cervantes", "country": "España", "period": "Siglo XVI–XVII", "movements": ["Siglo de Oro"], "tier": "ESSENTIAL", "regions": ["es_xvi"], "related": ["shakespeare"]},
    "galdos": {"name": "Benito Pérez Galdós", "country": "España", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "ESSENTIAL", "regions": ["es_xix", "period_xix", "realism"], "related": ["flaubert", "balzac"]},
    "pardo_bazan": {"name": "Emilia Pardo Bazán", "country": "España", "period": "Siglo XIX", "movements": ["Realismo", "Naturalismo"], "tier": "RECOMMENDED", "regions": ["es_xix", "period_xix", "realism"], "related": ["galdos", "flaubert"]},
    "lorca": {"name": "Federico García Lorca", "country": "España", "period": "Siglo XX", "movements": ["Vanguardias"], "tier": "ESSENTIAL", "regions": ["es_xx", "modernism"], "related": []},
    "balzac": {"name": "Honoré de Balzac", "country": "Francia", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "ESSENTIAL", "regions": ["fr_xix", "period_xix", "realism"], "related": ["flaubert", "galdos"]},
    "flaubert": {"name": "Gustave Flaubert", "country": "Francia", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "ESSENTIAL", "regions": ["fr_xix", "period_xix", "realism"], "related": ["balzac", "galdos"]},
    "camus": {"name": "Albert Camus", "country": "Francia", "period": "Siglo XX", "movements": ["Existencialismo"], "tier": "ESSENTIAL", "regions": ["fr_xx", "existentialism"], "related": ["dostoevsky", "sartre"]},
    "sartre": {"name": "Jean-Paul Sartre", "country": "Francia", "period": "Siglo XX", "movements": ["Existencialismo"], "tier": "ESSENTIAL", "regions": ["fr_xx", "existentialism"], "related": ["dostoevsky", "camus"]},
    "austen": {"name": "Jane Austen", "country": "Reino Unido", "period": "Siglo XVIII–XIX", "movements": ["Novela de costumbres"], "tier": "ESSENTIAL", "regions": ["uk_xix"], "related": ["dickens"]},
    "dickens": {"name": "Charles Dickens", "country": "Reino Unido", "period": "Siglo XIX", "movements": ["Realismo"], "tier": "ESSENTIAL", "regions": ["uk_xix", "period_xix", "realism"], "related": ["austen"]},
    "woolf": {"name": "Virginia Woolf", "country": "Reino Unido", "period": "Siglo XX", "movements": ["Modernismo"], "tier": "ESSENTIAL", "regions": ["uk_xx", "modernism"], "related": []},
    "orwell": {"name": "George Orwell", "country": "Reino Unido", "period": "Siglo XX", "movements": ["Distopía"], "tier": "ESSENTIAL", "regions": ["uk_xx"], "related": []},
    "shakespeare": {"name": "William Shakespeare", "country": "Inglaterra", "period": "Renacimiento", "movements": ["Teatro isabelino"], "tier": "ESSENTIAL", "regions": ["uk_renaissance"], "related": ["cervantes"]},
    "murakami": {"name": "Haruki Murakami", "country": "Japón", "period": "Siglo XX–XXI", "movements": ["Literatura contemporánea"], "tier": "ESSENTIAL", "regions": ["jp_xx"], "related": ["akutagawa"]},
    "akutagawa": {"name": "Ryūnosuke Akutagawa", "country": "Japón", "period": "Siglo XX", "movements": ["Modernidad"], "tier": "RECOMMENDED", "regions": ["jp_xx", "modernism"], "related": ["murakami"]},
}

BOOKS = [
    {"id": "crime_punishment", "title": "Crimen y castigo", "author": "dostoevsky", "regions": ["ru_xix", "period_xix", "realism", "psychological", "existentialism"]},
    {"id": "war_and_peace", "title": "Guerra y paz", "author": "tolstoy", "regions": ["ru_xix", "period_xix", "realism"]},
    {"id": "cherry_orchard", "title": "El jardín de los cerezos", "author": "chekhov", "regions": ["ru_xix", "period_xix", "realism"]},
    {"id": "dead_souls", "title": "Almas muertas", "author": "gogol", "regions": ["ru_xix", "period_xix", "realism"]},
    {"id": "fathers_and_sons", "title": "Padres e hijos", "author": "turgenev", "regions": ["ru_xix", "period_xix", "realism"]},
    {"id": "oblomov", "title": "Oblómov", "author": "goncharov", "regions": ["ru_xix", "period_xix", "realism"]},
    {"id": "master_margarita", "title": "El maestro y Margarita", "author": "bulgakov", "regions": ["ru_xx", "modernism"]},
    {"id": "don_quixote", "title": "Don Quijote de la Mancha", "author": "cervantes", "regions": ["es_xvi"]},
    {"id": "fortunata_jacinta", "title": "Fortunata y Jacinta", "author": "galdos", "regions": ["es_xix", "period_xix", "realism"]},
    {"id": "pazos_ulloa", "title": "Los pazos de Ulloa", "author": "pardo_bazan", "regions": ["es_xix", "period_xix", "realism"]},
    {"id": "bernarda_alba", "title": "La casa de Bernarda Alba", "author": "lorca", "regions": ["es_xx", "modernism"]},
    {"id": "madame_bovary", "title": "Madame Bovary", "author": "flaubert", "regions": ["fr_xix", "period_xix", "realism"]},
    {"id": "pere_goriot", "title": "Papá Goriot", "author": "balzac", "regions": ["fr_xix", "period_xix", "realism"]},
    {"id": "the_stranger", "title": "El extranjero", "author": "camus", "regions": ["fr_xx", "existentialism"]},
    {"id": "nausea", "title": "La náusea", "author": "sartre", "regions": ["fr_xx", "existentialism"]},
    {"id": "pride_prejudice", "title": "Orgullo y prejuicio", "author": "austen", "regions": ["uk_xix"]},
    {"id": "david_copperfield", "title": "David Copperfield", "author": "dickens", "regions": ["uk_xix", "period_xix", "realism"]},
    {"id": "mrs_dalloway", "title": "La señora Dalloway", "author": "woolf", "regions": ["uk_xx", "modernism"]},
    {"id": "1984", "title": "1984", "author": "orwell", "regions": ["uk_xx"]},
    {"id": "hamlet", "title": "Hamlet", "author": "shakespeare", "regions": ["uk_renaissance"]},
    {"id": "norwegian_wood", "title": "Tokio blues (Norwegian Wood)", "author": "murakami", "regions": ["jp_xx"]},
    {"id": "rashomon", "title": "Rashōmon", "author": "akutagawa", "regions": ["jp_xx", "modernism"]},
]

DEFAULT_PROGRESS = {
    "book_statuses": {},
    "mastered_regions": [],
    "tier_overrides": {},
    "custom_books": [],
    "custom_authors": [],
    "custom_regions": [],
    "author_region_additions": {},
}


def load_progress():
    if DATA_FILE.exists():
        try:
            saved = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            result = dict(DEFAULT_PROGRESS)
            result.update(saved)
            return result
        except (json.JSONDecodeError, OSError):
            pass
    return json.loads(json.dumps(DEFAULT_PROGRESS))


def save_progress(progress):
    DATA_FILE.write_text(
        json.dumps(progress, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_regions(progress):
    result = dict(REGIONS)
    for region in progress["custom_regions"]:
        result[region["id"]] = region
    return result


def get_authors(progress):
    result = {
        key: {**value, "regions": list(value.get("regions", []))}
        for key, value in AUTHORS.items()
    }
    result.update({author["id"]: author for author in progress["custom_authors"]})

    for author_id, extra_regions in progress["author_region_additions"].items():
        if author_id in result:
            result[author_id]["regions"] = sorted(
                set(result[author_id].get("regions", []) + extra_regions)
            )
    return result


def get_books(progress):
    return BOOKS + progress["custom_books"]


def book_status(book_id, progress):
    return progress["book_statuses"].get(book_id, "LOCKED")


def region_authors(region_id, authors):
    return sorted(
        [author_id for author_id, author in authors.items()
         if region_id in author.get("regions", [])],
        key=lambda author_id: authors[author_id]["name"].casefold(),
    )


def author_status_in_region(author_id, region_id, books, progress):
    states = [
        book_status(book["id"], progress)
        for book in books
        if book["author"] == author_id and region_id in book.get("regions", [])
    ]
    if "READ" in states:
        return "READ"
    if "READING" in states:
        return "READING"
    return "DISCOVERED"


def region_status(region_id, books, progress):
    if region_id in progress["mastered_regions"]:
        return "MASTERED"

    states = [
        book_status(book["id"], progress)
        for book in books
        if region_id in book.get("regions", [])
    ]
    if "READ" in states:
        return "READ"
    if "READING" in states:
        return "READING"
    if "DISCOVERED" in states:
        return "DISCOVERED"
    return "LOCKED"


def region_tier(region_id, author_id, author, progress):
    key = f"{region_id}::{author_id}"
    return progress["tier_overrides"].get(key, author.get("tier", "SPECIALIZED"))


def region_stats(region_id, authors, books, progress):
    author_ids = region_authors(region_id, authors)
    completed = {
        author_id for author_id in author_ids
        if author_status_in_region(author_id, region_id, books, progress) == "READ"
    }

    counts = {}
    for tier in TIERS:
        tier_ids = [
            author_id for author_id in author_ids
            if region_tier(region_id, author_id, authors[author_id], progress) == tier
        ]
        counts[tier] = (
            sum(1 for author_id in tier_ids if author_id in completed),
            len(tier_ids),
        )

    overall = len(completed) / len(author_ids) if author_ids else 0.0
    return author_ids, counts, overall


if "literary_progress" not in st.session_state:
    st.session_state.literary_progress = load_progress()

progress = st.session_state.literary_progress
regions = get_regions(progress)
authors = get_authors(progress)
books = get_books(progress)

st.title("📚 Atlas literario")
st.caption(
    "Construye tu propio mapa de la literatura. Explora en cualquier orden: "
    "las sugerencias son opcionales, nunca un itinerario."
)

read_book_count = sum(
    1 for book in books if book_status(book["id"], progress) == "READ"
)
reading_book_count = sum(
    1 for book in books if book_status(book["id"], progress) == "READING"
)
visible_region_ids = [
    region_id for region_id in regions
    if region_status(region_id, books, progress) != "LOCKED"
]
read_author_ids = {
    book["author"] for book in books
    if book_status(book["id"], progress) == "READ"
}

metric_cols = st.columns(4)
metric_cols[0].metric("Obras leídas", read_book_count)
metric_cols[1].metric("En lectura", reading_book_count)
metric_cols[2].metric("Autores leídos", len(read_author_ids))
metric_cols[3].metric("Territorios descubiertos", len(visible_region_ids))
st.caption(
    f"Hay {len(regions) - len(visible_region_ids)} territorios bajo la niebla. "
    "El catálogo inicial es ilustrativo y puedes ampliarlo."
)

map_tab, library_tab, connections_tab, progress_tab = st.tabs(
    ["🗺️ Mapa", "📚 Biblioteca", "🔗 Conexiones", "📊 Mi exploración"]
)

with map_tab:
    st.subheader("Territorios descubiertos")

    if not visible_region_ids:
        st.info(
            "Tu mapa aún está oculto. Ve a Biblioteca y marca cualquier obra como "
            "DISCOVERED, READING o READ para revelar su territorio."
        )
    else:
        cards = st.columns(min(3, len(visible_region_ids)))
        for index, region_id in enumerate(visible_region_ids):
            with cards[index % len(cards)]:
                _, _, rate = region_stats(region_id, authors, books, progress)
                st.markdown(f"**{regions[region_id]['name']}**")
                st.caption(
                    f"{region_status(region_id, books, progress)} · "
                    f"{rate:.0%} explorado"
                )
                st.progress(rate)

        selected_region_id = st.selectbox(
            "Elige libremente un territorio para explorarlo",
            visible_region_ids,
            format_func=lambda region_id: regions[region_id]["name"],
        )

        st.divider()
        region = regions[selected_region_id]
        st.subheader(region["name"])
        st.caption(f"Tipo de región: {region.get('type', 'Personalizada')}")

        author_ids, counts, overall = region_stats(
            selected_region_id, authors, books, progress
        )

        progress_col, essential_col, recommended_col, specialized_col = st.columns(4)
        progress_col.metric("Exploración total", f"{overall:.0%}")
        essential_col.metric(
            "ESSENTIAL",
            f"{counts['ESSENTIAL'][0]} / {counts['ESSENTIAL'][1]}",
        )
        recommended_col.metric(
            "RECOMMENDED",
            f"{counts['RECOMMENDED'][0]} / {counts['RECOMMENDED'][1]}",
        )
        specialized_col.metric(
            "SPECIALIZED",
            f"{counts['SPECIALIZED'][0]} / {counts['SPECIALIZED'][1]}",
        )

        st.progress(overall)
        st.caption(
            "El porcentaje cuenta autores con al menos una obra leída; leer un libro "
            "no marca una región como dominada."
        )

        st.markdown("#### Autores de esta región")
        if not author_ids:
            st.info("Aún no hay autores asociados a esta región.")
        else:
            for author_id in author_ids:
                author = authors[author_id]
                override_key = f"{selected_region_id}::{author_id}"
                current_tier = progress["tier_overrides"].get(
                    override_key, author.get("tier", "SPECIALIZED")
                )
                current_state = author_status_in_region(
                    author_id, selected_region_id, books, progress
                )

                name_col, tier_col, state_col = st.columns([4, 2, 2])
                name_col.write(author["name"])
                new_tier = tier_col.selectbox(
                    "Clasificación",
                    TIERS,
                    index=TIERS.index(current_tier),
                    key=f"tier_{selected_region_id}_{author_id}",
                    label_visibility="collapsed",
                )
                state_col.write(current_state)

                if new_tier != current_tier:
                    progress["tier_overrides"][override_key] = new_tier
                    save_progress(progress)
                    st.rerun()

        is_mastered = selected_region_id in progress["mastered_regions"]
        button_text = (
            "Quitar estado MASTERED"
            if is_mastered
            else "Marcar región como MASTERED"
        )
        if st.button(button_text, key=f"master_{selected_region_id}"):
            if is_mastered:
                progress["mastered_regions"].remove(selected_region_id)
            else:
                progress["mastered_regions"].append(selected_region_id)
            save_progress(progress)
            st.rerun()

        st.caption(
            "MASTERED es una marca manual y opcional; nunca se asigna por leer "
            "una sola obra."
        )

        frontier_ids = [
            frontier_id for frontier_id in region.get("frontiers", [])
            if frontier_id in regions
        ]
        if frontier_ids and (overall >= 0.25 or is_mastered):
            st.markdown("#### Fronteras opcionales")
            st.write(
                "Estos territorios están conectados. Tú decides si quieres "
                "continuar hacia ellos:"
            )
            st.write(" · ".join(regions[item]["name"] for item in frontier_ids))


with library_tab:
    st.subheader("Biblioteca")
    st.write(
        "Busca una obra y cambia su estado cuando quieras. "
        "Puedes empezar por cualquier libro."
    )

    search = st.text_input("Buscar por título o autor")
    authors = get_authors(progress)
    books = get_books(progress)
    regions = get_regions(progress)

    query = search.strip().casefold()
    filtered_books = []
    for book in books:
        author_name = authors.get(book["author"], {}).get("name", "Autor desconocido")
        if not query or query in book["title"].casefold() or query in author_name.casefold():
            filtered_books.append(book)

    if filtered_books:
        rows = []
        for book in filtered_books:
            author_name = authors.get(book["author"], {}).get("name", "Autor desconocido")
            status = book_status(book["id"], progress)
            region_names = (
                "🌫️ Sin explorar"
                if status == "LOCKED"
                else ", ".join(
                    regions[region_id]["name"]
                    for region_id in book.get("regions", [])
                    if region_id in regions
                )
            )
            rows.append({
                "Obra": book["title"],
                "Autor": author_name,
                "Estado": status,
                "Territorios": region_names,
            })

        st.dataframe(rows, use_container_width=True, hide_index=True)
        book_by_id = {book["id"]: book for book in filtered_books}

        def book_label(book_id):
            book = book_by_id[book_id]
            author_name = authors.get(book["author"], {}).get("name", "Autor desconocido")
            return f"{book['title']} — {author_name}"

        selected_book_id = st.selectbox(
            "Selecciona una obra para actualizar su estado",
            list(book_by_id.keys()),
            format_func=book_label,
        )
        current_status = book_status(selected_book_id, progress)
        new_status = st.selectbox(
            "Estado de la obra",
            BOOK_STATES,
            index=BOOK_STATES.index(current_status),
            key=f"book_status_{selected_book_id}",
        )

        if new_status != current_status:
            progress["book_statuses"][selected_book_id] = new_status
            save_progress(progress)
            st.rerun()
    else:
        st.info("No se encontraron obras con esa búsqueda.")

    st.divider()

    with st.expander("➕ Añadir una región propia"):
        with st.form("add_region_form"):
            new_region_name = st.text_input("Nombre de la región")
            new_region_type = st.selectbox(
                "Tipo",
                ["País", "Periodo", "Movimiento", "Tema", "Otra"],
            )
            add_region = st.form_submit_button("Crear región")

        if add_region:
            if not new_region_name.strip():
                st.error("Escribe un nombre para la región.")
            else:
                region_id = f"custom-region-{uuid.uuid4().hex[:10]}"
                progress["custom_regions"].append({
                    "id": region_id,
                    "name": new_region_name.strip(),
                    "type": new_region_type,
                    "frontiers": [],
                })
                save_progress(progress)
                st.rerun()

    with st.expander("➕ Añadir una obra al catálogo"):
        regions = get_regions(progress)
        authors = get_authors(progress)

        with st.form("add_book_form"):
            new_title = st.text_input("Título")
            new_author_name = st.text_input("Autor")
            new_country = st.text_input("País o tradición literaria")
            new_period = st.text_input("Periodo o siglo")
            new_movements = st.text_input("Corrientes o temas, separados por comas")
            selected_regions = st.multiselect(
                "Territorios asociados",
                list(regions.keys()),
                format_func=lambda region_id: regions[region_id]["name"],
            )
            add_book = st.form_submit_button("Añadir obra")

        if add_book:
            if not new_title.strip() or not new_author_name.strip():
                st.error("El título y el autor son obligatorios.")
            else:
                matching_author_id = next(
                    (
                        author_id
                        for author_id, author in authors.items()
                        if author["name"].casefold()
                        == new_author_name.strip().casefold()
                    ),
                    None,
                )

                if matching_author_id:
                    author_id = matching_author_id
                    additions = progress["author_region_additions"].setdefault(
                        author_id, []
                    )
                    progress["author_region_additions"][author_id] = sorted(
                        set(additions + selected_regions)
                    )

                    for custom_author in progress["custom_authors"]:
                        if custom_author["id"] == author_id:
                            custom_author["regions"] = sorted(
                                set(custom_author.get("regions", []) + selected_regions)
                            )
                else:
                    author_id = f"custom-author-{uuid.uuid4().hex[:10]}"
                    movements = [
                        item.strip()
                        for item in new_movements.split(",")
                        if item.strip()
                    ]
                    progress["custom_authors"].append({
                        "id": author_id,
                        "name": new_author_name.strip(),
                        "country": new_country.strip() or "No especificado",
                        "period": new_period.strip() or "No especificado",
                        "movements": movements,
                        "tier": "SPECIALIZED",
                        "regions": selected_regions,
                        "related": [],
                    })

                progress["custom_books"].append({
                    "id": f"custom-book-{uuid.uuid4().hex[:10]}",
                    "title": new_title.strip(),
                    "author": author_id,
                    "regions": selected_regions,
                })
                save_progress(progress)
                st.rerun()


with connections_tab:
    st.subheader("Conexiones literarias")
    regions = get_regions(progress)
    authors = get_authors(progress)
    books = get_books(progress)

    visible_author_ids = sorted(
        {
            author_id
            for region_id in visible_region_ids
            for author_id in region_authors(region_id, authors)
        },
        key=lambda author_id: authors[author_id]["name"].casefold(),
    )

    if not visible_author_ids:
        st.info("Descubre un territorio para explorar sus autores y conexiones.")
    else:
        selected_author_id = st.selectbox(
            "Elige un autor descubierto",
            visible_author_ids,
            format_func=lambda author_id: authors[author_id]["name"],
        )
        author = authors[selected_author_id]
        author_books = [
            book for book in books if book["author"] == selected_author_id
        ]

        st.markdown(f"### {author['name']}")
        st.write(
            f"**País/tradición:** {author.get('country', 'No especificado')}  \n"
            f"**Periodo:** {author.get('period', 'No especificado')}  \n"
            f"**Corrientes/temas:** "
            f"{', '.join(author.get('movements', [])) or 'Sin datos'}"
        )

        st.markdown("#### Obras en el catálogo")
        if author_books:
            for book in author_books:
                st.write(f"📖 {book['title']} · {book_status(book['id'], progress)}")
        else:
            st.write("Todavía no hay obras asociadas a este autor.")

        related_ids = [
            related_id for related_id in author.get("related", [])
            if related_id in authors
        ]
        visible_related = [
            related_id for related_id in related_ids
            if related_id in visible_author_ids
        ]

        st.markdown("#### Autores relacionados")
        if visible_related:
            st.write(" · ".join(authors[item]["name"] for item in visible_related))
        else:
            st.write("Aún no hay conexiones relacionadas descubiertas.")

        hidden_related_count = len(related_ids) - len(visible_related)
        if hidden_related_count:
            st.caption(
                f"Hay {hidden_related_count} conexión(es) que aún permanecen "
                "bajo la niebla."
            )

        author_regions = [
            regions[region_id]["name"]
            for region_id in author.get("regions", [])
            if region_id in regions and region_id in visible_region_ids
        ]
        st.markdown("#### Territorios compartidos")
        st.write(
            " · ".join(author_regions)
            if author_regions
            else "Sin territorios visibles todavía."
        )


with progress_tab:
    st.subheader("Tu exploración")
    books = get_books(progress)
    regions = get_regions(progress)
    authors = get_authors(progress)

    discovered_books = sum(
        1 for book in books
        if book_status(book["id"], progress) in ["DISCOVERED", "READING", "READ"]
    )

    col1, col2, col3 = st.columns(3)
    col1.metric("Obras descubiertas", discovered_books)
    col2.metric("Regiones exploradas", len(visible_region_ids))
    col3.metric("Regiones MASTERED", len(progress["mastered_regions"]))

    if not visible_region_ids:
        st.info("Tu mapa está listo para empezar: elige cualquier obra en Biblioteca.")
    else:
        st.markdown("#### Progreso por territorio")
        for region_id in visible_region_ids:
            _, _, rate = region_stats(region_id, authors, books, progress)
            st.write(
                f"**{regions[region_id]['name']}** · "
                f"{region_status(region_id, books, progress)} · {rate:.0%}"
            )
            st.progress(rate)

    st.caption(
        "El progreso es descriptivo, no establece una lista de lectura obligatoria "
        "ni supone que hayas dominado un autor por leer una sola obra."
    )
