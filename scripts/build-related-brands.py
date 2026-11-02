#!/usr/bin/env python3
"""Add or refresh the "Other boiler brands" links block on every brand page.

Each page links to brands that share GC numbers with it (rebadges), then to its
alphabetical neighbours in the same group (boiler or heating-control brands),
and back to the full A-Z list on the home page. Safe to re-run: the block sits
between <!-- related-brands --> markers and is replaced each time.
Usage: python3 scripts/build-related-brands.py
"""
import collections
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRANDS = ROOT / "brands"
CONTROLS = {"danfoss", "esi", "google-nest", "hive", "salus", "tado", "drayton", "honeywell", "heatmiser"}
START, END = "<!-- related-brands -->", "<!-- /related-brands -->"
GC_ROW = re.compile(r"<tr[^>]*><td>(\d{2}-\d{3}-\d{2})</td>")


def brand_names():
    names = {}
    for page in ("index.html", "controls.html", "solid-fuel-biomass.html"):
        text = (ROOT / page).read_text(encoding="utf-8")
        for slug, label in re.findall(r'<a href="brands/([a-z0-9-]+)\.html"[^>]*>([^<]+)</a>', text):
            names.setdefault(slug, html.unescape(label).strip())
    return names


def main():
    names = brand_names()
    slugs = sorted(p.stem for p in BRANDS.glob("*.html") if p.stem in names)
    gc_pages = collections.defaultdict(set)
    for slug in slugs:
        for gc in GC_ROW.findall((BRANDS / f"{slug}.html").read_text(encoding="utf-8")):
            gc_pages[gc].add(slug)
    shared = collections.Counter()
    for pages in gc_pages.values():
        for a in pages:
            for b in pages:
                if a != b:
                    shared[(a, b)] += 1
    changed = 0
    for slug in slugs:
        group = [s for s in slugs if (s in CONTROLS) == (slug in CONTROLS)]
        group.sort(key=lambda s: names[s].lower())
        partners = [b for (a, b), n in shared.most_common() if a == slug and n >= 2][:4]
        i = group.index(slug)
        neighbours = [s for s in group[max(0, i - 4):i] + group[i + 1:i + 5] if s not in partners]
        heading = "Other heating control brands" if slug in CONTROLS else "Other boiler brands"
        items = []
        for s in partners:
            items.append(f'<li><a href="{s}.html">{html.escape(names[s])} boiler manuals</a> <span class="related-brands__note">shares GC numbers</span></li>')
        for s in neighbours:
            items.append(f'<li><a href="{s}.html">{html.escape(names[s])} {"manuals" if slug in CONTROLS else "boiler manuals"}</a></li>')
        all_link = '../controls.html">All heating control brands' if slug in CONTROLS else '/#myUL">All boiler brands A&ndash;Z'
        block = (f'{START}\n<nav class="related-brands" aria-label="{heading}">\n'
                 f'<h2 class="related-brands__title">{heading}</h2>\n<ul class="related-brands__list">\n'
                 + "\n".join(items) + f'\n</ul>\n<p class="related-brands__all"><a href="{all_link}</a></p>\n</nav>\n{END}\n')
        path = BRANDS / f"{slug}.html"
        text = path.read_text(encoding="utf-8")
        if START in text:
            new = re.sub(re.escape(START) + r".*?" + re.escape(END) + r"\n", lambda m: block, text, flags=re.S)
        else:
            new = text.replace('<footer class="site-footer', block + '\n<footer class="site-footer', 1)
        if new != text:
            path.write_text(new, encoding="utf-8")
            changed += 1
    print(f"Related-brands block written on {changed} of {len(slugs)} brand pages")


if __name__ == "__main__":
    main()
