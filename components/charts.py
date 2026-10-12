import math

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from services import library as lib

LOCK = "\U0001F512"
CHECK = "\u2713"

COLORS = {
    "LOCKED": "#1A2332",
    "DISCOVERED": "#475569",
    "READING": "#0EA5E9",
    "READ": "#2563EB",
    "MASTERED": "#8B5CF6",
}

TEXT_COLORS = {
    "LOCKED": "#64748B",
    "DISCOVERED": "#CBD5E1",
    "READING": "#7DD3FC",
    "READ": "#DBEAFE",
    "MASTERED": "#DDD6FE",
}

STATE_LABELS = {
    "LOCKED": "Bloqueado",
    "DISCOVERED": "Descubierto",
    "READING": "Leyendo",
    "READ": "Leído",
    "MASTERED": "Exploración profunda",
}

TIER_LABELS = {
    "ESSENTIAL": "Esencial",
    "RECOMMENDED": "Recomendado",
    "SPECIALIZED": "Especializado",
}


def style_chart(figure, height=420):
    figure.update_layout(
        height=height,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"family": "Inter, Arial, sans-serif", "color": "#CBD5E1", "size": 12},
        margin={"l": 10, "r": 20, "t": 30, "b": 20},
        hoverlabel={
            "bgcolor": "#1E293B",
            "font_color": "#F8FAFC",
            "bordercolor": "#334155",
        },
    )
    figure.update_xaxes(gridcolor="#243248", zeroline=False)
    figure.update_yaxes(gridcolor="#243248", zeroline=False)
    return figure


def render_chart(figure, key):
    st.plotly_chart(
        figure,
        use_container_width=True,
        config={"displayModeBar": False, "responsive": True},
        key=key,
    )


def exploration_chart(key):
    rows = []
    regions = lib.regions()

    for region_id in lib.visible_regions():
        stats = lib.region_stats(region_id)
        rows.append({
            "Región": regions[region_id]["name"],
            "Porcentaje": stats["rate"] * 100,
            "Leídos": stats["read"],
            "Total": stats["total"],
            "Esenciales": (
                f"{stats['tiers']['ESSENTIAL']['read']} / "
                f"{stats['tiers']['ESSENTIAL']['total']}"
            ),
        })

    if not rows:
        return

    frame = pd.DataFrame(rows).sort_values("Porcentaje")
    figure = px.bar(
        frame,
        x="Porcentaje",
        y="Región",
        orientation="h",
        custom_data=["Leídos", "Total", "Esenciales"],
        color_discrete_sequence=["#2563EB"],
    )
    figure.update_traces(
        marker_line_width=0,
        hovertemplate=(
            "<b>%{y}</b><br>"
            "Exploración: %{x:.1f}%<br>"
            "Autores leídos: %{customdata[0]} / %{customdata[1]}<br>"
            "Esenciales: %{customdata[2]}<extra></extra>"
        ),
    )
    figure.update_xaxes(range=[0, 100], ticksuffix="%")
    render_chart(style_chart(figure, max(360, len(rows) * 32)), key)


def region_map():
    regions = lib.regions()

    ids = ["atlas"]
    labels = ["Atlas literario"]
    parents = [""]
    values = [len(regions)]
    colors = ["#0F172A"]
    text_colors = ["#F8FAFC"]
    details = ["Catálogo actual"]

    for region_id, region in regions.items():
        state = lib.region_state(region_id)
        stats = lib.region_stats(region_id)

        if state == "LOCKED":
            label = f"{LOCK} {region['name']}"
            detail = (
                "Bloqueado<br>"
                f"{stats['total']} autores por descubrir<br>"
                "Lee cualquiera de sus obras para desbloquearlo"
            )
        else:
            label = region["name"]
            detail = (
                f"{STATE_LABELS.get(state, state)}<br>"
                f"{stats['rate']:.0%} explorado<br>"
                f"{stats['read']} / {stats['total']} autores"
            )

        ids.append(region_id)
        labels.append(label)
        parents.append("atlas")
        values.append(1)
        colors.append(COLORS.get(state, COLORS["LOCKED"]))
        text_colors.append(TEXT_COLORS.get(state, "#94A3B8"))
        details.append(detail)

    figure = go.Figure(
        go.Treemap(
            ids=ids,
            labels=labels,
            parents=parents,
            values=values,
            branchvalues="total",
            marker={"colors": colors, "line": {"color": "#0F172A", "width": 5}},
            customdata=details,
            hovertemplate="<b>%{label}</b><br>%{customdata}<extra></extra>",
            textfont={"color": text_colors, "size": 13},
            pathbar={"visible": False},
        )
    )
    render_chart(style_chart(figure, 460), "region_map")


def author_network(author_id):
    authors = lib.authors()
    regions = lib.regions()
    author = authors[author_id]

    nodes = [{
        "label": author["name"],
        "type": "Autor",
        "state": lib.author_state(author_id),
        "x": 0,
        "y": 0,
    }]

    neighbours = []
    for book in lib.books():
        if book["author"] == author_id:
            neighbours.append({
                "label": book["title"],
                "type": "Obra",
                "state": lib.book_state(book["id"]),
            })

    for region_id in author.get("regions", []):
        if region_id in regions:
            neighbours.append({
                "label": regions[region_id]["name"],
                "type": "Región",
                "state": lib.region_state(region_id),
            })

    for related_id in author.get("related", []):
        if related_id in authors:
            neighbours.append({
                "label": authors[related_id]["name"],
                "type": "Autor relacionado",
                "state": lib.author_state(related_id),
            })

    for index, neighbour in enumerate(neighbours):
        angle = 2 * math.pi * index / max(1, len(neighbours))
        nodes.append({**neighbour, "x": math.cos(angle), "y": math.sin(angle)})

    edge_x, edge_y = [], []
    for node in nodes[1:]:
        edge_x.extend([0, node["x"], None])
        edge_y.extend([0, node["y"], None])

    def node_label(node):
        text = node["label"][:30] + ("…" if len(node["label"]) > 30 else "")
        return f"{LOCK} {text}" if node["state"] == "LOCKED" else text

    figure = go.Figure()
    figure.add_trace(go.Scatter(
        x=edge_x, y=edge_y, mode="lines",
        line={"color": "#334155", "width": 1.5},
        hoverinfo="skip", showlegend=False,
    ))
    figure.add_trace(go.Scatter(
        x=[node["x"] for node in nodes],
        y=[node["y"] for node in nodes],
        mode="markers+text",
        text=[node_label(node) for node in nodes],
        textposition="top center",
        textfont={"color": [TEXT_COLORS.get(n["state"], "#94A3B8") for n in nodes]},
        customdata=[
            [n["label"], n["type"], STATE_LABELS.get(n["state"], n["state"])]
            for n in nodes
        ],
        marker={
            "size": [26] + [16] * (len(nodes) - 1),
            "color": [COLORS.get(n["state"], COLORS["LOCKED"]) for n in nodes],
            "line": {"color": "#475569", "width": 1},
        },
        hovertemplate=(
            "<b>%{customdata[0]}</b><br>"
            "%{customdata[1]} · %{customdata[2]}<extra></extra>"
        ),
        showlegend=False,
    ))
    figure.update_xaxes(visible=False, range=[-1.4, 1.4])
    figure.update_yaxes(visible=False, range=[-1.35, 1.35], scaleanchor="x")
    render_chart(style_chart(figure, 500), f"network_{author_id}")


AUTHOR_TRACE = 3
WORK_TRACE = 4


def path_chart(path_id, authors, selected_author_id=None, selected_work_index=None):
    count = len(authors)
    xs = [float(i) for i in range(count)]
    ys = [0.5 if i % 2 == 0 else -0.5 for i in range(count)]
    nothing_read = all(a["state"] in ("LOCKED", "DISCOVERED") for a in authors)

    dark_x, dark_y, lit_x, lit_y = [], [], [], []
    for i in range(1, count):
        lit = authors[i - 1]["state"] == "READ" and authors[i]["state"] == "READ"
        target_x, target_y = (lit_x, lit_y) if lit else (dark_x, dark_y)
        target_x.extend([xs[i - 1], xs[i], None])
        target_y.extend([ys[i - 1], ys[i], None])

    selected_index = next(
        (i for i, a in enumerate(authors) if a["id"] == selected_author_id),
        None,
    )

    branch_x, branch_y, work_nodes = [], [], []
    if selected_index is not None:
        origin_x, origin_y = xs[selected_index], ys[selected_index]
        branch_x.append(origin_x)
        branch_y.append(origin_y)
        for j, item in enumerate(authors[selected_index]["works"]):
            wx = origin_x + (0.3 if j % 2 == 0 else -0.3)
            wy = -1.4 - 0.85 * j
            branch_x.append(wx)
            branch_y.append(wy)
            work_nodes.append({**item, "x": wx, "y": wy, "right": wx > origin_x})

    figure = go.Figure()

    figure.add_trace(go.Scatter(
        x=dark_x, y=dark_y, mode="lines",
        line={"color": "#273449", "width": 6},
        hoverinfo="skip", showlegend=False,
    ))
    figure.add_trace(go.Scatter(
        x=lit_x, y=lit_y, mode="lines",
        line={"color": "#2563EB", "width": 6},
        hoverinfo="skip", showlegend=False,
    ))

    branch_color = (
        "#3B82F6"
        if selected_index is not None and authors[selected_index]["state"] == "READ"
        else "#334155"
    )
    figure.add_trace(go.Scatter(
        x=branch_x, y=branch_y, mode="lines",
        line={"color": branch_color, "width": 3, "dash": "dot"},
        hoverinfo="skip", showlegend=False,
    ))

    labels, sizes, symbols, fills, borders, widths = [], [], [], [], [], []
    positions, text_colors, custom = [], [], []

    for i, a in enumerate(authors):
        state = a["state"]
        prefix = f"{LOCK} " if state == "LOCKED" else (f"{CHECK} " if state == "READ" else "")
        labels.append(prefix + a.get("short", a["name"]))
        is_entry = i == 0 and nothing_read
        if i == selected_index:
            sizes.append(42)
            borders.append("#38BDF8")
            widths.append(3)
        else:
            sizes.append(34 if a["tier"] == "ESSENTIAL" else 26)
            borders.append("#CBD5E1" if is_entry else "#334155")
            widths.append(2.5 if is_entry else 1.5)
        symbols.append("hexagon" if a["tier"] == "ESSENTIAL" else "circle")
        fills.append(COLORS.get(state, COLORS["LOCKED"]))
        positions.append("top center" if ys[i] > 0 else "bottom center")
        text_colors.append(TEXT_COLORS.get(state, "#94A3B8"))
        read_works = sum(1 for w in a["works"] if w["state"] == "READ")
        custom.append([
            a["name"],
            TIER_LABELS.get(a["tier"], a["tier"]),
            STATE_LABELS.get(state, state),
            f"{read_works} / {len(a['works'])}",
            "Punto de entrada sugerido" if is_entry else "Haz clic para abrir su rama",
        ])

    figure.add_trace(go.Scatter(
        x=xs, y=ys, mode="markers+text",
        text=labels,
        textposition=positions,
        textfont={"color": text_colors, "size": 12},
        customdata=custom,
        marker={
            "size": sizes,
            "symbol": symbols,
            "color": fills,
            "line": {"color": borders, "width": widths},
        },
        selected={"marker": {"opacity": 1}},
        unselected={"marker": {"opacity": 1}},
        hovertemplate=(
            "<b>%{customdata[0]}</b><br>"
            "%{customdata[1]} · %{customdata[2]}<br>"
            "Obras del camino leídas: %{customdata[3]}<br>"
            "%{customdata[4]}<extra></extra>"
        ),
        showlegend=False,
    ))

    work_labels, work_sizes, work_fills, work_borders = [], [], [], []
    work_positions, work_text_colors, work_custom = [], [], []

    for j, node in enumerate(work_nodes):
        state = node["state"]
        prefix = f"{LOCK} " if state == "LOCKED" else (f"{CHECK} " if state == "READ" else "")
        title = node["title"][:34] + ("…" if len(node["title"]) > 34 else "")
        work_labels.append(f"{prefix}{j + 1}. {title}")
        work_sizes.append(26 if j == selected_work_index else 20)
        work_fills.append(COLORS.get(state, COLORS["LOCKED"]))
        work_borders.append("#38BDF8" if j == selected_work_index else "#334155")
        work_positions.append("middle right" if node["right"] else "middle left")
        work_text_colors.append(TEXT_COLORS.get(state, "#94A3B8"))
        work_custom.append([
            node["title"],
            str(node.get("year") or ""),
            STATE_LABELS.get(state, state),
        ])

    figure.add_trace(go.Scatter(
        x=[n["x"] for n in work_nodes],
        y=[n["y"] for n in work_nodes],
        mode="markers+text",
        text=work_labels,
        textposition=work_positions,
        textfont={"color": work_text_colors, "size": 12},
        customdata=work_custom,
        marker={
            "size": work_sizes,
            "symbol": "circle",
            "color": work_fills,
            "line": {"color": work_borders, "width": 2},
        },
        selected={"marker": {"opacity": 1}},
        unselected={"marker": {"opacity": 1}},
        hovertemplate=(
            "<b>%{customdata[0]}</b> (%{customdata[1]})<br>"
            "%{customdata[2]}<extra></extra>"
        ),
        showlegend=False,
    ))

    bottom = (min(n["y"] for n in work_nodes) - 0.6) if work_nodes else -1.1
    height = 360 + (75 * len(work_nodes) if work_nodes else 0)

    style_chart(figure, height)
    figure.update_layout(clickmode="event+select", showlegend=False)
    figure.update_xaxes(visible=False, fixedrange=True, range=[-1.3, count + 0.3])
    figure.update_yaxes(visible=False, fixedrange=True, range=[bottom, 1.1])

    lookup = {(AUTHOR_TRACE, i): ("author", a["id"]) for i, a in enumerate(authors)}
    for j in range(len(work_nodes)):
        lookup[(WORK_TRACE, j)] = ("work", selected_author_id, j)

    event = st.plotly_chart(
        figure,
        use_container_width=True,
        config={"displayModeBar": False, "responsive": True},
        key=f"path_chart_{path_id}",
        on_select="rerun",
        selection_mode="points",
    )
    return event, lookup
