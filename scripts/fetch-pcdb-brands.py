#!/usr/bin/env python3
"""Fetch SAP PCDB boiler GC data for all brands on boilermanuals.com."""

from __future__ import annotations

import json
import sys
import re
import time
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pcdb_brand_map import iter_brand_pages
OUT_DIR = ROOT / "data" / "pcdb"
OUT_ALL = ROOT / "data" / "pcdb-all.json"
BASE = "https://www.ncm-pcdb.org.uk/sap/"
PID = "26"
TYPE = "105"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "boilermanuals-pcdb-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def strip_tags(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def parse_detail_links(html: str) -> list[str]:
    return sorted(set(re.findall(r"pcdbdetails\.jsp\?[^\"']+", html)))


def parse_detail_page(html: str) -> dict:
    rows = re.findall(
        r"<tr>\s*<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>",
        html,
        re.S | re.I,
    )
    data: dict[str, str] = {}
    for left, right in rows:
        key = strip_tags(left).replace("*", "")
        val = strip_tags(right)
        if key and key not in data:
            data[key] = val

    brand_row = re.search(
        r"Brand.*?Model name.*?Model qualifier.*?<tr>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>",
        html,
        re.S | re.I,
    )
    brand = strip_tags(brand_row.group(1)) if brand_row else ""
    model = strip_tags(brand_row.group(2)) if brand_row else ""
    qualifier = strip_tags(brand_row.group(3)) if brand_row else ""

    boiler_match = re.search(r"Boiler ID.*?<td[^>]*>(.*?)</td>", html, re.S | re.I)
    boiler_id = strip_tags(boiler_match.group(1)) if boiler_match else data.get("Boiler ID", "")
    boiler_id = re.sub(r"^GC\s*", "", boiler_id, flags=re.I).strip()

    return {
        "brand": brand,
        "model": model,
        "qualifier": qualifier,
        "gc": boiler_id,
        "fuel": data.get("Fuel", ""),
        "mainType": data.get("Main type", ""),
        "yearFrom": data.get("First year of manufacture", ""),
        "yearTo": data.get("Final year of manufacture", ""),
        "label": ", ".join(x for x in [brand, model, qualifier] if x),
    }


def normalize_gc(gc: str) -> str:
    digits = re.sub(r"\D", "", gc)
    if len(digits) == 7:
        return f"{digits[0:2]}-{digits[2:5]}-{digits[5:7]}"
    return gc


def search_urls(brand_name: str) -> list[str]:
    urls: list[str] = []
    for fuel in (1, 2):
        for main_type in (1, 2):
            params = {
                "brand": brand_name,
                "emitterType": "0",
                "fuel": str(fuel),
                "heatPumpType": "0",
                "mainType": str(main_type),
                "model": "",
                "modelQualifier": "",
                "mvType": "0",
                "pid": PID,
                "type": TYPE,
            }
            urls.append("pcdbsearchresults.jsp?" + urllib.parse.urlencode(params))
    return urls


def fetch_brand(slug: str, brand_name: str) -> dict:
    detail_links: set[str] = set()
    for path in search_urls(brand_name):
        html = fetch(BASE + path)
        detail_links.update(parse_detail_links(html))
        time.sleep(0.2)

    entries: list[dict] = []
    by_gc: dict[str, dict] = {}
    brand_lower = brand_name.lower()

    for i, link in enumerate(sorted(detail_links), 1):
        html = fetch(BASE + link)
        entry = parse_detail_page(html)
        if entry["brand"].lower() != brand_lower or not entry["gc"]:
            continue
        entry["pcdbUrl"] = BASE + link
        entry["gcDashed"] = normalize_gc(entry["gc"])
        entries.append(entry)
        by_gc[entry["gc"]] = entry
        by_gc[entry["gcDashed"]] = entry
        if i % 40 == 0:
            print(f"  {slug}: fetched {i}/{len(detail_links)} detail pages...")
        time.sleep(0.15)

    return {
        "slug": slug,
        "brandName": brand_name,
        "count": len(entries),
        "entries": entries,
        "byGc": by_gc,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    combined: dict[str, dict] = {}
    summary: list[dict] = []

    for slug, _path, brand_name in iter_brand_pages():
        print(f"Fetching PCDB: {brand_name} ({slug})...")
        try:
            payload = fetch_brand(slug, brand_name)
        except Exception as exc:
            print(f"  FAILED {slug}: {exc}")
            summary.append({"slug": slug, "brandName": brand_name, "count": 0, "error": str(exc)})
            continue

        out = OUT_DIR / f"pcdb-{slug}.json"
        out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        combined[slug] = payload
        summary.append({"slug": slug, "brandName": brand_name, "count": payload["count"]})
        print(f"  Wrote {payload['count']} entries -> {out.relative_to(ROOT)}")

    OUT_ALL.write_text(
        json.dumps({"brands": summary, "data": combined}, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote combined index to {OUT_ALL.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
