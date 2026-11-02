#!/usr/bin/env python3
"""Set each <lastmod> in sitemap.xml to the page's real last change date.

Uses the date of the last git commit that touched the file. Files with
uncommitted changes get today's date, so run this just before committing.
Usage: python3 scripts/update-sitemap-lastmod.py
"""
import datetime
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://boilermanuals.com/"
SITEMAP = ROOT / "sitemap.xml"
TODAY = datetime.date.today().isoformat()


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def last_change(rel):
    if git("status", "--porcelain", "--", rel):
        return TODAY
    return git("log", "-1", "--format=%cs", "--", rel) or TODAY


def main():
    xml = SITEMAP.read_text(encoding="utf-8")
    changed = 0

    def fix(m):
        nonlocal changed
        loc, old = m.group(1), m.group(3)
        rel = loc[len(SITE):] or "index.html"
        if rel.endswith("/"):
            rel += "index.html"
        if not (ROOT / rel).exists():
            return m.group(0)
        new = last_change(rel)
        if new != old:
            changed += 1
        return m.group(0).replace(f"<lastmod>{old}</lastmod>", f"<lastmod>{new}</lastmod>")

    xml = re.sub(r"<loc>([^<]+)</loc>(\s*)<lastmod>([^<]+)</lastmod>", fix, xml)
    SITEMAP.write_text(xml, encoding="utf-8")
    print(f"Updated {changed} lastmod dates")


if __name__ == "__main__":
    main()
