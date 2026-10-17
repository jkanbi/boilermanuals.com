#!/usr/bin/env python3
"""Submit changed URLs to IndexNow (Bing, Yandex, Seznam, Naver; Bing feeds ChatGPT search / Copilot).
Usage: python3 scripts/indexnow-submit.py [url ...]   (no args = every URL in sitemap.xml)
Run only after the change is live. Key file: https://boilermanuals.com/a1b94727294c6148582e5c6e33dfd8ef.txt
"""
import json, re, sys, urllib.request, pathlib
KEY = "a1b94727294c6148582e5c6e33dfd8ef"
HOST = "boilermanuals.com"
urls = sys.argv[1:] or re.findall(r"<loc>([^<]+)</loc>", (pathlib.Path(__file__).resolve().parent.parent / "sitemap.xml").read_text())
body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls[:10000]}).encode()
req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"})
with urllib.request.urlopen(req, timeout=30) as r:
    print(r.status, len(urls), "URLs submitted")
