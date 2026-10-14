"""Render the OneScan icon set (assets/*.png, assets/brand/) (design A, "scan frame") from one SVG source with headless Chromium.

    python3 make_icons.py OUT_DIR
"""
import os, subprocess, sys, glob

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
CHROME = sorted(glob.glob('/opt/pw-browsers/chromium-*/chrome-linux/chrome'))[0]

DEFS = """
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D7BFF"/><stop offset="1" stop-color="#0042B8"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7FE0FF" stop-opacity="0"/><stop offset=".5" stop-color="#7FE0FF"/><stop offset="1" stop-color="#7FE0FF" stop-opacity="0"/></linearGradient>
<mask id="pagecut"><rect width="1024" height="1024" fill="#fff"/>
  <g fill="#000"><rect x="424" y="452" width="196" height="22" rx="11"/><rect x="424" y="506" width="160" height="22" rx="11"/><rect x="424" y="614" width="176" height="22" rx="11"/><rect x="352" y="550" width="320" height="26" rx="13"/></g>
  <path d="M584 318 V398 H664 Z" fill="#000"/></mask>
"""

# The glyph, drawn on a 1024 canvas, centred at 512,512 (bounds 232..792).
CORNERS = """<g fill="none" stroke="#fff" stroke-width="54" stroke-linecap="round" stroke-linejoin="round">
  <path d="M232 352 V276 a44 44 0 0 1 44 -44 H352"/><path d="M672 232 H748 a44 44 0 0 1 44 44 V352"/>
  <path d="M792 672 V748 a44 44 0 0 1 -44 44 H672"/><path d="M352 792 H276 a44 44 0 0 1 -44 -44 V672"/></g>"""
GLYPH = CORNERS + """
<path d="M380 318 H584 L664 398 V706 H380 Z" fill="#fff"/>
<path d="M584 318 V398 H664 Z" fill="#B8CCFF"/>
<g fill="#9DB6F5"><rect x="424" y="452" width="196" height="22" rx="11"/><rect x="424" y="506" width="160" height="22" rx="11"/><rect x="424" y="614" width="176" height="22" rx="11"/></g>
<rect x="300" y="548" width="424" height="30" rx="15" fill="url(#beam)"/>
<rect x="352" y="557" width="320" height="12" rx="6" fill="#E9FBFF"/>"""
# Single colour (Android 13 themed icons): page with the text lines cut out, no beam glow.
MONO = CORNERS + """<path d="M380 318 H584 L664 398 V706 H380 Z" fill="#fff" mask="url(#pagecut)"/>"""


def scaled(g, s):
    """Glyph scaled about the canvas centre (adaptive icons: launchers show the middle 72/108)."""
    return f'<g transform="translate(512 512) scale({s}) translate(-512 -512)">{g}</g>'


ADAPTIVE = 0.67  # glyph = 55% of the visible icon, like the full icon; inside the 66 dp safe circle

ASSETS = {
    # Full-bleed square: stores and launchers apply their own corner masks.
    'icon.png': (1024, f'<rect width="1024" height="1024" fill="url(#bg)"/>{GLYPH}'),
    'play-store-icon-512.png': (512, f'<rect width="1024" height="1024" fill="url(#bg)"/>{GLYPH}'),
    'android-icon-foreground.png': (1024, scaled(GLYPH, ADAPTIVE)),
    'android-icon-background.png': (1024, '<rect width="1024" height="1024" fill="url(#bg)"/>'),
    'android-icon-monochrome.png': (1024, scaled(MONO, ADAPTIVE)),
    # Rounded tile for places that show the image as is (splash, web).
    'splash-icon.png': (1024, f'<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>{GLYPH}'),
    'favicon.png': (48, f'<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>{GLYPH}'),
}

for name, (px, body) in ASSETS.items():
    html = os.path.join(OUT, f'_{name}.html')
    open(html, 'w').write(
        f'<!doctype html><html><body style="margin:0;background:transparent">'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{px}" height="{px}" viewBox="0 0 1024 1024"><defs>{DEFS}</defs>{body}</svg>'
        f'</body></html>')
    subprocess.run([CHROME, '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
                    '--default-background-color=00000000', f'--window-size={max(px, 600) + 200},{max(px, 600) + 300}',
                    f'--screenshot={os.path.join(OUT, name)}', f'file://{html}'],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    os.remove(html)
    # The window is larger than the asset (the headless viewport is shorter than the
    # window): keep exactly the drawing.
    from PIL import Image
    path = os.path.join(OUT, name)
    Image.open(path).convert('RGBA').crop((0, 0, px, px)).save(path, optimize=True)
    print(name, px)

# The master drawing, for the repository / brand use.
open(os.path.join(OUT, 'onescan-logo.svg'), 'w').write(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs>{DEFS}</defs>'
    f'<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>{GLYPH}</svg>\n')
