#!/usr/bin/env python3
"""Build js/boiler-search-index.json from brands/*.html tables."""

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANDS = ROOT / "brands"
OUT = ROOT / "js" / "boiler-search-index.json"


def strip_tags(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def extract_href(cell: str) -> str:
    match = re.search(r'href=["\']([^"\']+)["\']', cell, re.I)
    return match.group(1) if match else ""


def main() -> None:
    entries = []

    for path in sorted(BRANDS.glob("*.html")):
        if path.name.startswith("_"):
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        title_match = re.search(
            r"<title>\s*Boiler Manuals\s*-\s*(.+?)\s*</title>", text, re.I
        )
        brand = (
            title_match.group(1).strip()
            if title_match
            else path.stem.replace("-", " ").title()
        )
        brand_url = f"brands/{path.name}"

        tbody_match = re.search(r"<tbody>(.*?)</tbody>", text, re.S | re.I)
        if not tbody_match:
            continue

        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", tbody_match.group(1), re.S | re.I):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)
            if len(cells) < 3:
                continue

            gc = strip_tags(cells[0])
            model = strip_tags(cells[2])
            if not gc and not model:
                continue

            href = extract_href(cells[1])
            download = href if href.lower().endswith(".pdf") else ""

            entries.append(
                {
                    "brand": brand,
                    "brandUrl": brand_url,
                    "gc": gc,
                    "gcDigits": re.sub(r"\D", "", gc),
                    "model": model,
                    "downloadUrl": download,
                }
            )

    OUT.write_text(json.dumps(entries, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(entries)} entries to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
