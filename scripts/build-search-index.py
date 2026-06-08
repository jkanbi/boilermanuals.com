#!/usr/bin/env python3
"""Build js/boiler-search-index.json from brands/*.html tables."""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from html_table_rows import iter_table_rows  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRANDS = ROOT / "brands"
OUT = ROOT / "js" / "boiler-search-index.json"


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

        for gc, href, model in iter_table_rows(text):
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
