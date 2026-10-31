#!/usr/bin/env python3
"""Build or sync js/boiler-search-index.json from brands/*.html tables.

The live brand tables are the source of truth for which models have a CDN PDF.
`--sync-urls` updates downloadUrl/viewUrl on the existing index (keeps brand/gc/model).
A full rebuild (default) recreates the index from the tables.
"""

import argparse
import html
import json
import re
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANDS = ROOT / "brands"
OUT = ROOT / "js" / "boiler-search-index.json"
CDN = "https://cdn.boilermanuals.com/"


def text_of(fr):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fr))).strip()


def is_cdn_pdf(h):
    h = html.unescape(h or "").strip()
    return h.startswith(CDN) and urllib.parse.unquote(h.split("?")[0].split("#")[0]).lower().endswith(".pdf")


def cdn_url(h):
    return urllib.parse.unquote(html.unescape(h).split("?")[0].split("#")[0])


def viewer_for(url):
    return "/viewer.html?file=" + urllib.parse.quote(url, safe="")


def brand_name(text, stem):
    m = re.search(r'data-brand="([^"]+)"', text)
    if m:
        return m.group(1).strip()
    m = re.search(r"<title>\s*Boiler Manuals\s*-\s*(.+?)\s*</title>", text, re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r"<title>\s*(.+?)\s*</title>", text, re.I)
    if m:
        return re.sub(r"\s*[–-].*$", "", m.group(1)).replace("Boiler Manuals", "").strip() or stem.replace("-", " ").title()
    return stem.replace("-", " ").title()


def parse_pages():
    rows = []
    for path in sorted(BRANDS.glob("*.html")):
        if path.name.startswith("_"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        table = re.search(r'<table[^>]*id="myTable".*?</table>', text, re.S)
        if not table:
            continue
        thead = re.search(r"<thead.*?</thead>", table.group(0), re.S)
        labels = [text_of(x).lower() for x in re.findall(r"<th[^>]*>(.*?)</th>", thead.group(0) if thead else "", re.S)]
        gi = next((i for i, l in enumerate(labels) if l in ("gc", "id") or re.match(r"^g\.?\s*c\b", l)), -1)
        mi = next((i for i, l in enumerate(labels) if re.search(r"model|description", l) and "manual" not in l), -1)
        brand = brand_name(text, path.stem)
        for tr in re.findall(r"<tr\b[^>]*>(.*?)</tr>", table.group(0), re.S):
            tds = re.findall(r"<td\b[^>]*>(.*?)</td>", tr, re.S)
            if not tds:
                continue
            cells = [text_of(x) for x in tds]
            links = [
                (html.unescape(h), text_of(t))
                for h, t in re.findall(r'<a\b[^>]*?href\s*=\s*"([^"]*)"[^>]*>(.*?)(?=</a>|<a\b|</td>|$)', tr, re.S)
            ]
            pdfs, viewers = [], []
            for h, _ in links:
                if is_cdn_pdf(h):
                    pdfs.append(cdn_url(h))
                if "viewer.html?file=" in h:
                    viewers.append(h)
                    q = urllib.parse.parse_qs(urllib.parse.urlparse(h).query).get("file", [""])[0]
                    if q:
                        file_url = urllib.parse.unquote(q)
                        if is_cdn_pdf(file_url) and cdn_url(file_url) not in pdfs:
                            pdfs.append(cdn_url(file_url))
            gc = cells[gi] if 0 <= gi < len(cells) else ""
            model = cells[mi] if 0 <= mi < len(cells) else ""
            if not model.strip():
                # column-shifted rows: take the first non-empty cell that is not the manual link text
                for i, c in enumerate(cells):
                    if i == gi:
                        continue
                    if c and not c.lower().startswith("view ") and c != "Request manual" and "Last Updated" not in c:
                        model = c
                        break
            if not gc.strip() and not model.strip() and not pdfs:
                continue
            rows.append(
                {
                    "slug": path.stem,
                    "brand": brand,
                    "brandUrl": f"brands/{path.name}",
                    "gc": gc,
                    "model": model,
                    "pdfs": pdfs,
                    "viewers": viewers,
                    "cells": cells,
                }
            )
    return rows


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def pick_urls(page, current_download=""):
    if not page or not page["pdfs"]:
        return "", ""
    download = current_download if current_download in page["pdfs"] else page["pdfs"][0]
    view = ""
    for v in page["viewers"]:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(v).query).get("file", [""])[0]
        if q and cdn_url(urllib.parse.unquote(q)) == download:
            view = v if v.startswith("/") else "/" + v.lstrip(".")
            break
    if not view and page["viewers"]:
        view = page["viewers"][0]
        if not view.startswith("/"):
            view = "/" + view.lstrip(".")
    if not view:
        view = viewer_for(download)
    return download, view


def match_page(entry, by_gc, by_model, by_slug):
    slug = entry["brandUrl"].split("/")[-1][:-5]
    gc = (entry.get("gc") or "").strip()
    model = norm(entry.get("model"))
    cands = []
    if gc:
        cands = by_gc.get((slug, gc), [])
        if len(cands) == 1:
            return cands[0]
        if len(cands) > 1 and model:
            named = [c for c in cands if norm(c["model"]) == model or model in norm(" ".join(c["cells"]))]
            if len(named) == 1:
                return named[0]
            if named:
                cands = named
    if model:
        mc = by_model.get((slug, model), [])
        if len(mc) == 1:
            return mc[0]
        if len(mc) > 1:
            # prefer a row that already has the current download, else first with a pdf
            cur = entry.get("downloadUrl") or ""
            for c in mc:
                if cur and cur in c["pdfs"]:
                    return c
            for c in mc:
                if c["pdfs"]:
                    return c
            return mc[0]
        # model text sometimes lives in another cell (shifted columns / extra description)
        for c in by_slug.get(slug, []):
            blob = norm(" ".join(c["cells"] + [c["model"]]))
            if model and model in blob:
                cands.append(c)
        if len(cands) == 1:
            return cands[0]
        if cands:
            cur = entry.get("downloadUrl") or ""
            for c in cands:
                if cur and cur in c["pdfs"]:
                    return c
            for c in cands:
                if c["pdfs"]:
                    return c
    return cands[0] if len(cands) == 1 else None


def sync_urls(index, pages):
    by_gc, by_model, by_slug = defaultdict(list), defaultdict(list), defaultdict(list)
    for r in pages:
        by_slug[r["slug"]].append(r)
        if r["gc"].strip():
            by_gc[(r["slug"], r["gc"].strip())].append(r)
        if r["model"].strip():
            by_model[(r["slug"], norm(r["model"]))].append(r)

    filled = updated = cleared = unmatched = 0
    for entry in index:
        page = match_page(entry, by_gc, by_model, by_slug)
        if page is None:
            unmatched += 1
            continue
        download, view = pick_urls(page, entry.get("downloadUrl") or "")
        old = entry.get("downloadUrl") or ""
        if download != old:
            if download and not old:
                filled += 1
            elif download and old:
                updated += 1
            elif old and not download:
                cleared += 1
        entry["downloadUrl"] = download
        if download:
            entry["viewUrl"] = view
        else:
            entry.pop("viewUrl", None)
            entry["viewUrl"] = ""
    return filled, updated, cleared, unmatched


def rebuild(pages):
    entries = []
    for r in pages:
        download, view = pick_urls(r)
        entries.append(
            {
                "brand": r["brand"],
                "brandUrl": r["brandUrl"],
                "gc": r["gc"],
                "gcDigits": re.sub(r"\D", "", r["gc"]),
                "model": r["model"],
                "downloadUrl": download,
                "viewUrl": view,
            }
        )
    return entries


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--sync-urls",
        action="store_true",
        help="Update downloadUrl/viewUrl on the existing index; keep brand/gc/model",
    )
    args = ap.parse_args()
    pages = parse_pages()
    if args.sync_urls:
        if not OUT.exists():
            print("existing index missing; rebuild instead", file=sys.stderr)
            sys.exit(1)
        index = json.loads(OUT.read_text(encoding="utf-8"))
        filled, updated, cleared, unmatched = sync_urls(index, pages)
        OUT.write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
        print(
            f"Synced {len(index)} index entries from {len(pages)} table rows "
            f"(filled {filled}, updated {updated}, cleared {cleared}, unmatched {unmatched})"
        )
    else:
        entries = rebuild(pages)
        OUT.write_text(json.dumps(entries, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {len(entries)} entries to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
