#!/usr/bin/env python3
"""Build site coverage stats -> data/stats.json and the static stats panels in stats.html
(library in numbers, boilers by energy label, boiler type, and energy label by type).
about.html is no longer touched (the stats moved to stats.html on 23 Oct 2026).

Usage: python3 scripts/build_stats.py [--root .] [--pcdb path/to/pcdb10.dat]
The PCDB file defaults to $PCDB_DAT, then ./pcdb10.dat, then a download of
https://www.ncm-pcdb.org.uk/pcdb/pcdb10.dat. Re-run after any manual/link change.
Only links on https://cdn.boilermanuals.com/ count as a (verified) manual.
"""
import argparse, csv, html, json, os, re, urllib.parse, urllib.request
from pathlib import Path

CDN = 'https://cdn.boilermanuals.com/'
CONTROLS = {'danfoss', 'esi', 'google-nest', 'hive', 'salus', 'tado', 'drayton', 'honeywell', 'heatmiser'}
ELECTRIC_PAGES = {'amptec', 'ehc', 'fischer', 'strom', 'thermaflow', 'elnur', 'kospel'}
ELECTRIC_WORDS = re.compile(r'\b(electromax|amptec|electramate|eloblock|e-?tech [wsp]|electric (boiler|combi|flow boiler|system|storage combi))\b|,\s*Electric$', re.I)
NON_ELECTRIC_FUEL = re.compile(r'^\s*(ng|lpg|oil|hvo|natural gas|gas|ng/lpg)\b', re.I)
HEAT_PUMP = re.compile(r'heat pump|ashp|\bPCDB\b', re.I)
# PDFs whose link text says they are a brochure/catalogue/spec sheet are NOT counted as manuals
BROCHURE = re.compile(r'brochure|catalogue|catalog|spec sheet|technical specs|data ?sheet', re.I)
ELECTRIC_FUEL = re.compile(r'^\s*elec', re.I)
# heating controls listed on boiler pages (e.g. a thermostat manual on a boiler brand page)
CONTROL_ROW = re.compile(r'\b(thermostat|room stat|programmer|timeswitch|time switch)\b', re.I)
NOT_BOILER = re.compile(r'warm air|electricaire|storage heater|programmer|thermostat|timeswitch', re.I)
GC_TXT = re.compile(r'\bGC\s*(?:No\.?\s*)?(\d{2})[\s.\-/]?(\d{3})[\s.\-/]?(\d{2})(?!\d)', re.I)
GC_CELL = re.compile(r'^\s*(\d{2})[\s.\-/]?(\d{3})[\s.\-/]?(\d{2})\s*$')
GC_STRICT = re.compile(r'^\s*(?:g\.?\s*c\.?\s*(?:no\.?)?\s*)?(\d{2})\s*[./\-]?\s*(\d{3})\s*[./\-]?\s*(\d{2})\s*[a-z]{0,3}\s*$', re.I)
PCDB_TXT = re.compile(r'\bPCDB\s+((?:\d{6})(?:\s*/\s*\d{6})*)')
# Other PCDB boiler tables, counted by PCDB index only: (table, manufacturer column)
OTHER_TABLES = [('122', 4), ('131', 4), ('143', 5)]
CATEGORIES = [('122', 'solid_fuel', 'Solid fuel &amp; biomass'), ('131', 'cooker', 'Range cooker boilers'), ('143', 'micro_chp', 'Micro-CHP')]
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
    extra = {}
    for num, mfr_col in OTHER_TABLES:
        j = next((k for k, l in enumerate(lines) if l.startswith(f'${num},')), None)
        out = []
        if j is not None:
            for l in lines[j + 1:]:
                if l.startswith('$'): break
                if l.startswith('#') or not l.strip(): continue
                f = next(csv.reader([l.rstrip('\r')]))
                if f[mfr_col] == 'SAP Illustrative Products': continue  # SAP placeholder entries, not real products
                out.append(f)
        extra[num] = out
    return {'revision': rev[1], 'date': f'{rev[2]}-{rev[3]}-{rev[4]}', 'table105_date': f'{t105[3]}-{t105[4]}-{t105[5]}'}, recs, extra

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
            links = [(html.unescape(h), text_of(t)) for h, t in re.findall(r'<a\b[^>]*?href\s*=\s*"([^"]*)"[^>]*>(.*?)(?=</a>|<a\b|</td>|$)', tr, re.S)]
            hrefs = [h for h, _ in links]
            yield (p.stem, cells, cells[fi] if 0 <= fi < len(cells) else '', links, cells[gi] if 0 <= gi < len(cells) else '')

# ---- boilers by energy label and boiler type (counted from the brand-page tables) ----
LETTERS = ['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
EB_CELL = re.compile(r'class="eb eb-([es])(appp|app|ap|[a-g])\b')
TYPES = ['Combi', 'System', 'Regular', 'System/Regular', 'CPSU', 'Unknown']
CUE_COMBI = re.compile(r'\bcombi(?:s)?\b|\bcombination\b', re.I)
CUE_SYSTEM = re.compile(r'\bsystem\b|\bsys\b', re.I)
CUE_REGULAR = re.compile(r'\bregular\b|\bheat[- ]only\b|\bconventional\b|\bopen[- ]vent(?:ed)?\b|\b\d+\s?ri\b', re.I)
NOT_RATED_ROW = re.compile(r'heat pump|\bashp\b|hybrid|altherma', re.I)

def letter_of(code): return {'appp': 'A+++', 'app': 'A++', 'ap': 'A+'}.get(code, code.upper())

def brand_rows_raw(root):
    """yield (slug, model_text, fuel_text, gc_text, tr_html) for every brand-table row"""
    for p in sorted((root / 'brands').glob('*.html')):
        if p.name.startswith('_'): continue
        s = p.read_text(encoding='utf-8')
        t = re.search(r'<table[^>]*id="myTable".*?</table>', s, re.S)
        if not t: continue
        th = re.search(r'<thead.*?</thead>', t.group(0), re.S)
        labels = [text_of(x).lower() for x in re.findall(r'<th[^>]*>(.*?)</th>', th.group(0) if th else '', re.S)]
        fi = next((i for i, l in enumerate(labels) if l.startswith('fuel')), -1)
        gi = next((i for i, l in enumerate(labels) if l in ('gc', 'id') or re.match(r'^g\.?\s*c\b', l)), -1)
        mi = next((i for i, l in enumerate(labels) if re.search(r'model|description', l) and 'manual' not in l), -1)
        for tr in re.findall(r'<tr\b[^>]*>.*?</tr>', t.group(0), re.S):
            tds = re.findall(r'<td\b[^>]*>(.*?)</td>', tr, re.S)
            if not tds: continue
            cells = [text_of(x) for x in tds]
            pick = lambda i: cells[i] if 0 <= i < len(cells) else ''
            yield p.stem, pick(mi) or ' '.join(cells), pick(fi), pick(gi), tr

def energy_stats(root, recs):
    """Count every boiler row on the brand pages by the energy tile shown in its Energy cell, and by boiler type.
    Boiler rows = all brand-table rows except heating controls, heat pumps/hybrids, electric boilers, warm air units
    and '(any model)' request rows. Type: CCB badge -> Combi, CB badge -> System/Regular; otherwise the PCDB main type
    (field 15: 2 combi, 1 regular incl. system, 3 CPSU) of the PCDB record the row is identified by (PCDB index or GC
    number); System/Regular is split into System or Regular only when the model name says so unambiguously; rows with
    no PCDB type use clear model-name cues (combi / system / regular, heat only, conventional, open vent, Ri) only when
    exactly one cue matches."""
    byid = {f[0]: f for f in recs}
    bygc = {}
    for f in recs:
        g = GC_STRICT.match(f[8]) if f[11] in ('1', '2') else None
        if g: bygc.setdefault(''.join(g.groups()), set()).add(f[14])
    letters = {l: {'erp': 0, 'sap': 0} for l in LETTERS}
    by_type = {t: {**{l: 0 for l in LETTERS}, 'none': 0, 'total': 0} for t in TYPES}
    src = {k: 0 for k in ('ccb_badge', 'cb_badge', 'pcdb_main_type', 'name_cue', 'split_by_name_cue', 'unknown')}
    total = rated = 0
    for slug, model, fuel, gc, tr in brand_rows_raw(root):
        txt = model.strip()
        if not txt or '(any model)' in txt or slug in CONTROLS or CONTROL_ROW.search(txt) or NOT_BOILER.search(txt) or NOT_RATED_ROW.search(txt):
            continue
        if not NON_ELECTRIC_FUEL.match(fuel) and (slug in ELECTRIC_PAGES or ELECTRIC_FUEL.match(fuel) or ELECTRIC_WORDS.search(txt)):
            continue
        total += 1
        m = EB_CELL.search(tr)
        letter = letter_of(m.group(2)) if m else None
        if m:
            rated += 1; letters[letter]['erp' if m.group(1) == 'e' else 'sap'] += 1
        # boiler type
        t = None
        if '>CCB</span>' in tr: t = 'Combi'; src['ccb_badge'] += 1
        elif '>CB</span>' in tr: t = 'System/Regular'; src['cb_badge'] += 1
        else:
            mt = set()
            for pm in PCDB_TXT.finditer(txt):
                mt |= {byid[i][14] for i in re.findall(r'\d{6}', pm.group(1)) if i in byid}
            if not mt:
                g = GC_CELL.match(gc) or GC_TXT.search(txt)
                if g: mt = set(bygc.get(''.join(g.groups()), set()))
            mt.discard('0')
            if len(mt) == 1:
                t = {'2': 'Combi', '1': 'System/Regular', '3': 'CPSU'}.get(mt.pop())
                if t: src['pcdb_main_type'] += 1
        cues = [n for n, rx in (('Combi', CUE_COMBI), ('System', CUE_SYSTEM), ('Regular', CUE_REGULAR)) if rx.search(txt)]
        if t == 'System/Regular' and len(cues) == 1 and cues[0] in ('System', 'Regular'):
            t = cues[0]; src['split_by_name_cue'] += 1
        elif t is None and len(cues) == 1:
            t = cues[0]; src['name_cue'] += 1
        if t is None: t = 'Unknown'; src['unknown'] += 1
        b = by_type[t]; b['total'] += 1; b[letter if letter else 'none'] += 1
    for l in LETTERS: letters[l]['total'] = letters[l]['erp'] + letters[l]['sap']
    return {'boiler_rows': total, 'rated': rated, 'no_rating': total - rated,
            'pct_rated': round(100 * rated / total, 1) if total else 0, 'letters': letters,
            'by_type': {k: v for k, v in by_type.items() if v['total'] or k != 'CPSU'}, 'type_sources': src,
            'method': 'Counted per row from the Energy column of the brand pages. ErP class where published, otherwise efficiency band from SAP seasonal efficiency (SEDBUK 2009 scale). ' + energy_stats.__doc__.split('\n', 1)[1].strip().replace('\n    ', ' ')}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--root', default='.'); ap.add_argument('--pcdb', default=None)
    a = ap.parse_args(); root = Path(a.root)
    pc = a.pcdb or os.environ.get('PCDB_DAT') or ('pcdb10.dat' if Path('pcdb10.dat').exists() else None)
    meta, recs, extra = load_pcdb(pc)

    rows = list(site_rows(root))
    # a CDN PDF is a brochure if every link to it on the site is labelled as a brochure/spec sheet
    labels = {}
    for _, _, _, links, _ in rows:
        for h, t in links:
            if is_cdn_pdf(h): labels.setdefault(cdn_key(h), []).append(t)
    brochures = {k for k, ts in labels.items() if all(BROCHURE.search(t) for t in ts)}
    is_manual = lambda h: is_cdn_pdf(h) and cdn_key(h) not in brochures
    controls_listed = set(); controls_with = set(); control_files = set(); controls_elsewhere = 0
    manuals = set(); gcs_with = set(); pcdb_with = set(); electric_with = set(); electric_listed = set(); brochure_rows = 0
    for slug, cells, fuel, links, gccell in rows:
        hrefs = [h for h, _ in links]
        pdfs = [h for h in hrefs if is_manual(h)]
        for h in pdfs: manuals.add(cdn_key(h))
        txt = ' '.join(cells)
        is_control = slug in CONTROLS or bool(CONTROL_ROW.search(txt))
        if is_control and txt.strip() and '(any model)' not in txt:
            controls_listed.add((slug, txt)); controls_elsewhere += slug not in CONTROLS
            if pdfs: controls_with.add((slug, txt)); control_files.update(cdn_key(h) for h in pdfs)
        if is_control: continue
        if slug not in CONTROLS and not NOT_BOILER.search(txt) and not HEAT_PUMP.search(txt) and not NON_ELECTRIC_FUEL.match(fuel) \
                and (slug in ELECTRIC_PAGES or ELECTRIC_FUEL.match(fuel) or ELECTRIC_WORDS.search(txt)) and txt.strip():
            if '(any model)' not in txt:
                electric_listed.add((slug, txt))
                if pdfs: electric_with.add((slug, txt))
                elif any(is_cdn_pdf(h) for h in hrefs): brochure_rows += 1
        if not pdfs or slug in CONTROLS: continue
        m = GC_CELL.match(gccell)
        if m: gcs_with.add(''.join(m.groups()))
        for m in GC_TXT.finditer(txt): gcs_with.add(''.join(m.groups()))
        for m in PCDB_TXT.finditer(txt): pcdb_with.update(re.findall(r'\d{6}', m.group(1)))
    idx = json.loads((root / 'js/boiler-search-index.json').read_text(encoding='utf-8'))
    models = [r for r in idx if r['brandUrl'].split('/')[-1][:-5] not in CONTROLS and not CONTROL_ROW.search(r['model']) and '(any model)' not in r['model']]
    with_manual = [r for r in models if is_manual(r['downloadUrl'])]
    for r in idx:
        if is_manual(r['downloadUrl']): manuals.add(cdn_key(r['downloadUrl']))
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
    cats = {}; cat_with = 0; cat_total = 0
    for num, key, label in CATEGORIES:
        rs = extra.get(num, []); n = sum(1 for f in rs if f[0] in pcdb_with)
        cats[key] = {'label': label, 'pcdb_table': int(num), 'pcdb_total': len(rs), 'with_manual': n, 'pct': round(100 * n / len(rs), 1) if rs else 0}
        cat_with += n; cat_total += len(rs)
    other = len([f for f in recs if f[11] not in {c for c, _, _ in FUELS}])
    energy = energy_stats(root, recs)
    stats = {
        'generated': meta['date'] and __import__('datetime').date.today().isoformat(),
        'pcdb': {'source': 'SAP 10 PCDB (pcdb10.dat): table 105 gas and oil boilers, table 122 solid fuel and biomass boilers, table 131 twin-burner range cooker boilers, table 143 micro-CHP (SAP illustrative placeholder entries excluded)', 'revision': meta['revision'],
                 'file_date': meta['date'], 'table105_date': meta['table105_date'], 'records': len(recs), 'other_fuel_records': other},
        'manuals_total': len(manuals),
        'models': {'listed': len(models), 'with_manual': len(with_manual), 'pct': round(100 * len(with_manual) / len(models), 1)},
        'fuels': fuels,
        'categories': cats,
        'electric': {'models_listed': len(electric_listed), 'models_with_manual': len(electric_with),
                     'pct': round(100 * len(electric_with) / len(electric_listed), 1) if electric_listed else 0,
                     'brochure_only_rows_excluded': brochure_rows, 'note': 'not in PCDB; share of the electric models we list, not part of the PCDB overall figure'},
        'controls': {'models_listed': len(controls_listed), 'models_with_manual': len(controls_with),
                     'pct': round(100 * len(controls_with) / len(controls_listed), 1) if controls_listed else 0,
                     'files': len(control_files), 'listed_on_boiler_pages': controls_elsewhere, 'pages': sorted(CONTROLS),
                     'note': 'not in PCDB; heating controls (thermostats, programmers, smart controls) from the controls brand pages linked on controls.html plus control rows on boiler pages. Excluded from the boiler model totals and from the PCDB figures.'},
        'brochure_pdfs_excluded': sorted(brochures),
        'pcdb_overall': {'records': len(recs) + cat_total, 'with_manual': total_with + cat_with, 'pct': round(100 * (total_with + cat_with) / (len(recs) + cat_total), 1),
                         'denominator': 'all PCDB boiler records: table 105 gas/oil + table 122 solid fuel and biomass + table 131 range cooker boilers + table 143 micro-CHP'},
        'pcdb_gas_oil': {'records': len(recs), 'with_manual': total_with, 'pct': round(100 * total_with / len(recs), 1), 'note': 'table 105 only (the figure published before solid fuel, cooker boilers and micro-CHP were added)'},
        'energy': energy,
        'method': 'A PCDB record counts when its GC number (gas/LPG) or its PCDB index appears on a site row that links a PDF on cdn.boilermanuals.com. Brochure/spec-sheet-only PDFs are not counted as manuals anywhere.',
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
        .eb { display: inline-flex; align-items: center; justify-content: center; width: 1.6em; height: 1.6em; border-radius: 3px; font: 700 0.9em/1 system-ui, sans-serif; color: #fff; flex: none; }
        .eb-s { font-size: 0.6em; letter-spacing: -0.04em; }
        .eb-appp { background: #006b31; } .eb-app { background: #008a3e; } .eb-ap { background: #4cb848; } .eb-a { background: #00a651; }
        .eb-b { background: #8cc63f; color: #333; } .eb-c { background: #d7df23; color: #333; } .eb-d { background: #fff200; color: #333; }
        .eb-e { background: #fdb913; color: #333; } .eb-f { background: #f37021; } .eb-g { background: #ed1c24; } .eb-none { background: #e2e8f0; color: #475569; }
        .bm-echart { margin: 1rem 0 1.25rem; padding: 0; list-style: none; }
        .bm-echart__row { display: grid; grid-template-columns: 2rem minmax(0, 1fr) 4.5rem; align-items: center; column-gap: 0.6rem; row-gap: 0.1rem; margin: 0 0 0.45rem; font-size: 0.9rem; }
        .bm-echart__bar { height: 0.9rem; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
        .bm-echart__fill { display: block; height: 100%; border-radius: 999px; min-width: 2px; }
        .bm-echart__num { white-space: nowrap; font-variant-numeric: tabular-nums; }
        .bm-echart__num { text-align: right; }
        .bm-echart__sub { grid-column: 2 / 4; font-size: 0.78rem; opacity: 0.7; }
        .bm-xtab-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0.75rem 0 1rem; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
        .bm-xtab { border-collapse: collapse; width: 100%; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
        .bm-xtab th, .bm-xtab td { padding: 0.45rem 0.4rem; text-align: right; border-bottom: 1px solid #eef2f6; white-space: nowrap; }
        .bm-xtab th:first-child, .bm-xtab td:first-child { text-align: left; position: sticky; left: 0; background: #fff; }
        .bm-xtab thead th { font-weight: 600; background: #f7f8f9; }
        .bm-xtab thead th:first-child { background: #f7f8f9; }
        .bm-xtab tbody tr:last-child td { border-bottom: none; }
        .bm-xtab tfoot td { font-weight: 700; border-top: 1px solid #e2e8f0; border-bottom: none; }
        .bm-xtab .eb { width: 1.45rem; height: 1.45rem; font-size: 0.72rem; }
    </style>
    <!-- stats-css:end -->'''

def tile(letter):
    if letter is None: return '<span class="eb eb-none" aria-hidden="true">&ndash;</span>'
    k = letter.replace('+', 'p').lower()
    return f'<span class="eb eb-{k}{" eb-s" if "++" in letter else ""}" aria-hidden="true">{letter}</span>'

def energy_panel(e, num):
    COL = {'A+++': '#006b31', 'A++': '#008a3e', 'A+': '#4cb848', 'A': '#00a651', 'B': '#8cc63f', 'C': '#d7df23', 'D': '#fff200', 'E': '#fdb913', 'F': '#f37021', 'G': '#ed1c24'}
    L = e['letters']; shown = [l for l in LETTERS if L[l]['total'] or l in 'ABCDEFG']
    mx = max([L[l]['total'] for l in shown] + [e['no_rating'], 1])
    def row(lbl_tile, label, n, colour, detail):
        w = round(100 * n / mx, 1)
        return (f'                <li class="bm-echart__row">{lbl_tile}<span class="bm-echart__bar" role="img" aria-label="{label}: {num(n)} boilers">'
                f'<span class="bm-echart__fill" style="width:{w}%;background:{colour}"></span></span>'
                f'<span class="bm-echart__num">{num(n)}</span>{detail}</li>\n')
    rows = ''
    for l in shown:
        d = L[l]
        detail = f'<span class="bm-echart__sub">{num(d["erp"])} ErP class &middot; {num(d["sap"])} efficiency band</span>' if d['erp'] and d['sap'] else ('<span class="bm-echart__sub">ErP class</span>' if d['erp'] else '')
        rows += row(tile(l), l, d['total'], COL[l], detail)
    rows += row(tile(None), 'No rating yet', e['no_rating'], '#94a3b8', '<span class="bm-echart__sub">No rating yet</span>')
    bt = e['by_type']; types = [t for t in TYPES if t in bt]
    cards = ''.join(f'                <li class="bm-stats__card"><span class="bm-stats__num">{num(bt[t]["total"])}</span><span class="bm-stats__lbl">{t}</span></li>\n' for t in types)
    cols = [l for l in shown if any(bt[t][l] for t in types)]
    head = ''.join(f'<th scope="col"><span class="eb eb-{l.replace("+", "p").lower()}{" eb-s" if "++" in l else ""}" role="img" aria-label="{l}">{l}</span></th>' for l in cols)
    body = ''.join(f'                    <tr><th scope="row">{t}</th>' + ''.join(f'<td>{num(bt[t][l])}</td>' for l in cols)
                   + f'<td>{num(bt[t]["none"])}</td><td>{num(bt[t]["total"])}</td></tr>\n' for t in types)
    foot = '<tr><td>All boilers</td>' + ''.join(f'<td>{num(L[l]["total"])}</td>' for l in cols) + f'<td>{num(e["no_rating"])}</td><td>{num(e["boiler_rows"])}</td></tr>'
    return f"""<!-- energy-stats:start -->
        <section class="bm-stats" aria-labelledby="bm-energy-title">
            <h2 id="bm-energy-title">Boilers by energy label</h2>
            <p>{num(e["rated"])} of the {num(e["boiler_rows"])} boilers listed on our brand pages ({e["pct_rated"]}%) show an energy letter.</p>
            <ul class="bm-echart">
{rows}            </ul>
            <h3 id="bm-type-title">Boilers by type</h3>
            <ul class="bm-stats__grid" aria-labelledby="bm-type-title">
{cards}            </ul>
            <h3 id="bm-xtab-title">Energy label by boiler type</h3>
            <div class="bm-xtab-wrap" role="region" aria-labelledby="bm-xtab-title" tabindex="0">
                <table class="bm-xtab">
                    <thead><tr><th scope="col">Type</th>{head}<th scope="col">No rating</th><th scope="col">Total</th></tr></thead>
                    <tbody>
{body}                    </tbody>
                    <tfoot>{foot}</tfoot>
                </table>
            </div>
            <p class="bm-stats__note">Energy letters: ErP class where published, otherwise efficiency band from SAP seasonal efficiency (SEDBUK 2009 scale). Each boiler row on a brand page counts once; heating controls, heat pumps, electric boilers and request-only rows are not included. Boiler type comes from the CCB/CB badge or the PCDB boiler type, or else from the model name when it clearly says combi, system or regular. System/Regular means the data doesn&rsquo;t say which of the two it is.{" CPSU is a combined primary storage unit." if "CPSU" in bt else ""}</p>
        </section>
        <!-- energy-stats:end -->"""

def render(root, st):
    p = root / 'stats.html'
    assert p.exists(), 'stats.html missing: it holds the stats panels (moved from about.html)'
    s = p.read_text(encoding='utf-8')
    def num(n): return f'{n:,}'
    def d(iso):
        y, m, dd = iso.split('-'); return f'{int(dd)} {MONTHS[int(m) - 1]} {y}'
    def bar(label, n, tot, pct):
        return (f'                <li class="bm-stats__row">\n                    <div class="bm-stats__head"><span>{label}</span>'
                f'<span>{num(n)} / {num(tot)} &middot; {pct}%</span></div>\n'
                f'                    <div class="bm-stats__bar" role="img" aria-label="{label}: {pct}% of PCDB boilers have a manual">'
                f'<span class="bm-stats__fill" style="width:{pct}%"></span></div>\n                </li>\n')
    rows = ''.join(bar(f['label'], f['with_manual'], f['pcdb_total'], f['pct']) for f in st['fuels'].values() if f['pcdb_total'])
    rows += ''.join(bar(f['label'], f['with_manual'], f['pcdb_total'], f['pct']) for f in st.get('categories', {}).values() if f['pcdb_total'])
    e = st['electric']
    rows += (f'                <li class="bm-stats__row">\n                    <div class="bm-stats__head"><span>Electric</span>'
             f'<span>{num(e["models_with_manual"])} / {num(e["models_listed"])} &middot; {e["pct"]}% <em>of models we list (not in PCDB)</em></span></div>\n'
             f'                    <div class="bm-stats__bar" role="img" aria-label="Electric: {e["pct"]}% of the electric boiler models we list have a manual">'
             f'<span class="bm-stats__fill" style="width:{e["pct"]}%"></span></div>\n                </li>\n')
    c = st['controls']
    rows += (f'                <li class="bm-stats__row">\n                    <div class="bm-stats__head"><span>Controls</span>'
             f'<span>{num(c["models_with_manual"])} / {num(c["models_listed"])} &middot; {c["pct"]}% <em>of controls we list (not in PCDB)</em> &middot; {num(c["files"])} PDF files</span></div>\n'
             f'                    <div class="bm-stats__bar" role="img" aria-label="Controls: {c["pct"]}% of the heating controls we list have a manual">'
             f'<span class="bm-stats__fill" style="width:{c["pct"]}%"></span></div>\n                </li>\n')
    o = st['pcdb_overall']; m = st['models']
    panel = f'''<!-- stats:start -->
        <section class="bm-stats" aria-labelledby="bm-stats-title">
            <h2 id="bm-stats-title">The library in numbers</h2>
            <ul class="bm-stats__grid">
                <li class="bm-stats__card"><span class="bm-stats__num">{num(st["manuals_total"])}</span><span class="bm-stats__lbl">manuals (PDF files on our CDN)</span></li>
                <li class="bm-stats__card"><span class="bm-stats__num">{num(m["with_manual"])} / {num(m["listed"])}</span><span class="bm-stats__lbl">listed boiler models with a manual ({m["pct"]}%)</span></li>
                <li class="bm-stats__card"><span class="bm-stats__num">{o["pct"]}%</span><span class="bm-stats__lbl">of all {num(o["records"])} PCDB boilers (gas, oil, solid fuel, cooker boilers and micro-CHP) have a verified manual ({num(o["with_manual"])})</span></li>
            </ul>
            <h3>PCDB boilers with a manual, by fuel and type</h3>
            <ul class="bm-stats__rows">
{rows}            </ul>
            <p class="bm-stats__note">A boiler counts when its GC number or PCDB index is on a row that links a manual we host; brochures and spec sheets don&rsquo;t count. Solid fuel and biomass boilers, range cooker boilers and micro-CHP units are counted by PCDB index. The PCDB total is all {num(o["records"])} boiler records in PCDB tables 105, 122, 131 and 143. Electric boilers are not in the PCDB, so they are shown against the models we list and are not part of the PCDB figure. Heating controls are counted separately and are not included in the boiler totals. Data: SAP 10 PCDB revision {st["pcdb"]["revision"]}, updated {d(st["pcdb"]["file_date"])}.</p>
        </section>
        <!-- stats:end -->'''
    epanel = energy_panel(st['energy'], num)
    for a, b, new in (('<!-- stats:start -->', '<!-- stats:end -->', panel), ('<!-- energy-stats:start -->', '<!-- energy-stats:end -->', epanel)):
        if a in s:
            s = re.sub(re.escape(a) + '.*?' + re.escape(b), lambda _: new, s, flags=re.S)
        else:
            s = s.replace('    </main>', '        ' + new + '\n    </main>', 1)
    # keep the Dataset description (JSON-LD) in step with the panel
    s = re.sub(r'Index of [\d,]+ UK boiler models with GC numbers, fuel type and links to [\d,]+ checked',
               f'Index of {num(m["listed"])} UK boiler models with GC numbers, fuel type and links to {num(st["manuals_total"])} checked', s)
    s = re.sub(r'based on the SAP 10 PCDB \(revision \d+\)', f'based on the SAP 10 PCDB (revision {st["pcdb"]["revision"]})', s)
    if '<!-- stats-css:start -->' in s:
        s = re.sub(r'<!-- stats-css:start -->.*?<!-- stats-css:end -->', lambda _: CSS, s, flags=re.S)
    else:
        s = s.replace('</head>', '    ' + CSS + '\n</head>', 1)
    assert s.count('<!-- stats:start -->') == 1 and s.count('<!-- stats-css:start -->') == 1 and s.count('<!-- energy-stats:start -->') == 1
    p.write_text(s, encoding='utf-8')

if __name__ == '__main__':
    main()
