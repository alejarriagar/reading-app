import ast
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app.py"
DESTINATION = ROOT / "assets" / "catalog.json"

if DESTINATION.exists():
    data = json.loads(DESTINATION.read_text(encoding="utf-8-sig"))

    if not all(key in data for key in ("regions", "authors", "books")):
        raise SystemExit(
            "assets/catalog.json existe, pero no tiene la estructura esperada. "
            "No se ha sobrescrito."
        )

    print("El catálogo ya estaba migrado. Se conserva sin cambios.")
else:
    source_text = SOURCE.read_text(encoding="utf-8-sig")
    tree = ast.parse(source_text)

    required = {"REGIONS", "AUTHORS", "BOOKS"}
    data = {}

    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue

        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in required:
                try:
                    data[target.id.lower()] = ast.literal_eval(node.value)
                except (ValueError, TypeError) as exc:
                    raise SystemExit(
                        f"No se pudo extraer {target.id}. "
                        "No se ha modificado app.py."
                    ) from exc

    missing = required - {key.upper() for key in data}

    if missing:
        raise SystemExit(
            f"No encuentro las constantes originales: {sorted(missing)}. "
            "No se ha modificado app.py ni el historial."
        )

    backup = ROOT / "app.legacy.py"
    if not backup.exists():
        shutil.copy2(SOURCE, backup)

    DESTINATION.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("Catálogo migrado correctamente.")
    print("Código original conservado en app.legacy.py.")

profile = ROOT / "reading_progress.json"
profile_backup = ROOT / "reading_progress.backup.json"

if profile.exists() and not profile_backup.exists():
    shutil.copy2(profile, profile_backup)
    print("Copia de seguridad del historial creada.")

print(f"Regiones del catálogo base: {len(data['regions'])}")
print(f"Autores del catálogo base: {len(data['authors'])}")
print(f"Obras del catálogo base: {len(data['books'])}")
print("Tu historial personal permanece sin cambios.")
print("PREPARACION COMPLETADA")
