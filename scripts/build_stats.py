#!/usr/bin/env python3
"""Build site coverage stats -> data/stats.json and the static stats panel in about.html.

Usage: python3 scripts/build_stats.py [--root .] [--pcdb path/to/pcdb10.dat]
The PCDB file defaults to $PCDB_DAT, then ./pcdb10.dat, then a download of
https://www.ncm-pcdb.org.uk/pcdb/pcdb10.dat. Re-run after any manual/link change.
Only links on https://cdn.boilermanuals.com/ count as a (verified) manual.
"""
import argparse, csv, html, json, os, re, urllib.parse, urllib.request
from pathlib import Path

CDN = 'https://cdn.boilermanuals.com/'
CONTROLS = {'danfoss', 'esi', 'google-nest', 'hive', 'salus', 'tado', 'drayton', 'honeywell'}
ELECTRIC_PAGES = {'amptec', 'ehc', 'fischer', 'strom', 'thermaflow', 'elnur'}
ELECTRIC_WORDS = re.compile(r'\b(electromax|amptec|electric (boiler|combi|flow boiler))\b', re.I)
ELECTRIC_FUEL = re.compile(r'^\s*elec', re.I)
NOT_BOILER = re.compile(r'warm air|electricaire|storage heater|programmer|thermostat|timeswitch', re.I)
GC_TXT = re.compile(r'\bGC\s*(?:No\.?\s*)?(\d{2})[\s.\-/]?(\d{3})[\s.\-/]?(\d{2})(?!\d)', re.I)
GC_CELL = re.compile(r'^\s*(\d{2})[\s.\-/]?(\d{3})[\s.\-/]?(\d{2})\s*$')
GC_STRICT = re.compile(r'^\s*(?:g\.?\s*c\.?\s*(?:no\.?)?\s*)?(\d{2})\s*[./\-]?\s*(\d{3})\s*[./\-]?\s*(\d{2})\s*[a-z]{0,3}\s*$', re.I)
PCDB_TXT = re.compile(r'\bPCDB\s+((?:\d{6})(?:\s*/\s*\d{6})*)')
FUELS = [('1', 'gas', 'Gas'), ('2', 'lpg', 'LPG'), ('4', 'oil', 'Oil'), ('71', 'hvo', 'HVO')]
MONTHS = 'January February March April May June July August September October November December'.split()

def text_of(fr): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', fr))).strip()
def is_cdn_pdf(h):
    h = html.unescape(h or '').strip()
    return h.startswith(CDN) and urllib.parse.unquote(h.split('?')[0].split('#')[0]).lower().endswith('.pdf')
def cdn_key(h): return urllib.parse.unquote(html.unescape(h).split('?')[0].split('#')[0])[len(CDN):]

def load_pcdb(path):
    if path: raw = Path(path).read_bytes()
    else: raw = urllib.request.urlopen(urllib.request.Request('https://www.ncm-pcdb.org.uk/pcdb/pcdb10.dat', headers={'User-Agent': 'Mozilla/5.0'}), timeout=120).read()
    lines = raw.decode('latin-1').split('\n')
    rev = next(l for l in lines if l.startswith('$001,')).strip().split(',')
    i = next(k for k, l in enumerate(lines) if l.startswith('$105,'))
    t105 = lines[i].strip().split(',')
    recs = []
    for l in lines[i + 1:]:
        if l.startswith('$'): break
        if l.startswith('#') or not l.strip(): continue
        recs.append(next(csv.reader([l])))
    return {'revision': rev[1], 'date': f'{rev[2]}-{rev[3]}-{rev[4]}', 'table105_date': f'{t105[3]}-{t105[4]}-{t105[5]}'}, recs

def site_rows(root):
    """yield (page_slug, cells_text, fuel_text, hrefs, gc_cell) for every brand-table row"""
    for p in sorted((root / 'brands').glob('*.html')):
        if p.name.startswith('_'): continue
        s = p.read_text(encoding='utf-8')
        t = re.search(r'<table[^>]*id="myTable".*?</table>', s, re.S)
        if not t: continue
        th = re.search(r'<thead.*?</thead>', t.group(0), re.S)
        labels = [text_of(x).lower() for x in re.findall(r'<th[^>]*>(.*?)</th>', th.group(0) if th else '', re.S)]
        fi = next((i for i, l in enumerate(labels) if l.startswith('fuel')), -1)
        gi = next((i for i, l in enumerate(labels) if l in ('gc', 'id') or re.match(r'^g\.?\s*c\b', l)), -1)
        for tr in re.findall(r'<tr\b[^>]*>(.*?)</tr>', t.group(0), re.S):
            tds = re.findall(r'<td\b[^>]*>(.*?)</td>', tr, re.S)
            if not tds: continue
            cells = [text_of(x) for x in tds]
            hrefs = [html.unescape(h) for h in re.findall(r'href\s*=\s*"([^"]*)"', tr)]
            yield (p.stem, cells, cells[fi] if 0 <= fi < len(cells) else '', hrefs, cells[gi] if 0 <= gi < len(cells) else '')

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--root', default='.'); ap.add_argument('--pcdb', default=None)
    a = ap.parse_args(); root = Path(a.root)
    pc = a.pcdb or os.environ.get('PCDB_DAT') or ('pcdb10.dat' if Path('pcdb10.dat').exists() else None)
    meta, recs = load_pcdb(pc)

    manuals = set(); gcs_with = set(); pcdb_with = set(); electric = set()
    for slug, cells, fuel, hrefs, gccell in site_rows(root):
        pdfs = [h for h in hrefs if is_cdn_pdf(h)]
        for h in pdfs: manuals.add(cdn_key(h))
        if not pdfs or slug in CONTROLS: continue
        txt = ' '.join(cells)
        m = GC_CELL.match(gccell)
        if m: gcs_with.add(''.join(m.groups()))
        for m in GC_TXT.finditer(txt): gcs_with.add(''.join(m.groups()))
        for m in PCDB_TXT.finditer(txt): pcdb_with.update(re.findall(r'\d{6}', m.group(1)))
        if not NOT_BOILER.search(txt) and (slug in ELECTRIC_PAGES or ELECTRIC_FUEL.match(fuel) or ELECTRIC_WORDS.search(txt)):
            electric.add((slug, txt))
    idx = json.loads((root / 'js/boiler-search-index.json').read_text(encoding='utf-8'))
    models = [r for r in idx if r['brandUrl'].split('/')[-1][:-5] not in CONTROLS and '(any model)' not in r['model']]
    with_manual = [r for r in models if is_cdn_pdf(r['downloadUrl'])]
    for r in idx:
        if is_cdn_pdf(r['downloadUrl']): manuals.add(cdn_key(r['downloadUrl']))
    for r in with_manual:
        if len(r.get('gcDigits') or '') == 7: gcs_with.add(r['gcDigits'])
        for m in GC_TXT.finditer(r['model']): gcs_with.add(''.join(m.groups()))
        for m in PCDB_TXT.finditer(r['model']): pcdb_with.update(re.findall(r'\d{6}', m.group(1)))

    fuels = {}; total_with = 0
    for code, key, label in FUELS:
        rs = [f for f in recs if f[11] == code]; n = 0
        for f in rs:
            g = GC_STRICT.match(f[8]) if code in ('1', '2') else None
            if (g and ''.join(g.groups()) in gcs_with) or f[0] in pcdb_with: n += 1
        fuels[key] = {'label': label, 'pcdb_total': len(rs), 'with_manual': n, 'pct': round(100 * n / len(rs), 1) if rs else 0}
        total_with += n
    other = len([f for f in recs if f[11] not in {c for c, _, _ in FUELS}])
    stats = {
        'generated': meta['date'] and __import__('datetime').date.today().isoformat(),
        'pcdb': {'source': 'SAP 10 PCDB (pcdb10.dat) table 105, gas and oil boilers', 'revision': meta['revision'],
                 'file_date': meta['date'], 'table105_date': meta['table105_date'], 'records': len(recs), 'other_fuel_records': other},
        'manuals_total': len(manuals),
        'models': {'listed': len(models), 'with_manual': len(with_manual), 'pct': round(100 * len(with_manual) / len(models), 1)},
        'fuels': fuels,
        'electric': {'models_with_manual': len(electric), 'note': 'not in PCDB'},
        'pcdb_overall': {'records': len(recs), 'with_manual': total_with, 'pct': round(100 * total_with / len(recs), 1)},
        'method': 'A PCDB record counts when its GC number (gas/LPG) or its PCDB index appears on a site row that links a PDF on cdn.boilermanuals.com.',
    }
    (root / 'data').mkdir(exist_ok=True)
    (root / 'data/stats.json').write_text(json.dumps(stats, indent=1) + '\n', encoding='utf-8')
    render(root, stats)
    print(json.dumps(stats, indent=1))

CSS = '''<!-- stats-css:start -->
    <style>
        .bm-stats { margin: 2rem 0 0; }
        .bm-stats__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1rem; margin: 1rem 0 1.5rem; padding: 0; list-style: none; }
        .bm-stats__card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.9rem 1rem; background: #fff; }
        .bm-stats__num { display: block; font-size: 1.6rem; font-weight: 700; line-height: 1.2; }
        .bm-stats__lbl { display: block; font-size: 0.9rem; opacity: 0.8; }
        .bm-stats__rows { margin: 0; padding: 0; list-style: none; }
        .bm-stats__row { margin: 0 0 0.9rem; }
        .bm-stats__head { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.95rem; }
        .bm-stats__bar { height: 0.7rem; border-radius: 999px; background: #e2e8f0; overflow: hidden; margin-top: 0.3rem; }
        .bm-stats__fill { display: block; height: 100%; background: #2563eb; border-radius: 999px; min-width: 2px; }
        .bm-stats__note { font-size: 0.85rem; opacity: 0.75; }
    </style>
    <!-- stats-css:end -->'''

def render(root, st):
    p = root / 'about.html'; s = p.read_text(encoding='utf-8')
    def num(n): return f'{n:,}'
    def d(iso):
        y, m, dd = iso.split('-'); return f'{int(dd)} {MONTHS[int(m) - 1]} {y}'
    def bar(label, n, tot, pct):
        return (f'                <li class="bm-stats__row">\n                    <div class="bm-stats__head"><span>{label}</span>'
                f'<span>{num(n)} / {num(tot)} &middot; {pct}%</span></div>\n'
                f'                    <div class="bm-stats__bar" role="img" aria-label="{label}: {pct}% of PCDB boilers have a manual">'
                f'<span class="bm-stats__fill" style="width:{pct}%"></span></div>\n                </li>\n')
    rows = ''.join(bar(f['label'], f['with_manual'], f['pcdb_total'], f['pct']) for f in st['fuels'].values() if f['pcdb_total'])
    rows += (f'                <li class="bm-stats__row">\n                    <div class="bm-stats__head"><span>Electric</span>'
             f'<span>{num(st["electric"]["models_with_manual"])} models with a manual &middot; <em>not in PCDB</em></span></div>\n                </li>\n')
    o = st['pcdb_overall']; m = st['models']
    panel = f'''<!-- stats:start -->
        <section class="bm-stats" aria-labelledby="bm-stats-title">
            <h2 id="bm-stats-title">The library in numbers</h2>
            <ul class="bm-stats__grid">
                <li class="bm-stats__card"><span class="bm-stats__num">{num(st["manuals_total"])}</span><span class="bm-stats__lbl">manuals (PDF files on our CDN)</span></li>
                <li class="bm-stats__card"><span class="bm-stats__num">{num(m["with_manual"])} / {num(m["listed"])}</span><span class="bm-stats__lbl">listed models with a manual ({m["pct"]}%)</span></li>
                <li class="bm-stats__card"><span class="bm-stats__num">{o["pct"]}%</span><span class="bm-stats__lbl">of all {num(o["records"])} PCDB boilers have a verified manual ({num(o["with_manual"])})</span></li>
            </ul>
            <h3>PCDB boilers with a manual, by fuel</h3>
            <ul class="bm-stats__rows">
{rows}            </ul>
            <p class="bm-stats__note">A boiler counts when its GC number or PCDB index is on a row that links a manual we host. Data: SAP 10 PCDB revision {st["pcdb"]["revision"]}, updated {d(st["pcdb"]["file_date"])}.</p>
        </section>
        <!-- stats:end -->'''
    if '<!-- stats:start -->' in s:
        s = re.sub(r'<!-- stats:start -->.*?<!-- stats:end -->', lambda _: panel, s, flags=re.S)
    else:
        s = s.replace('    </main>', '        ' + panel + '\n    </main>', 1)
    if '<!-- stats-css:start -->' in s:
        s = re.sub(r'<!-- stats-css:start -->.*?<!-- stats-css:end -->', lambda _: CSS, s, flags=re.S)
    else:
        s = s.replace('</head>', '    ' + CSS + '\n</head>', 1)
    assert s.count('<!-- stats:start -->') == 1 and s.count('<!-- stats-css:start -->') == 1
    p.write_text(s, encoding='utf-8')

if __name__ == '__main__':
    main()
