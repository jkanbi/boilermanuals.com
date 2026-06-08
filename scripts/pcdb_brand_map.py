#!/usr/bin/env python3
"""Map brands/*.html slugs to PCDB brand search names."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANDS = ROOT / "brands"

# Overrides where the HTML slug / title does not match PCDB exactly.
OVERRIDES: dict[str, str] = {
    "worcester-bosch": "Worcester",
    "glow-worm": "Glowworm",
    "british-gas": "British Gas",
    "saunier-duval": "Saunier Duval",
    "procombi": "ProCombi",
    "eca": "ECA",
    "ehc": "EHC",
    "acv": "ACV",
    "atag": "ATAG",
    "drayton": "Drayton",
    "honeywell": "Honeywell",
}


def brand_slug_from_path(path: Path) -> str:
    return path.stem


def title_brand_name(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"<title>\s*Boiler Manuals\s*-\s*(.+?)\s*</title>", text, re.I)
    if not match:
        return ""
    return match.group(1).strip()


def pcdb_brand_name(slug: str, path: Path) -> str | None:
    if slug in OVERRIDES:
        return OVERRIDES[slug]
    name = title_brand_name(path)
    return name or None


def iter_brand_pages() -> list[tuple[str, Path, str]]:
    items: list[tuple[str, Path, str]] = []
    for path in sorted(BRANDS.glob("*.html")):
        if path.name.startswith("_"):
            continue
        slug = brand_slug_from_path(path)
        name = pcdb_brand_name(slug, path)
        if name:
            items.append((slug, path, name))
    return items
