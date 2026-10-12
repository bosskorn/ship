"""Non-paper block rejection for illumination grids — reference for PaperGrid.kt."""
import numpy as np
LW = np.array([0.299, 0.587, 0.114], np.float32)

def robust_fill(grid_rgb, chroma_margin=25.0, dark_ratio=0.45):
    """grid_rgb: (gh, gw, 3) paper estimate per block. Blocks that aren't paper — much more
    colourful than the paper (logos, skin, colour print) or very dark (hair, black bars) — are
    replaced by values diffused from neighbouring paper blocks. Shadows stay: they keep the
    paper's (low) chroma and are rarely below 45 % of the paper's brightness."""
    g = grid_rgb.astype(np.float32).copy()
    gh, gw, _ = g.shape
    Lg = g @ LW
    ch = g.max(2) - g.min(2)
    paperL = np.percentile(Lg, 90)
    bright = Lg >= 0.8 * paperL
    paperC = np.median(ch[bright]) if bright.any() else np.median(ch)
    ok = (ch <= paperC + chroma_margin) & (Lg >= dark_ratio * paperL)
    if ok.sum() < 4:
        return g
    known = ok.copy()
    for _ in range(gh + gw):
        if known.all():
            break
        new = g.copy(); nk = known.copy()
        for y in range(gh):
            for x in range(gw):
                if known[y, x]:
                    continue
                ys, xs = slice(max(0, y - 1), y + 2), slice(max(0, x - 1), x + 2)
                m = known[ys, xs]
                if m.any():
                    new[y, x] = g[ys, xs][m].mean(0); nk[y, x] = True
        g, known = new, nk
    return g
