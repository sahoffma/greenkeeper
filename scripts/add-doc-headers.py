#!/usr/bin/env python3
"""Add unified document headers to GK, GA, GM, DL, GP, CM entries."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "docs"

HEADER_MARKER = "| **ID** |"


def build_header(
    doc_id: str,
    titel: str,
    status: str,
    priority: str,
    verwandte: str,
    kurz: str,
) -> str:
    kurz = kurz.replace("\n", " ").strip()
    if len(kurz) > 220:
        kurz = kurz[:217].rstrip() + "…"
    return (
        "| Feld | Wert |\n"
        "|------|------|\n"
        f"| **ID** | {doc_id} |\n"
        f"| **Titel** | {titel} |\n"
        f"| **Status** | {status} |\n"
        f"| **Priorität** | {priority} |\n"
        "| **Erstellt** | — |\n"
        "| **Zuletzt geändert** | — |\n"
        "| **Verantwortlich** | — |\n"
        f"| **Verwandte Dokumente** | {verwandte} |\n"
        f"| **Kurzbeschreibung** | {kurz} |\n"
        "\n---\n\n"
    )


def section_value(text: str, heading: str) -> str:
    pattern = rf"^## {re.escape(heading)}\s*\n\n(.*?)(?=\n## |\Z)"
    match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if not match:
        return ""
    block = match.group(1).strip()
    for line in block.splitlines():
        line = line.strip()
        if not line or line.startswith("**") and line.endswith("**") and ":" not in line:
            continue
        if line.startswith("- "):
            return line[2:].strip()
        return line
    return ""


def first_bullet(text: str, heading: str) -> str:
    pattern = rf"^## {re.escape(heading)}\s*\n\n(.*?)(?=\n## |\Z)"
    match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    if not match:
        return "—"
    for line in match.group(1).splitlines():
        line = line.strip()
        if line.startswith("- "):
            return line[2:].strip()
    return "—"


def verwandte_from_section(text: str) -> str:
    for heading in ("Verwandte Dokumente", "Verwandte Ideen"):
        pattern = rf"^## {heading}\s*\n\n(.*?)(?=\n## |\Z)"
        match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
        if not match:
            continue
        items = []
        for line in match.group(1).splitlines():
            line = line.strip()
            if line.startswith("- "):
                items.append(line[2:].strip())
        if items:
            return "; ".join(items)
    return "—"


def kurz_from_section(text: str, headings: tuple[str, ...]) -> str:
    for heading in headings:
        value = section_value(text, heading)
        if value:
            return value
    return "—"


def has_header(text: str) -> bool:
    head = text.split("\n", 15)[0:15]
    return any(HEADER_MARKER in line for line in head)


def process_structured_file(path: Path, kind: str) -> bool:
    text = path.read_text(encoding="utf-8")
    if has_header(text):
        return False

    id_match = re.match(r"^# ([A-Z]+-\d+)\s*\n", text)
    if not id_match:
        return False
    doc_id = id_match.group(1)

    titel = section_value(text, "Titel") or doc_id
    status = first_bullet(text, "Status") if kind != "GM" else "—"
    priority = first_bullet(text, "Priority") if False else (
        first_bullet(text, "Priorität") if kind in ("GK", "GA") else "—"
    )
    if priority == "—" and kind == "GK":
        alt = section_value(text, "Priorität")
        if alt:
            priority = alt

    headings = {
        "GK": ("Beschreibung",),
        "GA": ("Beschreibung",),
        "GM": ("Entscheidung",),
        "DL": ("Entscheidung",),
    }[kind]
    kurz = kurz_from_section(text, headings)
    verwandte = verwandte_from_section(text)

    header = build_header(doc_id, titel, status, priority, verwandte, kurz)
    new_text = re.sub(r"^(# [^\n]+\n)", r"\1\n" + header, text, count=1)
    path.write_text(new_text, encoding="utf-8")
    return True


def process_playbook_entries(path: Path, prefix: str) -> bool:
    text = path.read_text(encoding="utf-8")
    changed = False
    pattern = rf"^(## ({prefix}-\d+) – ([^\n]+))\n"

    def replacer(match: re.Match[str]) -> str:
        nonlocal changed
        full_heading = match.group(1)
        doc_id = match.group(2)
        titel = match.group(3).strip()

        start = match.end()
        next_heading = re.search(r"\n## ", text[start:])
        section_end = start + next_heading.start() if next_heading else len(text)
        section = text[start:section_end]

        if HEADER_MARKER in section.split("\n---\n", 1)[0]:
            return match.group(0)

        lines = [ln.strip() for ln in section.strip().splitlines() if ln.strip()]
        kurz = lines[0] if lines else "—"
        links = re.findall(r"\[[^\]]+\]\([^)]+\)", section)
        verwandte = "; ".join(links) if links else "—"

        header = build_header(
            doc_id,
            titel,
            "✅ Umgesetzt",
            "—",
            verwandte,
            kurz,
        )
        changed = True
        return f"{full_heading}\n\n{header}"

    new_text = re.sub(pattern, replacer, text, flags=re.MULTILINE)
    if changed:
        path.write_text(new_text, encoding="utf-8")
    return changed


def main() -> None:
    updated: list[str] = []

    for path in sorted((ROOT / "ideas").glob("gk-*.md")):
        if path.name == "gk-quellenpaket.md":
            continue
        if process_structured_file(path, "GK"):
            updated.append(str(path.relative_to(ROOT.parent)))

    for path in sorted((ROOT / "architecture").glob("ga-*.md")):
        if process_structured_file(path, "GA"):
            updated.append(str(path.relative_to(ROOT.parent)))

    for path in sorted((ROOT / "model").glob("gm-*.md")):
        if path.name == "gm-template.md":
            continue
        if process_structured_file(path, "GM"):
            updated.append(str(path.relative_to(ROOT.parent)))

    for path in sorted((ROOT / "decisions").glob("dl-*.md")):
        if process_structured_file(path, "DL"):
            updated.append(str(path.relative_to(ROOT.parent)))

    for rel, prefix in (
        ("playbook/ux-principles.md", "GP"),
        ("playbook/conversation-model.md", "CM"),
    ):
        path = ROOT / rel
        if process_playbook_entries(path, prefix):
            updated.append(f"docs/{rel} ({prefix} entries)")

    print(f"Updated {len(updated)} files/sets:")
    for item in updated:
        print(f"  - {item}")


if __name__ == "__main__":
    main()
