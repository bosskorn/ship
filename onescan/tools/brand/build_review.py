"""Build the logo review: concept sheet + one presentation board per finalist.

    python3 tools/brand/build_review.py OUT_DIR

Writes SVG masters and PNGs per finalist, renders the real First Launch / Home screens
with each mark (src/__screens__/shoot.js, LOGO=…), then lays out the boards and
captures them with Chromium. Nothing in the app is changed.
"""
import os
import subprocess
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from symbols import CONCEPTS, symbol_svg  # noqa: E402
from symbols2 import CONCEPTS2  # noqa: E402

# Round 2 (owner: Slit OS reads as an S inside a circle): python3 build_review.py OUT 2
ROUND = sys.argv[2] if len(sys.argv) > 2 else '1'
ALL = CONCEPTS + CONCEPTS2

OUT = os.path.abspath(sys.argv[1])
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, '../..'))

# Colour system (flat; nothing depends on a gradient).
PRIMARY = '#0052D9'   # OneScan Blue
DARK = '#003B9C'      # pressed / on light tints
LIGHT = '#E8F0FF'     # tint surfaces
NIGHT = '#4D8DFF'     # brand on dark UI
INK = '#0A0F1A'       # pure-black stand-in for text and mono
WHITE = '#FFFFFF'

FINALISTS = ['A2', 'B5', 'C1', 'C3', 'B2'] if ROUND == '1' else ['R1', 'R3', 'R4', 'C1']
REJECTED = {
    'A1': 'Too close to Opera’s O and to a power symbol.',
    'A3': 'Reads as the London Underground roundel / theta.',
    'B1': 'Reads as a stock “file” icon with a hole.',
    'B3': 'Circle + rectangle reads as a camera.',
    'B4': 'Reads as a peeling sticker / pie chart.',
    'C2': 'Reads as the digit 5; the O is lost.',
    'R2': 'Clipped-corner rectangle reads as a SIM card.',
    'R5': 'The inward flap reads as a pie chart / clock hand.',
    'R6': 'Reads as a puzzle piece.',
    'R7': 'Reads as sync / refresh arrows; the S is snake-like.',
    'R8': 'Four tiles: too close to a well-known OS logo.',
}
NOTES = {
    'A2': ('Corner O', 'O + one page corner. The single square corner is the whole idea: one capture, one page. '
           'Simplest silhouette of the set; survives 16 px.',
           'Watch: a ring with one corner is related to the map-pin shape; ours keeps a 90° corner (a pin is acute) and points up-right, never down.'),
    'B5': ('Folded O', 'Round O whose one square corner folds in like paper. Most literal link to documents while staying an O.',
           'Watch: folded corners are common in file icons; here the fold sits on an O, not a page outline. Fold detail softens below 24 px.'),
    'C1': ('Shifted O', 'An O split and slid: the two halves draw an S. Most dynamic; reads as motion/speed.',
           'Watch: wave forms are used by audio and payment brands; keep the hard horizontal cut, never round it into a tilde.'),
    'C3': ('Slit OS', 'A solid O with two offset slits; the remaining material is an S. Most “enterprise”, works as a stamp or seal.',
           'Watch: S-in-a-circle marks exist (music, banking); ours is built only from straight slits, no curved S.'),
    'R1': ('One Cut', 'An O with one flat facet, like the straight edge of a sheet. One cut, one page: the simplest silhouette of round 2.',
           'Watch: round marks with a flat side exist (camera and fintech badges); ours is a ring, flat only at the top-right, never a full D.'),
    'R3': ('Creased Corner', 'Corner O with a single crease: the square corner reads as paper folded once.',
           'Watch: the crease thins below 24 px, where the mark falls back to the Corner O silhouette (still recognisable).'),
    'R4': ('Half Page', 'Left half an O, right half a sheet with square corners: O and page in one outline.',
           'Watch: can read as a lowercase a/d at text size; keep it as a symbol, never inside a word.'),
    'B2': ('Folded Square', 'A squared O in page proportions with a folded corner. Distinct square silhouette among round marks.',
           'Watch: closest to a generic document icon of the five; weakest as an ownable symbol.'),
}


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(text)


def concept(code):
    return next(c for c in ALL if c[0] == code)


def masters(code):
    """SVG masters + PNG renders for one finalist; returns paths."""
    fn = concept(code)[4]
    d = os.path.join(OUT, code)
    files = {
        'symbol-blue.svg': symbol_svg(fn, 'm', PRIMARY),
        'symbol-black.svg': symbol_svg(fn, 'm', INK),
        'symbol-white.svg': symbol_svg(fn, 'm', WHITE),
        'app-icon.svg': symbol_svg(fn, 'm', WHITE, bg=PRIMARY, scale=0.62),
        'app-icon-rounded.svg': symbol_svg(fn, 'm', WHITE, bg=PRIMARY, scale=0.62, radius=230),
        # Adaptive icon: 108 dp canvas, 72 dp visible -> same visual size as the full-bleed icon.
        'adaptive-foreground.svg': symbol_svg(fn, 'm', WHITE, scale=0.62 * 72 / 108),
    }
    for name, svg in files.items():
        write(os.path.join(d, name), svg + '\n')
    jobs = [(f'{d}/app-icon.svg', f'{d}/app-icon-512.png', 512), (f'{d}/app-icon-rounded.svg', f'{d}/app-icon-rounded-512.png', 512),
            (f'{d}/symbol-blue.svg', f'{d}/symbol-blue-512.png', 512)]
    subprocess.run(['node', f'{HERE}/raster.js', *[str(x) for j in jobs for x in j]], check=True)
    # True small sizes: downsample like a launcher does, then show them enlarged.
    src = Image.open(f'{d}/app-icon-rounded-512.png').convert('RGBA')
    for s in (16, 24, 32, 48, 64, 128):
        src.resize((s, s), Image.LANCZOS).save(f'{d}/px-{s}.png')
    return d


def real_screens(code, d):
    """First Launch and Home rendered from the app's own code with this mark."""
    env = dict(os.environ, LOGO=f'{d}/app-icon-rounded-512.png', ONLY='onboarding-1-th-light|1-th-light-docs|4-th-light-empty')
    shots = os.path.join(OUT, '_shots')
    subprocess.run(['node', 'src/__screens__/shoot.js', shots], cwd=APP, env=env, check=True, stdout=subprocess.DEVNULL)
    for n in ('onboarding-1-th-light', '1-th-light-docs', '4-th-light-empty'):
        im = Image.open(f'{shots}/{n}.png')
        im.crop((0, 0, im.width, min(im.height, int(im.width * 2.2)))).save(f'{d}/screen-{n}.png')


CSS = f'''
body{{margin:0;background:#F3F5F8;font-family:Inter,sans-serif;color:{INK}}}
.wrap{{padding:40px 48px}} h1{{font-size:30px;margin:0}} .sub{{color:#5B6478;margin:6px 0 28px}}
.grid{{display:grid;gap:18px}} .card{{background:#fff;border-radius:16px;padding:22px;box-shadow:0 1px 3px rgba(10,15,26,.06)}}
.card h3{{margin:0 0 14px;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#5B6478}}
.n{{display:inline-block;width:22px;height:22px;border-radius:11px;background:{PRIMARY};color:#fff;text-align:center;line-height:22px;font-size:12px;margin-right:8px}}
.row{{display:flex;align-items:center;gap:28px;flex-wrap:wrap}}
.lock{{display:flex;align-items:center;gap:18px;font-weight:700;letter-spacing:-.02em}}
.dark{{background:#0B1220}} .mid{{background:{LIGHT}}}
.px img{{image-rendering:pixelated}}
.lbl{{font-size:12px;color:#5B6478;text-align:center;margin-top:6px}}
.sw{{width:86px;height:56px;border-radius:10px;display:flex;align-items:flex-end;padding:6px;box-sizing:border-box;font-size:11px}}
'''


def lockup(fn, uid, color, text, size=96, font=64):
    return (f'<div class="lock" style="color:{text};font-size:{font}px">{symbol_svg(fn, uid, color, size)}'
            f'<span>OneScan</span></div>')


def phone_home(icon_png):
    apps = [('Phone', '#34A853'), ('Messages', '#4285F4'), ('Gallery', '#F4B400'), ('Calendar', '#EA4335'),
            ('Files', '#5F6368'), ('OneScan', None), ('Clock', '#3C4043'), ('Settings', '#80868B'),
            ('Notes', '#FBBC04'), ('Mail', '#DB4437'), ('Weather', '#1A73E8'), ('Camera', '#202124')]
    cells = ''
    for name, col in apps:
        icon = (f'<img src="file://{icon_png}" style="width:58px;height:58px;border-radius:29px">' if col is None
                else f'<div style="width:58px;height:58px;border-radius:29px;background:{col};opacity:.9"></div>')
        cells += f'<div style="display:flex;flex-direction:column;align-items:center;gap:6px">{icon}<span style="color:#fff;font-size:12px">{name}</span></div>'
    return (f'<div style="width:360px;height:520px;border-radius:28px;padding:56px 22px;box-sizing:border-box;'
            f'background:linear-gradient(160deg,#2B3A55,#121826);display:grid;grid-template-columns:repeat(4,1fr);row-gap:26px;align-content:start">{cells}</div>')


def board(code, d):
    name, why, risk = NOTES[code]
    fn = concept(code)[4]
    small = ''.join(f'<div><img src="file://{d}/px-{s}.png" style="width:{s}px;height:{s}px"><div class="lbl">{s}</div></div>' for s in (16, 24, 32, 48, 64, 128))
    zoom = ''.join(f'<div class="px"><img src="file://{d}/px-{s}.png" style="width:{s * 4}px;height:{s * 4}px"><div class="lbl">{s}px ×4</div></div>' for s in (16, 24, 32))
    masks = ''.join(f'<div><img src="file://{d}/app-icon-512.png" style="width:120px;height:120px;border-radius:{r}"><div class="lbl">{l}</div></div>'
                    for r, l in (('60px', 'Circle (Pixel)'), ('34px', 'Squircle'), ('22px', 'Rounded square'), ('0', 'Full-bleed (Play 512)')))
    swatches = ''.join(f'<div class="sw" style="background:{c};color:{t}">{n}<br>{c}</div>' for n, c, t in
                       (('Primary', PRIMARY, '#fff'), ('Dark', DARK, '#fff'), ('Light', LIGHT, INK), ('Night', NIGHT, '#fff'), ('Black', INK, '#fff'), ('White', WHITE, INK)))
    html = f'''<!doctype html><meta charset=utf-8><style>{CSS}</style><div class="wrap">
<h1>{code} · {name}</h1><div class="sub">{why}<br><b>Originality:</b> {risk}</div>
<div class="grid" style="grid-template-columns:1fr 1fr">
 <div class="card"><h3><span class="n">1</span>Symbol only</h3><div class="row" style="justify-content:center">{symbol_svg(fn, 's1', PRIMARY, 260)}</div></div>
 <div class="card"><h3><span class="n">2</span>Symbol + OneScan</h3><div class="row" style="height:260px;justify-content:center">{lockup(fn, 's2', PRIMARY, INK)}</div></div>
 <div class="card"><h3><span class="n">3</span>App icon — launcher masks</h3><div class="row">{masks}</div></div>
 <div class="card"><h3>Colour system</h3><div class="row" style="gap:10px">{swatches}</div></div>
 <div class="card"><h3><span class="n">4</span>Light background</h3><div class="row mid" style="padding:28px;border-radius:12px;gap:40px">
   {symbol_svg(fn, 's4', PRIMARY, 110)}{lockup(fn, 's4b', PRIMARY, INK, 64, 40)}</div></div>
 <div class="card"><h3><span class="n">5</span>Dark background</h3><div class="row dark" style="padding:28px;border-radius:12px;gap:40px">
   {symbol_svg(fn, 's5', NIGHT, 110)}{lockup(fn, 's5b', WHITE, WHITE, 64, 40)}</div></div>
 <div class="card"><h3><span class="n">6</span>Monochrome</h3><div class="row" style="gap:40px">
   {symbol_svg(fn, 's6', INK, 110)}<div style="background:{INK};padding:14px;border-radius:12px">{symbol_svg(fn, 's6b', WHITE, 110)}</div>
   <img src="file://{d}/app-icon-512.png" style="width:110px;height:110px;border-radius:26px;filter:grayscale(1)"></div></div>
 <div class="card"><h3><span class="n">7</span>Small sizes (actual pixels, then enlarged)</h3><div class="row" style="align-items:flex-end">{small}</div>
   <div class="row" style="margin-top:14px;align-items:flex-end">{zoom}</div></div>
 <div class="card"><h3><span class="n">8</span>Android home screen</h3><div class="row" style="justify-content:center">{phone_home(f'{d}/app-icon-512.png')}</div></div>
 <div class="card" style="grid-column:span 2"><h3><span class="n">9</span>First Launch &nbsp;·&nbsp; <span class="n">10</span>Home (rendered from app code)</h3>
   <div class="row" style="align-items:flex-start;gap:24px;justify-content:center">
   <img src="file://{d}/screen-onboarding-1-th-light.png" style="width:330px;border-radius:14px;border:1px solid #e3e6ec">
   <img src="file://{d}/screen-4-th-light-empty.png" style="width:330px;border-radius:14px;border:1px solid #e3e6ec">
   <img src="file://{d}/screen-1-th-light-docs.png" style="width:330px;border-radius:14px;border:1px solid #e3e6ec"></div></div>
</div></div>'''
    write(f'{OUT}/board-{code}.html', html)
    subprocess.run(['node', f'{HERE}/shoot.js', f'{OUT}/board-{code}.html', f'{OUT}/board-{code}.png', '1400'], check=True)


def concept_sheet():
    cells = ''
    for i, (code, direction, name, why, fn) in enumerate(CONCEPTS if ROUND == '1' else CONCEPTS2):
        tag = ('<b style="color:#1E8E3E">Finalist</b>' if code in FINALISTS
               else f'<span style="color:#B3261E">Not selected — {REJECTED.get(code, "")}</span>')
        cells += f'''<div class="card"><div class="row" style="gap:18px">
{symbol_svg(fn, f't{i}', WHITE, 120, bg=PRIMARY, scale=0.62, radius=230)}{symbol_svg(fn, f'p{i}', PRIMARY, 96)}
{symbol_svg(fn, f'k{i}', INK, 40)}{symbol_svg(fn, f's{i}', WHITE, 24, bg=PRIMARY, scale=0.62, radius=230)}</div>
<div style="margin-top:12px;font-weight:700">{code} · {name} <span style="color:#5B6478;font-weight:400">({direction})</span></div>
<div style="color:#5B6478;font-size:14px;margin:4px 0">{why}</div>{tag}</div>'''
    write(f'{OUT}/concepts.html', f'''<!doctype html><meta charset=utf-8><style>{CSS}</style><div class="wrap">
<h1>OneScan — {'' if ROUND == '1' else 'round 2: '}{len(CONCEPTS if ROUND == '1' else CONCEPTS2)} logo concepts</h1><div class="sub">Original vector geometry on a 1024 grid. App icon · symbol · mono · 24 px.</div>
<div class="grid" style="grid-template-columns:1fr 1fr">{cells}</div></div>''')
    subprocess.run(['node', f'{HERE}/shoot.js', f'{OUT}/concepts.html', f'{OUT}/concepts.png', '1300'], check=True)


def finalists_sheet():
    cells = ''
    for code in FINALISTS:
        name, why, _ = NOTES[code]
        d = os.path.join(OUT, code)
        cells += f'''<div class="card" style="text-align:center"><img src="file://{d}/app-icon-512.png" style="width:150px;border-radius:34px">
<div class="row" style="justify-content:center;margin:14px 0">{lockup(concept(code)[4], f'f{code}', PRIMARY, INK, 40, 26)}</div>
<div style="font-weight:700">{code} · {name}</div><div style="color:#5B6478;font-size:13px;margin-top:4px">{why}</div></div>'''
    write(f'{OUT}/finalists.html', f'''<!doctype html><meta charset=utf-8><style>{CSS}</style><div class="wrap">
<h1>OneScan — {len(FINALISTS)} finalists{'' if ROUND == '1' else ' (round 2)'}</h1><div class="sub">Side by side at the same size.</div>
<div class="grid" style="grid-template-columns:repeat({len(FINALISTS)},1fr)">{cells}</div></div>''')
    subprocess.run(['node', f'{HERE}/shoot.js', f'{OUT}/finalists.html', f'{OUT}/finalists.png', '1600'], check=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    concept_sheet()
    for code in FINALISTS:
        d = masters(code)
        real_screens(code, d)
        board(code, d)
        print('board', code)
    finalists_sheet()
