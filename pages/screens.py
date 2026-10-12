from datetime import datetime

import pandas as pd
import streamlit as st

from components.charts import author_network, exploration_chart, region_map
from components.ui import (
    action_button,
    banner,
    data_grid,
    metric_card,
    notification,
    page_header,
    state_badge,
    tier_card,
)
from services import library as lib


def refresh(message):
    st.session_state["atlas_flash"] = message
    st.rerun()


@st.dialog("Añadir una obra", width="large")
def add_book_dialog():
    regions = lib.regions()

    with st.form("create_book"):
        title = st.text_input("Título")
        author = st.text_input("Autor")
        left, right = st.columns(2)
        country = left.text_input("País o tradición")
        period = right.text_input("Periodo")
        movements = st.text_input(
            "Corrientes o temas",
            help="Sepáralos mediante comas.",
        )
        region_ids = st.multiselect(
            "Regiones asociadas",
            list(regions),
            format_func=lambda key: regions[key]["name"],
        )
        submitted = st.form_submit_button(
            "Añadir al catálogo",
            type="primary",
            use_container_width=True,
        )

    if submitted:
        try:
            lib.add_book(
                title,
                author,
                country,
                period,
                [
                    value.strip()
                    for value in movements.split(",")
                    if value.strip()
                ],
                region_ids,
            )
        except ValueError as exc:
            st.error(str(exc))
        else:
            refresh("Obra añadida como DISCOVERED.")


@st.dialog("Crear una región")
def add_region_dialog():
    with st.form("create_region"):
        name = st.text_input("Nombre")
        region_type = st.selectbox(
            "Tipo",
            ["País", "Periodo", "Movimiento", "Tema", "Otra"],
        )
        submitted = st.form_submit_button(
            "Crear región",
            type="primary",
            use_container_width=True,
        )

    if submitted:
        try:
            lib.add_region(name, region_type)
        except ValueError as exc:
            st.error(str(exc))
        else:
            refresh("Región creada.")


@st.dialog("Editar lectura", width="large")
def edit_book_dialog(book_id):
    book = next(book for book in lib.books() if book["id"] == book_id)
    authors = lib.authors()

    st.write(book["title"])
    st.caption(authors.get(book["author"], {}).get("name", ""))

    current_state = lib.book_state(book_id)
    current_year = book.get("year")
    current_rating = book.get("rating")

    with st.form(f"edit_{book_id}"):
        state = st.selectbox(
            "Estado",
            lib.BOOK_STATES,
            index=lib.BOOK_STATES.index(current_state),
        )

        left, right = st.columns(2)

        with left:
            record_year = st.checkbox(
                "Guardar año de lectura",
                value=current_year is not None,
            )
            year = st.number_input(
                "Año",
                min_value=1800,
                max_value=2200,
                value=int(current_year or datetime.now().year),
                step=1,
            )

        with right:
            record_rating = st.checkbox(
                "Guardar puntuación",
                value=current_rating is not None,
            )
            rating = st.number_input(
                "Puntuación sobre 10",
                min_value=0.0,
                max_value=10.0,
                value=float(current_rating or 0.0),
                step=0.5,
            )

        reread = st.checkbox(
            "Es una relectura",
            value=bool(book.get("reread", False)),
        )
        notes = st.text_area(
            "Notas personales",
            value=book.get("notes", ""),
            height=120,
        )
        submitted = st.form_submit_button(
            "Guardar cambios",
            type="primary",
            use_container_width=True,
        )

    if submitted:
        lib.update_book(
            book_id,
            state,
            {
                "year": int(year) if record_year else None,
                "rating": float(rating) if record_rating else None,
                "reread": reread,
                "notes": notes,
            },
        )
        refresh("Lectura actualizada.")


def overview():
    page_header(
        "Tu atlas literario",
        "Una visión de tus lecturas y de los territorios que estás descubriendo.",
    )

    books = lib.books()
    read_books = [
        book for book in books
        if lib.book_state(book["id"]) == "READ"
    ]
    reading_books = [
        book for book in books
        if lib.book_state(book["id"]) == "READING"
    ]
    read_authors = {book["author"] for book in read_books}

    cards = [
        ("Obras leídas", len(read_books), "Lecturas terminadas", "#60A5FA"),
        ("En lectura", len(reading_books), "Exploraciones activas", "#0EA5E9"),
        ("Autores leídos", len(read_authors), "Al menos una obra", "#93C5FD"),
        ("Regiones desbloqueadas", len(lib.visible_regions()), "Territorios descubiertos", "#A78BFA"),
    ]
    columns = st.columns(4)

    for index, (title, value, description, accent) in enumerate(cards):
        with columns[index]:
            metric_card(
                title,
                value,
                description,
                f"overview_{index}",
                accent,
            )

    st.markdown("### Exploración por territorio")
    if lib.visible_regions():
        exploration_chart("overview_progress")
    else:
        notification(
            "Tu atlas todavía no tiene lecturas",
            "Puedes registrar cualquier lectura en Biblioteca.",
        )

    banner(
        "Explora sin itinerarios",
        "Los autores esenciales sirven como contexto, no como una lista obligatoria.",
        "overview_freedom",
    )


def map_screen():
    page_header(
        "Mapa de conocimiento",
        "Las lecturas revelan regiones. Tú eliges dónde profundizar.",
    )
    region_map()

    regions = lib.regions()

    region_id = st.selectbox(
        "Territorio",
        list(regions),
        format_func=lambda key: (
            ("\U0001F512 " if lib.region_state(key) == "LOCKED" else "")
            + regions[key]["name"]
        ),
    )

    stats = lib.region_stats(region_id)
    heading, status_column = st.columns([4, 1])

    heading.markdown(f"### {regions[region_id]['name']}")
    with status_column:
        state_badge(lib.region_state(region_id))

    st.progress(stats["rate"])
    st.caption(
        f"{stats['rate']:.0%} explorado · "
        f"{stats['read']} de {stats['total']} autores del catálogo."
    )

    columns = st.columns(3)
    for index, tier in enumerate(lib.TIERS):
        values = stats["tiers"][tier]
        with columns[index]:
            tier_card(
                tier,
                values["read"],
                values["total"],
                f"tier_card_{region_id}_{tier}",
            )

    authors = lib.authors()
    rows = [
        {
            "id": author_id,
            "Autor": authors[author_id]["name"],
            "Clasificación": lib.author_tier(region_id, author_id),
            "Estado": lib.author_state(author_id, region_id),
        }
        for author_id in stats["authors"]
    ]

    st.markdown("### Autores de esta región")
    selected = data_grid(
        pd.DataFrame(rows),
        f"region_authors_{region_id}",
        height=340,
    )

    if selected:
        author_id = selected["id"]
        current_tier = lib.author_tier(region_id, author_id)

        with st.form(f"classification_{region_id}_{author_id}"):
            st.caption(
                f"Clasificación contextual de {authors[author_id]['name']}"
            )
            tier = st.selectbox(
                "Importancia en esta región",
                lib.TIERS,
                index=lib.TIERS.index(current_tier),
            )
            submitted = st.form_submit_button("Guardar clasificación")

        if submitted:
            lib.set_tier(region_id, author_id, tier)
            refresh("Clasificación actualizada.")

    mastered = region_id in lib.profile()["mastered_regions"]
    if action_button(
        "Quitar MASTERED" if mastered else "Marcar como MASTERED",
        f"master_region_{region_id}",
    ):
        lib.toggle_mastery(region_id, "region")
        refresh("Estado de exploración actualizado.")

    st.caption(
        "MASTERED es manual. No modifica el porcentaje y nunca se asigna "
        "automáticamente por leer una obra."
    )

    frontiers = [
        key for key in regions[region_id].get("frontiers", [])
        if key in regions
    ]

    if frontiers and (stats["rate"] >= 0.25 or mastered):
        st.markdown("### Fronteras opcionales")
        choice = st.selectbox(
            "¿Te interesa descubrir otro territorio?",
            [None] + frontiers,
            format_func=lambda key: (
                "Sin elegir una dirección"
                if key is None
                else regions[key]["name"]
            ),
        )

        if choice and st.button("Descubrir territorio"):
            lib.discover_region(choice)
            refresh("Nuevo territorio descubierto.")


def library_screen():
    page_header(
        "Biblioteca",
        "Todas tus obras, sin restricciones de orden, país, autor o época.",
    )

    left, middle, right = st.columns([4, 1.5, 1.5])
    with left:
        query = st.text_input(
            "Buscar",
            placeholder="Título, autor, año o estado…",
            label_visibility="collapsed",
        )
    with middle:
        if action_button("Añadir obra", "library_add_book"):
            add_book_dialog()
    with right:
        if action_button("Crear región", "library_add_region"):
            add_region_dialog()

    authors = lib.authors()
    books = lib.books()

    rows = [
        {
            "id": book["id"],
            "Obra": book["title"],
            "Autor": authors.get(book["author"], {}).get(
                "name", "Autor desconocido"
            ),
            "Estado": lib.book_state(book["id"]),
            "Año": str(book.get("year") or ""),
            "Nota": (
                "" if book.get("rating") is None
                else str(book["rating"])
            ),
            "Relectura": "Sí" if book.get("reread") else "",
        }
        for book in books
    ]

    selected = data_grid(
        pd.DataFrame(rows),
        "library_grid",
        query=query,
        height=480,
    )

    if not books:
        return

    if selected:
        book_id = selected["id"]
    else:
        lookup = {book["id"]: book for book in books}
        book_id = st.selectbox(
            "También puedes elegir una obra sin utilizar la tabla",
            list(lookup),
            format_func=lambda key: (
                f"{lookup[key]['title']} — "
                f"{authors.get(lookup[key]['author'], {}).get('name', '')}"
            ),
        )

    book = next(item for item in books if item["id"] == book_id)

    st.markdown("### Detalle de la obra")
    st.write(book["title"])
    state_badge(lib.book_state(book_id))

    if book.get("notes"):
        st.write(book["notes"])

    if action_button("Editar lectura", f"edit_button_{book_id}"):
        edit_book_dialog(book_id)


def connections_screen():
    page_header(
        "Conexiones",
        "Sigue relaciones entre autores, obras y regiones sin una ruta predefinida.",
    )

    authors = lib.authors()
    known_ids = list(authors)

    author_id = st.selectbox(
        "Autor",
        sorted(known_ids, key=lambda key: authors[key]["name"]),
        format_func=lambda key: (
            ("\U0001F512 " if lib.author_state(key) == "LOCKED" else "")
            + authors[key]["name"]
        ),
    )
    author = authors[author_id]

    st.caption(
        f"{author.get('country', 'Sin país')} · "
        f"{author.get('period', 'Sin periodo')}"
    )
    author_network(author_id)

    related = [
        key for key in author.get("related", [])
        if key in authors
    ]

    if related:
        st.markdown("### Autores relacionados")
        related_id = st.selectbox(
            "Una conexión que puedes seguir",
            related,
            format_func=lambda key: authors[key]["name"],
        )
        st.caption(
            "Una relación no equivale necesariamente a una influencia histórica."
        )

        if lib.author_state(related_id) == "LOCKED":
            if st.button("Descubrir autor relacionado"):
                lib.discover_author(related_id)
                refresh("Autor descubierto.")
    else:
        st.caption(
            "Este autor todavía no tiene relaciones editoriales "
            "incorporadas al catálogo."
        )

    if lib.author_state(author_id) in {"READ", "MASTERED"}:
        mastered = author_id in lib.profile()["mastered_authors"]
        if action_button(
            "Quitar MASTERED del autor"
            if mastered
            else "Marcar exploración profunda del autor",
            f"master_author_{author_id}",
        ):
            lib.toggle_mastery(author_id, "author")
            refresh("Exploración del autor actualizada.")


def exploration_screen():
    page_header(
        "Mi exploración",
        "Progreso por contexto, no una puntuación global de conocimiento.",
    )

    visible = lib.visible_regions()
    if not visible:
        notification(
            "Tu mapa todavía no tiene progreso",
            "Puedes empezar por cualquier libro.",
        )
        return

    exploration_chart("full_exploration")
    regions = lib.regions()
    rows = []

    for region_id in visible:
        stats = lib.region_stats(region_id)
        rows.append({
            "id": region_id,
            "Región": regions[region_id]["name"],
            "Estado": lib.region_state(region_id),
            "Explorado (%)": round(stats["rate"] * 100, 1),
            "Autores leídos": stats["read"],
            "Autores del catálogo": stats["total"],
            "Essential": (
                f"{stats['tiers']['ESSENTIAL']['read']} / "
                f"{stats['tiers']['ESSENTIAL']['total']}"
            ),
            "Recommended": (
                f"{stats['tiers']['RECOMMENDED']['read']} / "
                f"{stats['tiers']['RECOMMENDED']['total']}"
            ),
            "Specialized": (
                f"{stats['tiers']['SPECIALIZED']['read']} / "
                f"{stats['tiers']['SPECIALIZED']['total']}"
            ),
        })

    data_grid(pd.DataFrame(rows), "exploration_grid", height=420)

    banner(
        "Cómo interpretar el progreso",
        "El denominador depende del catálogo. Ampliar una región puede reducir "
        "su porcentaje sin que pierdas ninguna lectura. MASTERED es una "
        "valoración manual, no una certificación.",
        "progress_meaning",
    )
