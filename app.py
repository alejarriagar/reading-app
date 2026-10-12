import streamlit as st

st.set_page_config(
    page_title="Atlas | Exploración literaria",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded",
)

from components.ui import sidebar
from pages.screens import (
    overview,
    map_screen,
    library_screen,
    connections_screen,
    exploration_screen,
)
from services import library as lib
from utils.theme import apply_css
from pages.paths_screen import paths_screen

apply_css()

try:
    lib.initialize()
except (OSError, ValueError, RuntimeError) as exc:
    st.error(f"No se pudo iniciar Atlas: {exc}")
    st.stop()

message = st.session_state.pop("atlas_flash", None)
if message:
    st.toast(message, icon="✅")

selected_page = sidebar()

screens = {
    "Resumen": overview,
    "Mapa": map_screen,
    "Caminos": paths_screen,
    "Biblioteca": library_screen,
    "Conexiones": connections_screen,
    "Exploración": exploration_screen,
}

screens[selected_page]()
