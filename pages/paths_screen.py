import streamlit as st

from components.charts import path_chart
from components.ui import metric_card, page_header, state_badge
from services import paths as path_service

LOCK = "\U0001F512"
CHECK = "\u2713"

STATE_LABELS = {
    "LOCKED": "Bloqueado",
    "DISCOVERED": "Descubierto",
    "READING": "Leyendo",
    "READ": "Leído",
}

TIER_LABELS = {
    "ESSENTIAL": "esencial",
    "RECOMMENDED": "recomendado",
    "SPECIALIZED": "especializado",
}

STATE_ICONS = {
    "LOCKED": LOCK,
    "DISCOVERED": "\u25CB",
    "READING": "\u25D0",
    "READ": CHECK,
}


def _flash(message):
    st.session_state["atlas_flash"] = message
    st.rerun()


def _apply_click(event, lookup, path_id):
    try:
        points = event["selection"]["points"]
    except (KeyError, TypeError, AttributeError):
        points = []

    signature = tuple(
        (point.get("curve_number"), point.get("point_index", point.get("point_number")))
        for point in points
    )

    signature_key = f"path_click_{path_id}"
    if st.session_state.get(signature_key) == signature:
        return
    st.session_state[signature_key] = signature

    if not signature:
        return

    target = lookup.get(signature[-1])
    if target is None:
        return

    author_key = f"path_author_{path_id}"
    work_key = f"path_work_{path_id}"

    if target[0] == "author":
        if st.session_state.get(author_key) != target[1]:
            st.session_state[author_key] = target[1]
            st.session_state[work_key] = None
            st.rerun()
    else:
        st.session_state[author_key] = target[1]
        st.session_state[work_key] = target[2]
        st.rerun()


def paths_screen():
    page_header(
        "Caminos literarios",
        "Recorridos visuales por una tradición. El orden refleja relevancia, "
        "no una obligación: puedes empezar por cualquier punto del camino.",
    )

    paths = path_service.all_paths()
    by_id = {path["id"]: path for path in paths}

    path_id = st.selectbox(
        "Camino",
        list(by_id),
        format_func=lambda key: by_id[key]["name"],
    )
    path = by_id[path_id]
    authors = path_service.path_status(path)
    by_author = {item["id"]: item for item in authors}
    ids = [item["id"] for item in authors]

    author_key = f"path_author_{path_id}"
    work_key = f"path_work_{path_id}"
    st.session_state.setdefault(author_key, None)
    st.session_state.setdefault(work_key, None)

    read_authors = [a for a in authors if a["state"] == "READ"]
    essentials = [a for a in authors if a["tier"] == "ESSENTIAL"]
    essentials_read = [a for a in essentials if a["state"] == "READ"]
    works_total = sum(len(a["works"]) for a in authors)
    works_read = sum(1 for a in authors for w in a["works"] if w["state"] == "READ")

    columns = st.columns(3)
    with columns[0]:
        metric_card(
            "Autores leídos",
            f"{len(read_authors)} / {len(authors)}",
            "Con al menos una obra leída",
            f"path_{path_id}_authors",
            "#60A5FA",
        )
    with columns[1]:
        metric_card(
            "Esenciales",
            f"{len(essentials_read)} / {len(essentials)}",
            "Autores clave de este camino",
            f"path_{path_id}_essentials",
            "#0EA5E9",
        )
    with columns[2]:
        metric_card(
            "Obras del camino",
            f"{works_read} / {works_total}",
            "Obras incluidas en este recorrido",
            f"path_{path_id}_works",
            "#A78BFA",
        )

    if not read_authors:
        st.caption(
            f"Todavía no has leído nada de este camino. El punto de entrada "
            f"sugerido es {authors[0]['name']}, pero puedes empezar por cualquiera."
        )

    event, lookup = path_chart(
        path_id,
        authors,
        st.session_state[author_key],
        st.session_state[work_key],
    )
    _apply_click(event, lookup, path_id)

    st.caption(
        "Haz clic en un autor para abrir su rama de obras. "
        "Hexágono = esencial · círculo = recomendado o especializado · "
        "gris oscuro = bloqueado · azul = leído."
    )

    current = st.session_state[author_key]
    options = [None] + ids

    def author_label(key):
        if key is None:
            return "Ninguno (rama cerrada)"
        item = by_author[key]
        prefix = f"{LOCK} " if item["state"] == "LOCKED" else (f"{CHECK} " if item["state"] == "READ" else "")
        return f"{ids.index(key) + 1}. {prefix}{item['name']}"

    choice = st.selectbox(
        "O elige un autor del camino",
        options,
        index=options.index(current) if current in options else 0,
        format_func=author_label,
    )
    if choice != current:
        st.session_state[author_key] = choice
        st.session_state[work_key] = None
        st.rerun()

    if current is None:
        return

    author = by_author[current]
    tier_text = TIER_LABELS.get(author["tier"], "relevante")
    position = ids.index(current) + 1

    st.divider()
    heading, badge = st.columns([5, 1])
    heading.markdown(f"### {author['name']}")
    with badge:
        state_badge(author["state"])

    if author["state"] == "LOCKED":
        st.info(
            f"Has descubierto a **{author['name']}**. Se considera "
            f"{tier_text} dentro de este camino. ¿Quieres explorarlo? "
            f"Una buena puerta de entrada es *{author['works'][0]['title']}*."
        )
    else:
        st.caption(
            f"Autor {tier_text} · posición {position} de {len(authors)} en el camino."
        )

    st.markdown("#### Rama de obras · orden de lectura sugerido")
    for j, item in enumerate(author["works"]):
        icon = STATE_ICONS.get(item["state"], "")
        year = f" · {item['year']}" if item.get("year") else ""
        st.markdown(
            f"{icon} **{j + 1}. {item['title']}**{year} · "
            f"{STATE_LABELS.get(item['state'], item['state'])}"
        )

    if author["other_read"]:
        st.caption("También has leído de este autor: " + ", ".join(author["other_read"]))

    work_options = list(range(len(author["works"])))
    current_work = st.session_state[work_key]
    selected_work = st.selectbox(
        "Obra",
        work_options,
        index=current_work if current_work in work_options else 0,
        format_func=lambda j: f"{j + 1}. {author['works'][j]['title']}",
    )
    if selected_work != current_work:
        st.session_state[work_key] = selected_work
        st.rerun()

    work = author["works"][selected_work]
    states = list(STATE_LABELS)

    with st.form(f"path_form_{path_id}_{current}_{selected_work}"):
        new_state = st.selectbox(
            f"Estado de «{work['title']}»",
            states,
            index=states.index(work["state"]),
            format_func=lambda key: STATE_LABELS[key],
        )
        submitted = st.form_submit_button("Guardar", type="primary")

    if submitted and new_state != work["state"]:
        path_service.set_work_state(path, author, work, new_state)
        _flash(f"«{work['title']}» actualizado a {STATE_LABELS[new_state]}.")

    if st.button("Cerrar rama"):
        st.session_state[author_key] = None
        st.session_state[work_key] = None
        st.rerun()
