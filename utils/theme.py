import base64
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parents[1]


def apply_css():
    css = (ROOT / "assets" / "style.css").read_text(encoding="utf-8")
    font_file = ROOT / "assets" / "Inter.woff2"

    if font_file.exists():
        encoded = base64.b64encode(font_file.read_bytes()).decode("ascii")
        css = (
            '@font-face {font-family:"Inter";'
            'src:url(data:font/woff2;base64,'
            + encoded
            + ') format("woff2");font-weight:100 900;'
            'font-style:normal;font-display:swap;}'
        ) + css

    st.markdown(f"<style>{css}</style>", unsafe_allow_html=True)
