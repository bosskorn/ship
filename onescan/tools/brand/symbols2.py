"""Round 2 brand-mark concepts (owner feedback: "Slit OS" still reads as an S inside a circle).

Goal: an ownable silhouette first, meaning second. Same grid, helpers and flat-colour rules
as symbols.py.
"""
import math

from symbols import C, circle_d, masked, rrect_d


def _ring_with_corner(r=300, k=0, hole=150, corner_cut=0):
    """Ring whose top-right quadrant is a square corner; optional 45° cut of the corner."""
    if corner_cut:
        corner = f'V{C - r + corner_cut}L{C + r - corner_cut} {C - r}'
    else:
        corner = f'V{C - r + k}Q{C + r} {C - r} {C + r - k} {C - r}'
    outer = (f'M{C - r} {C}A{r} {r} 0 0 0 {C} {C + r}A{r} {r} 0 0 0 {C + r} {C}'
             f'{corner}H{C}A{r} {r} 0 0 0 {C - r} {C}Z')
    return outer, circle_d(C, C, hole)


# ---------------------------------------------------------------- A — One Frame

def r1_one_cut(u):
    """An O with one flat facet: a single straight edge, like the edge of a sheet."""
    r, d = 300, 212  # facet chord at distance d from the centre, top-right
    a = math.radians(-45)
    nx, ny = math.cos(a), math.sin(a)
    tx, ty = -ny, nx
    half = math.sqrt(r * r - d * d)
    p1 = (C + nx * d + tx * half, C + ny * d + ty * half)
    p2 = (C + nx * d - tx * half, C + ny * d - ty * half)
    outer = f'M{p1[0]:.1f} {p1[1]:.1f}A{r} {r} 0 1 1 {p2[0]:.1f} {p2[1]:.1f}Z'
    return f'<path fill-rule="evenodd" d="{outer}{circle_d(C, C, 148)}"/>'


def r2_page_one(u):
    """A page whose top-left corner is cut like the flag of a 1, with the 1's stem in negative space."""
    x, y, w, h, cut, rad = 262, 192, 500, 640, 190, 56
    page = (f'M{x + cut} {y}H{x + w - rad}A{rad} {rad} 0 0 1 {x + w} {y + rad}V{y + h - rad}A{rad} {rad} 0 0 1 {x + w - rad} {y + h}'
            f'H{x + rad}A{rad} {rad} 0 0 1 {x} {y + h - rad}V{y + cut}Z')
    stem = rrect_d(x + w - 236, y + 150, 112, h - 260, 56)
    return f'<path fill-rule="evenodd" d="{page}{stem}"/>'


def r3_creased_corner(u):
    """Corner O with a crease: the square corner is folded along one diagonal line."""
    outer, hole = _ring_with_corner(r=300, k=26, hole=148)
    body = f'<path fill-rule="evenodd" d="{outer}{hole}"/>'
    crease = f'<path d="M{C + 300 - 190} {C - 300 - 20}L{C + 300 + 20} {C - 300 + 190}" stroke-width="34"/>'
    return masked(u, body, crease)


# ---------------------------------------------------------------- B — Folded O

def r4_half_page(u):
    """Half round, half page: the left side is an O, the right side a sheet with square corners."""
    r, hole = 300, 148
    outer = (f'M{C} {C - r}H{C + r - 40}Q{C + r} {C - r} {C + r} {C - r + 40}V{C + r - 40}Q{C + r} {C + r} {C + r - 40} {C + r}'
             f'H{C}A{r} {r} 0 0 1 {C} {C - r}Z')
    return f'<path fill-rule="evenodd" d="{outer}{circle_d(C, C, hole)}"/>'


def r5_folded_corner_o(u):
    """Corner O whose corner is folded inward: the flap lies over the ring, kept apart by a gap."""
    r, f, g = 300, 210, 26
    outer, hole = _ring_with_corner(r=r, hole=148, corner_cut=f)
    body = f'<path fill-rule="evenodd" d="{outer}{hole}"/>'
    # The cut-off corner triangle, mirrored across the fold line (it points to the centre).
    x0, y0, x1, y1 = C + r - f, C - r, C + r, C - r + f
    tip = (C + r - f, C - r + f)
    flap = f'M{x0 + g * 0.2:.1f} {y0 + g * 1.6:.1f}L{tip[0] + g * 0.6:.1f} {tip[1] - g * 0.6:.1f}L{x1 - g * 1.6:.1f} {y1 - g * 0.2:.1f}Z'
    cut = f'<path d="M{x0 - 8} {y0 + 8}L{tip[0]} {tip[1]}L{x1 - 8} {y1 + 8}" fill="none" stroke-width="{g * 2}" stroke-linejoin="round"/>'
    return masked(u, body, cut) + f'<path d="{flap}" stroke="currentColor" stroke-width="10" stroke-linejoin="round"/>'


# ---------------------------------------------------------------- C — OS Monogram

def r6_stepped_os(u):
    """A squared O cut by one stepped line; the two interlocking halves trace O and S together."""
    body = f'<path d="{rrect_d(222, 222, 580, 580, 190)}"/>'
    g = 52
    cut = (f'<path d="M180 {452}H{560}V{572}H{860}" fill="none" stroke-width="{g}" stroke-linejoin="miter"/>'
           f'<circle cx="512" cy="512" r="0"/>')
    holes = f'<circle cx="400" cy="372" r="74"/><circle cx="624" cy="652" r="74"/>'
    return masked(u, body, cut + holes)


def r7_twin_d(u):
    """Two D-shapes rotated 180° and offset: an O split into halves that slide past each other."""
    r, w = 240, 120
    left = f'M{C - 20} {C - r - 60}A{r} {r} 0 0 0 {C - 20} {C + r - 60}Z'
    right = f'M{C + 20} {C - r + 60}A{r} {r} 0 0 1 {C + 20} {C + r + 60}Z'
    cuts = f'<circle cx="{C - 20 - 0}" cy="{C - 60}" r="{r - w}"/><circle cx="{C + 20}" cy="{C + 60}" r="{r - w}"/>'
    return masked(u, f'<path d="{left}"/><path d="{right}"/>', cuts)


def r8_quarter_os(u):
    """Four quarters: two round, two square, on a diagonal: O and S read from the same tile set."""
    s, g, r = 280, 28, 280
    x0, y0 = 512 - s - g / 2, 512 - s - g / 2
    x1, y1 = 512 + g / 2, 512 + g / 2
    tl = f'M{x0 + s} {y0 + s}H{x0}A{r} {r} 0 0 1 {x0 + s} {y0}Z'  # quarter disc, round top-left
    tr = f'<rect x="{x1}" y="{y0}" width="{s}" height="{s}" rx="20"/>'
    bl = f'<rect x="{x0}" y="{y1}" width="{s}" height="{s}" rx="20"/>'
    br = f'M{x1} {y1}H{x1 + s}A{r} {r} 0 0 1 {x1} {y1 + s}Z'  # quarter disc, round bottom-right
    return f'<path d="{tl}"/>{tr}{bl}<path d="{br}"/>'


CONCEPTS2 = [
    ('R1', 'A — One Frame', 'One Cut', 'An O with one flat facet: a single straight edge, like the edge of a sheet.', r1_one_cut),
    ('R2', 'A — One Frame', 'Page One', 'A page with its corner cut like the flag of a 1; the stem of the 1 is negative space.', r2_page_one),
    ('R3', 'A — One Frame', 'Creased Corner', 'An O with one square corner, folded along a single crease.', r3_creased_corner),
    ('R4', 'B — Folded O', 'Half Page', 'Half round, half sheet: an O whose right side has the square corners of a page.', r4_half_page),
    ('R5', 'B — Folded O', 'Folded Corner O', 'An O whose one corner folds inward over the ring.', r5_folded_corner_o),
    ('R6', 'C — OS Monogram', 'Stepped OS', 'A squared O split by one stepped line; the two halves interlock as an S.', r6_stepped_os),
    ('R7', 'C — OS Monogram', 'Twin D', 'Two half-O shapes sliding past each other: O from the outline, S from the offset.', r7_twin_d),
    ('R8', 'C — OS Monogram', 'Quarter OS', 'Four quarters, two round and two square on a diagonal: an O and an S in one tile set.', r8_quarter_os),
]
