import html
import json

import pandas as pd
import streamlit as st
import streamlit_antd_components as sac
import streamlit_shadcn_ui as shadcn

from st_aggrid import AgGrid, GridOptionsBuilder, DataReturnMode
from streamlit_extras.stylable_container import stylable_container
from streamlit_option_menu import option_menu

from services import library as lib


def page_header(title, subtitle):
    st.markdown(
        f"""
        <div class="page-heading">
            <div class="eyebrow">ATLAS / EXPLORACIÓN DEL CONOCIMIENTO</div>
            <h1>{html.escape(title)}</h1>
            <p>{html.escape(subtitle)}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def metric_card(title, value, description, key, accent="#2563EB"):
    with stylable_container(
        key=f"metric_{key}",
        css_styles="""
            {
                border: 1px solid rgba(148,163,184,.15);
                border-radius: 16px;
                padding: 20px;
                background: #1E293B;
            }
        """,
    ):
        st.markdown(
            f"""
            <div class="metric-label">{html.escape(title)}</div>
            <div class="metric-value" style="color:{accent}">
                {html.escape(str(value))}
            </div>
            <div class="metric-description">
                {html.escape(description)}
            </div>
            """,
            unsafe_allow_html=True,
        )


def banner(title, description, key):
    with stylable_container(
        key=f"banner_{key}",
        css_styles="""
            {
                background: rgba(37,99,235,.08);
                border: 1px solid rgba(37,99,235,.28);
                border-radius: 14px;
                padding: 16px 20px;
            }
        """,
    ):
        st.markdown(f"**{title}**")
        st.write(description)


def notification(title, description):
    sac.alert(
        label=title,
        description=description,
        color="blue",
        icon=True,
    )


def state_badge(state):
    allowed = {"LOCKED", "DISCOVERED", "READING", "READ", "MASTERED"}
    safe = state if state in allowed else "LOCKED"
    st.markdown(
        f'<span class="state-badge state-{safe.lower()}">{safe}</span>',
        unsafe_allow_html=True,
    )


def action_button(label, key):
    return shadcn.button(text=label, key=key)


def tier_card(tier, read_count, total, key):
    shadcn.metric_card(
        title=tier,
        content=f"{read_count} / {total}",
        description="Autores con al menos una obra leída",
        key=key,
    )


def sidebar():
    with st.sidebar:
        st.markdown(
            """
            <div class="sidebar-brand">
                <div class="brand-symbol">A</div>
                <div>
                    <strong>ATLAS</strong>
                    <div class="brand-subtitle">Tu mapa literario</div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        selection = option_menu(
            menu_title=None,
            options=["Resumen", "Mapa", "Caminos", "Biblioteca", "Conexiones", "Exploración"],
            icons=["grid-1x2", "map", "signpost-split", "book", "diagram-3", "bar-chart"],
            default_index=0,
            styles={
                "container": {
                    "padding": "0",
                    "background-color": "transparent",
                },
                "icon": {
                    "color": "#94A3B8",
                    "font-size": "17px",
                },
                "nav-link": {
                    "font-size": "14px",
                    "text-align": "left",
                    "margin": "4px 0",
                    "padding": "12px 14px",
                    "border-radius": "10px",
                    "color": "#CBD5E1",
                    "--hover-color": "#1E293B",
                },
                "nav-link-selected": {
                    "background-color": "#2563EB",
                    "color": "#FFFFFF",
                },
            },
        )

        st.divider()
        st.caption("TU MAPA, TU DIRECCIÓN")
        st.caption(
            "No hay una ruta obligatoria. "
            "Tú decides qué descubrir y dónde profundizar."
        )

        st.download_button(
            "Exportar mi historial",
            data=json.dumps(lib.profile(), ensure_ascii=False, indent=2),
            file_name="atlas_history.json",
            mime="application/json",
            use_container_width=True,
        )

        st.caption("Progreso calculado sobre el catálogo disponible.")

    return selection


def data_grid(frame, key, query="", height=420):
    if frame.empty:
        notification("Sin resultados", "No hay registros disponibles.")
        return None

    builder = GridOptionsBuilder.from_dataframe(frame)
    builder.configure_default_column(
        filter=True,
        sortable=True,
        resizable=True,
        minWidth=120,
    )

    if "id" in frame.columns:
        builder.configure_column("id", hide=True)

    builder.configure_pagination(
        paginationAutoPageSize=False,
        paginationPageSize=15,
    )
    builder.configure_selection(
        selection_mode="single",
        use_checkbox=True,
    )

    options = builder.build()
    options["quickFilterText"] = query
    options["rowHeight"] = 44
    options["headerHeight"] = 44
    options["animateRows"] = False

    result = AgGrid(
        frame,
        gridOptions=options,
        height=height,
        theme="streamlit",
        key=key,
        update_on=["selectionChanged"],
        data_return_mode=DataReturnMode.FILTERED_AND_SORTED,
        enable_enterprise_modules=False,
        allow_unsafe_jscode=False,
        custom_css={
            ".ag-root-wrapper": {
                "border": "1px solid #334155",
                "border-radius": "12px",
            },
            ".ag-header": {
                "background-color": "#172236",
                "color": "#E2E8F0",
            },
            ".ag-row": {
                "background-color": "#1E293B",
                "color": "#E2E8F0",
            },
            ".ag-row-hover": {
                "background-color": "#26354B !important",
            },
            ".ag-row-selected": {
                "background-color": "#193865 !important",
            },
        },
    )

    selected = result.get("selected_rows")

    if isinstance(selected, pd.DataFrame):
        return None if selected.empty else selected.iloc[0].to_dict()

    if isinstance(selected, list) and selected:
        return selected[0]

    return None
