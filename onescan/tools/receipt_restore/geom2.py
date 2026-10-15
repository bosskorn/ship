"""
Receipt Restore R2 — geometry measured against the flat reference, along the receipt's own text
lines (known exactly from the generator's line boxes), instead of glyph-baseline fitting
(R1's line metric had a ~2 px noise floor). All measures come from one dense flow from the flat
reference to the output (both tone-normalised, output resized to the reference width).

  line_curv      local line curvature: per text line, residual (px @576) of the vertical flow along
                 the line after a straight-line fit; mean over lines. 0 = every line straight.
  line_tilt      spread (std, degrees) of the lines' fitted slopes: lines parallel to each other.
  col_align      vertical alignment of the right-aligned amount column: std (px @576) of the
                 horizontal flow at the lines' right ends after removing a linear trend.
  scale_dev      local scale distortion: median |det(J) - 1| on ink (J = Jacobian of the mapping).
  char_deform    character deformation: median (s1/s2 - 1) of J's singular values on ink (shear /
                 anisotropic stretch makes glyphs non-uniform).
  aspect_err     |log((out h/w) / (ref h/w))|: receipt proportions preserved (0 = exact).
  unmatched_ink  fraction of reference ink with no matching output after alignment (content
                 missing, cropped or garbled).
  line_sim       per text line: NCC between reference line and the aligned output line (used to
                 tell OCR instability from content damage).

Also: inverse oracle map (flat -> photo) and the Coons-patch boundary flattening used by
methods_r2.py.
"""
import cv2
import numpy as np

W = 576


def _norm(img_bgr_or_gray):
    import methods
    g = img_bgr_or_gray if img_bgr_or_gray.ndim == 2 else None
    bgr = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR) if g is not None else img_bgr_or_gray
    return cv2.cvtColor(methods.tone(bgr, 'crisp'), cv2.COLOR_BGR2GRAY)


def measure(ref_gray, out_bgr, line_boxes, normalise_out=True):
    rh, rw = ref_gray.shape
    k = W / rw
    r = cv2.resize(ref_gray, (W, int(round(rh * k))), interpolation=cv2.INTER_AREA)
    o_full = _norm(out_bgr) if normalise_out else cv2.cvtColor(out_bgr, cv2.COLOR_BGR2GRAY)
    oh, ow = o_full.shape
    aspect_err = float(abs(np.log((oh / ow) / (rh / rw))))
    o = cv2.resize(o_full, (r.shape[1], r.shape[0]), interpolation=cv2.INTER_AREA)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    flow = dis.calc(r, o, None)
    H, Wd = r.shape
    yy, xx = np.mgrid[0:H, 0:Wd].astype(np.float32)
    aligned = cv2.remap(o, xx + flow[:, :, 0], yy + flow[:, :, 1], cv2.INTER_LINEAR, borderValue=255)
    ink = r < 160
    # unmatched ink: reference ink whose aligned output is paper-white
    unmatched = float(((aligned > 200) & ink).sum() / max(1, ink.sum()))
    f = cv2.GaussianBlur(flow, (0, 0), 3)
    ux, uy = np.gradient(f[:, :, 0], axis=1), np.gradient(f[:, :, 0], axis=0)
    vx, vy = np.gradient(f[:, :, 1], axis=1), np.gradient(f[:, :, 1], axis=0)
    a, b, c, d = 1 + ux, uy, vx, 1 + vy
    det = a * d - b * c
    # singular values of [[a, b], [c, d]]
    s = np.sqrt(np.maximum(0, (a - d) ** 2 + (b + c) ** 2))
    t = np.sqrt(np.maximum(0, (a + d) ** 2 + (b - c) ** 2))
    s1, s2 = (t + s) / 2, np.abs(t - s) / 2
    aniso = s1 / np.maximum(s2, 1e-3) - 1
    scale_dev = float(np.median(np.abs(det[ink] - 1))) if ink.any() else float('nan')
    char_deform = float(np.median(aniso[ink])) if ink.any() else float('nan')
    curv, slopes, rights, sims = [], [], [], []
    for (x0, y0, x1, y1) in line_boxes:
        # line_sim stays index-aligned with line_boxes / gt lines (None = line not measurable)
        X0, X1 = int(x0 * k), int(x1 * k)
        Y0, Y1 = int(y0 * k), int(y1 * k)
        yc = (Y0 + Y1) // 2
        if yc >= H or X1 - X0 < 20:
            sims.append(None)
            continue
        band = ink[Y0:Y1, X0:X1]
        cols = np.where(band.any(0))[0]
        ra = r[Y0:Y1, X0:X1].astype(np.float32)
        oa = aligned[Y0:Y1, X0:X1].astype(np.float32)
        sims.append(float(((ra - ra.mean()) * (oa - oa.mean())).mean() / (ra.std() * oa.std())) if ra.std() > 1 and oa.std() > 1 else 0.0)
        if len(cols) < 10:
            continue
        xs = cols + X0
        v = flow[yc, xs, 1]
        p = np.polyfit(xs, v, 1)
        curv.append(float(np.mean(np.abs(np.polyval(p, xs) - v))))
        slopes.append(float(np.degrees(np.arctan(p[0]))))
        rights.append((yc, float(flow[yc, xs.max(), 0])))
    col = float('nan')
    if len(rights) >= 4:
        ys = np.array([q[0] for q in rights], np.float32)
        us = np.array([q[1] for q in rights], np.float32)
        p = np.polyfit(ys, us, 1)
        col = float(np.std(us - np.polyval(p, ys)))
    return {
        'line_curv': float(np.mean(curv)) if curv else float('nan'), 'line_tilt': float(np.std(slopes)) if slopes else float('nan'),
        'col_align': col, 'scale_dev': scale_dev, 'char_deform': char_deform, 'aspect_err': aspect_err,
        'unmatched_ink': unmatched, 'ld': float(np.linalg.norm(flow, axis=2)[ink].mean()) if ink.any() else float('nan'),
        'line_sim': sims,
    }


def boundary_metrics(quad, true_corners, mask, q, line_boxes_flat, flat_x, flat_y, frame):
    """Detector quality against the true paper: corner error, IoU with the true paper mask, and
    which printed lines / codes the quad cuts off (header, footer, sides)."""
    quad = np.float32(quad)
    FW, FH = frame
    diag = float(np.hypot(FW, FH))
    tc = np.float32(true_corners)
    order = [np.roll(np.arange(4), s) for s in range(4)]
    err = min(float(np.linalg.norm(quad[o] - tc, axis=1).max()) for o in order)
    poly = np.zeros(mask.shape, np.uint8)
    cv2.fillPoly(poly, [np.int32(quad / q)], 1)
    inter = float((poly.astype(bool) & mask).sum())
    union = float((poly.astype(bool) | mask).sum())
    iou = inter / max(1, union)
    # Each frame cell inside the paper knows its flat coordinate; a printed line is clipped when
    # some of its cells fall outside the quad.
    inside = poly.astype(bool) & mask
    clipped = []
    for (x0, y0, x1, y1) in line_boxes_flat:
        cell = mask & (flat_x >= x0) & (flat_x <= x1) & (flat_y >= y0) & (flat_y <= y1)
        n = int(cell.sum())
        lost = int((cell & ~inside).sum())
        clipped.append(lost / n if n else 0.0)
    return {'corner_err_px': err, 'corner_err_diag': err / diag, 'iou': iou, 'clipped': clipped}


def inverse_map(flat_x, flat_y, mask, q, out_w, out_h, ref_w, ref_h):
    """Flat -> photo map (from the generator's photo -> flat map) for the oracle-dense ceiling."""
    from scipy.interpolate import griddata
    ys, xs = np.where(mask & (flat_x >= 0))
    pts = np.stack([flat_x[ys, xs].astype(np.float32), flat_y[ys, xs].astype(np.float32)], 1)
    gx, gy = np.meshgrid(np.linspace(0, ref_w, out_w // 4), np.linspace(0, ref_h, out_h // 4))
    mx = griddata(pts, (xs * q).astype(np.float32), (gx, gy), method='linear')
    my = griddata(pts, (ys * q).astype(np.float32), (gx, gy), method='linear')
    mx = cv2.resize(np.nan_to_num(mx, nan=-1).astype(np.float32), (out_w, out_h), interpolation=cv2.INTER_LINEAR)
    my = cv2.resize(np.nan_to_num(my, nan=-1).astype(np.float32), (out_w, out_h), interpolation=cv2.INTER_LINEAR)
    return mx, my


def coons_map(boundary, corners, out_w, out_h):
    """Coons patch from the paper's four boundary curves (between its four corners): flattens
    curled / curved edges using the boundary alone (no content). Returns photo-coordinate maps."""
    b = np.float32(boundary).reshape(-1, 2)
    idx = [int(np.argmin(np.linalg.norm(b - np.float32(c), axis=1))) for c in corners]

    def side(i, j):
        if j >= i:
            seg = b[i:j + 1]
        else:
            seg = np.concatenate([b[i:], b[:j + 1]])
        return seg

    # Contour orientation: make the TL->TR side the short way round along the top.
    sides = [side(idx[0], idx[1]), side(idx[1], idx[2]), side(idx[2], idx[3]), side(idx[3], idx[0])]
    if sum(len(s) for s in sides) > 1.5 * len(b):
        b = b[::-1]
        idx = [len(b) - 1 - i for i in idx]
        sides = [side(idx[0], idx[1]), side(idx[1], idx[2]), side(idx[2], idx[3]), side(idx[3], idx[0])]

    def resample(seg, n):
        d = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(seg, axis=0), axis=1))])
        t = np.linspace(0, d[-1], n)
        return np.stack([np.interp(t, d, seg[:, 0]), np.interp(t, d, seg[:, 1])], 1)

    gw, gh = max(8, out_w // 8), max(8, out_h // 8)
    top = resample(sides[0], gw)
    right = resample(sides[1], gh)
    bottom = resample(sides[2], gw)[::-1]
    left = resample(sides[3], gh)[::-1]
    u = np.linspace(0, 1, gw)[None, :, None]
    v = np.linspace(0, 1, gh)[:, None, None]
    P = ((1 - v) * top[None] + v * bottom[None] + (1 - u) * left[:, None] + u * right[:, None]
         - ((1 - u) * (1 - v) * top[0] + u * (1 - v) * top[-1] + (1 - u) * v * bottom[0] + u * v * bottom[-1]))
    mx = cv2.resize(P[:, :, 0].astype(np.float32), (out_w, out_h), interpolation=cv2.INTER_LINEAR)
    my = cv2.resize(P[:, :, 1].astype(np.float32), (out_w, out_h), interpolation=cv2.INTER_LINEAR)
    return mx, my
