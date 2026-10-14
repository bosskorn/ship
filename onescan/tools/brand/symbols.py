"""OneScan brand-mark concepts as original vector geometry (1024 × 1024 grid, centre 512).

Each concept returns SVG markup drawn in `currentColor` (so one source serves the
blue, white, black and monochrome versions). Gaps that separate parts are real cuts
(masks), never a second colour, so every mark works flat without gradients.
"""
import math

C = 512  # centre


def circle_d(cx, cy, r):
    return f'M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0Z'


def ring(cx, cy, ro, ri):
    return f'<path fill-rule="evenodd" d="{circle_d(cx, cy, ro)}{circle_d(cx, cy, ri)}"/>'


def rrect_d(x, y, w, h, r):
    return (f'M{x + r} {y}H{x + w - r}A{r} {r} 0 0 1 {x + w} {y + r}V{y + h - r}A{r} {r} 0 0 1 {x + w - r} {y + h}'
            f'H{x + r}A{r} {r} 0 0 1 {x} {y + h - r}V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z')


def masked(uid, body, cuts):
    """`body` with `cuts` removed (white = keep, black = cut)."""
    return (f'<mask id="{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
            f'<rect width="1024" height="1024" fill="#fff"/><g fill="#000" stroke="#000">{cuts}</g></mask>'
            f'<g mask="url(#{uid})">{body}</g>')


# ---------------------------------------------------------------- A — One Frame

def a1_slot(u):
    """O with a tall slot: the '1' of One, and a page, in one negative space."""
    return f'<path fill-rule="evenodd" d="{circle_d(C, C, 300)}{rrect_d(447, 322, 130, 380, 65)}"/>'


def a2_corner_o(u):
    """A ring with exactly one square corner: O + the corner of a page / one capture corner."""
    r, k = 300, 28
    outer = (f'M{C - r} {C}A{r} {r} 0 0 0 {C} {C + r}A{r} {r} 0 0 0 {C + r} {C}'
             f'V{C - r + k}Q{C + r} {C - r} {C + r - k} {C - r}H{C}A{r} {r} 0 0 0 {C - r} {C}Z')
    return f'<path fill-rule="evenodd" d="{outer}{circle_d(C, C, 148)}"/>'


def a3_line_o(u):
    """A ring crossed by one capture line that runs past both sides."""
    return ring(C, C, 290, 170) + f'<rect x="132" y="481" width="760" height="62" rx="31"/>'


# ---------------------------------------------------------------- B — Folded O

def _fold(x, y, w, h, f, rad):
    """Rounded rect whose top-right corner is cut at 45° by `f` (the fold)."""
    return (f'M{x + rad} {y}H{x + w - f}L{x + w} {y + f}V{y + h - rad}A{rad} {rad} 0 0 1 {x + w - rad} {y + h}'
            f'H{x + rad}A{rad} {rad} 0 0 1 {x} {y + h - rad}V{y + rad}A{rad} {rad} 0 0 1 {x + rad} {y}Z')


def b1_page_o(u):
    """A page with its corner folded and an O cut through it."""
    x, y, w, h, f, g = 252, 172, 520, 680, 190, 26
    page = _fold(x, y, w, h, f, 44)
    flap = f'M{x + w - f} {y + g * 1.4}V{y + f - g * 0.3}Q{x + w - f} {y + f} {x + w - f + g * 0.3} {y + f}H{x + w - g * 1.4}Z'
    body = f'<path d="{page}"/>'
    cuts = f'<path d="M{x + w - f - g} {y - 10}H{x + w + 10}V{y + f + g}H{x + w - f - g}Z"/><circle cx="{C}" cy="{y + h - 250}" r="132"/>'
    return masked(u, body, cuts) + f'<path d="{flap}"/>'


def b2_fold_square(u):
    """A squared O (page proportions) with the top-right corner folded in."""
    x, y, s, f, g, t = 222, 222, 580, 210, 28, 150
    outer = _fold(x, y, s, s, f, 120)
    inner = rrect_d(x + t, y + t, s - 2 * t, s - 2 * t, 46)
    flap = f'M{x + s - f} {y + g * 1.5}V{y + f - g * 0.4}Q{x + s - f} {y + f} {x + s - f + g * 0.4} {y + f}H{x + s - g * 1.5}Z'
    body = f'<path fill-rule="evenodd" d="{outer}{inner}"/>'
    cuts = f'<path d="M{x + s - f - g} {y - 10}H{x + s + 10}V{y + f + g}H{x + s - f - g}Z"/>'
    return masked(u, body, cuts) + f'<path d="{flap}"/>'


def b3_layer_o(u):
    """Two sheets: a page behind, an O in front, separated by a clean cut."""
    back = f'<path d="{rrect_d(392, 192, 440, 440, 70)}"/>'
    cuts = f'<circle cx="440" cy="584" r="{252 + 34}"/>'
    return masked(u, back, cuts) + ring(440, 584, 252, 118)


def b4_fold_disc(u):
    """A disc with its top-right cap folded over along a chord: a paper O."""
    r, d, g = 300, 168, 26
    a = math.radians(-45)
    nx, ny = math.cos(a), math.sin(a)  # chord normal (towards top-right)
    half = math.sqrt(r * r - d * d)
    tx, ty = -ny, nx
    p1 = (C + nx * d + tx * half, C + ny * d + ty * half)
    p2 = (C + nx * d - tx * half, C + ny * d - ty * half)
    # Main disc minus everything beyond the chord (pulled back by the gap).
    keep_cut = (f'<path d="M{C + nx * (d - g / 2) + tx * 600} {C + ny * (d - g / 2) + ty * 600}'
                f'L{C + nx * 900 + tx * 600} {C + ny * 900 + ty * 600}L{C + nx * 900 - tx * 600} {C + ny * 900 - ty * 600}'
                f'L{C + nx * (d - g / 2) - tx * 600} {C + ny * (d - g / 2) - ty * 600}Z"/>')
    # The folded flap = the cap mirrored across the chord (an arc bulging inwards).
    flap = f'M{p1[0]:.1f} {p1[1]:.1f}A{r} {r} 0 0 1 {p2[0]:.1f} {p2[1]:.1f}Z'
    flap_gap = f'<path d="{flap}" stroke-width="{2 * g}" stroke-linejoin="round"/>'
    body = f'<circle cx="{C}" cy="{C}" r="{r}"/>'
    return masked(u, body, keep_cut + flap_gap) + f'<path d="{flap}"/>'


def b5_folded_o(u):
    """A round O whose one square corner is folded in like a page: O + paper + one fold."""
    r, f, g, k = 300, 196, 26, 28
    # Ring with a square top-right corner (as A2), the corner cut at 45° by the fold line.
    outer = (f'M{C - r} {C}A{r} {r} 0 0 0 {C} {C + r}A{r} {r} 0 0 0 {C + r} {C}'
             f'V{C - r + f}L{C + r - f} {C - r}H{C}A{r} {r} 0 0 0 {C - r} {C}Z')
    body = f'<path fill-rule="evenodd" d="{outer}{circle_d(C, C, 150)}"/>'
    # Flap: the cut-off corner folded down over the ring, kept apart by a gap.
    x0, y0 = C + r - f, C - r  # top end of the fold line
    x1, y1 = C + r, C - r + f  # right end
    flap = f'M{x0 + g * 0.7:.1f} {y0 + g * 1.7:.1f}L{x0 + g * 0.7:.1f} {y1 - g * 0.7 - 6:.1f}Q{x0 + g * 0.7:.1f} {y1 - g * 0.7:.1f} {x0 + g * 0.7 + 6:.1f} {y1 - g * 0.7:.1f}L{x1 - g * 1.7:.1f} {y1 - g * 0.7:.1f}Z'
    cuts = f'<path d="M{x0 - g * 0.3:.1f} {y0 + g:.1f}V{y1 + g * 0.3:.1f}H{x1 - g:.1f}Z" stroke-width="{g}" stroke-linejoin="round"/>'
    return masked(u, body, cuts) + f'<path d="{flap}"/>'


# ---------------------------------------------------------------- C — OS monogram

def c1_offset_halves(u):
    """An O split on the horizontal and slid apart: the halves trace an S."""
    ro, ri, s = 290, 150, 74
    top = f'M{C - ro} {C}A{ro} {ro} 0 0 1 {C + ro} {C}H{C + ri}A{ri} {ri} 0 0 0 {C - ri} {C}Z'
    bot = f'M{C - ro} {C}A{ro} {ro} 0 0 0 {C + ro} {C}H{C + ri}A{ri} {ri} 0 0 1 {C - ri} {C}Z'
    return f'<path transform="translate({-s} 0)" d="{top}"/><path transform="translate({s} 0)" d="{bot}"/>'


def c2_square_os(u):
    """A squared O with two openings: the stroke runs as an S."""
    return ('<path d="M792 238H238V512H786V786H232" fill="none" stroke="currentColor" stroke-width="128"'
            ' stroke-linejoin="round" stroke-linecap="butt" transform="translate(0 0)"/>')


def c3_disc_os(u):
    """A solid O with two offset slits: the material left is an S."""
    body = f'<circle cx="{C}" cy="{C}" r="300"/>'
    cuts = '<rect x="400" y="378" width="440" height="64" rx="32"/><rect x="184" y="582" width="440" height="64" rx="32"/>'
    return masked(u, body, cuts)


CONCEPTS = [
    ('A1', 'A — One Frame', 'O-Slot', 'O with one tall slot: the 1 of One and a page in a single negative space.', a1_slot),
    ('A2', 'A — One Frame', 'Corner O', 'A ring with exactly one square corner: O + the corner of a page, captured.', a2_corner_o),
    ('A3', 'A — One Frame', 'Line O', 'An O crossed by one capture line that runs past both sides.', a3_line_o),
    ('B1', 'B — Folded O', 'Page O', 'A page with a folded corner and an O cut through it.', b1_page_o),
    ('B2', 'B — Folded O', 'Folded Square', 'A squared O in page proportions whose top-right corner folds in.', b2_fold_square),
    ('B3', 'B — Folded O', 'Layer O', 'Two layers: a sheet behind, an O in front, split by a clean cut.', b3_layer_o),
    ('B4', 'B — Folded O', 'Paper Disc', 'A solid O with its top-right cap folded over along a chord.', b4_fold_disc),
    ('B5', 'B — Folded O', 'Folded O', 'A round O with one square corner folded in like a page.', b5_folded_o),
    ('C1', 'C — OS Monogram', 'Shifted O', 'An O split on the horizontal and slid apart: the halves trace an S.', c1_offset_halves),
    ('C2', 'C — OS Monogram', 'Square OS', 'A squared O with two openings: one continuous stroke reads as S.', c2_square_os),
    ('C3', 'C — OS Monogram', 'Slit OS', 'A solid O with two offset slits: the material left is an S.', c3_disc_os),
]


def symbol_svg(fn, uid, color, size=1024, bg=None, scale=1.0, tile=False, radius=0):
    """Standalone SVG. `tile` draws a full-bleed background (app icon); `scale` sizes the mark."""
    mark = fn(uid)
    t = f'translate(512 512) scale({scale}) translate(-512 -512)'
    back = ''
    if bg:
        back = f'<rect width="1024" height="1024" rx="{radius}" fill="{bg}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024" '
            f'style="color:{color}">{back}<g fill="currentColor" transform="{t}">{mark}</g></svg>')
