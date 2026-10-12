"""Acceptance checks for the scan filters on the QA scenes (spec §3–§5).

Runs the real Kotlin filters through QaHarnessTest (scan filter for A4, card filter for the
ID card) on every lighting condition, then scores each output against the ideal reference.
Prints a PASS/FAIL table per check.

    python3 qa_eval.py SCENES_DIR
"""
import json, os, subprocess, sys
import numpy as np, cv2, zxingcpp
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE = os.path.join(HERE, '..', '..', 'modules', 'onescan-vision', 'android')
ANDROID = os.path.join(HERE, '..', '..', 'android')
CONDS = 'ABCDE'


def to_rgb_file(src, dst):
    im = Image.open(src).convert('RGB')
    open(dst, 'wb').write(im.width.to_bytes(4, 'little') + im.height.to_bytes(4, 'little') + im.tobytes())
    return im.size


def run_kotlin(D):
    jobs, sizes = [], {}
    for doc, flt in (('a4', 'scan'), ('card', 'card')):
        for c in CONDS:
            rgb = os.path.join(D, f'{doc}_{c}.rgb')
            sizes[(doc, c)] = to_rgb_file(os.path.join(D, f'{doc}_{c}.jpg'), rgb)
            jobs.append(f'filter {flt} {rgb} {os.path.join(D, f"{doc}_{c}.raw")}')
    os.makedirs(os.path.join(MODULE, 'qa'), exist_ok=True)
    open(os.path.join(MODULE, 'qa', 'jobs.txt'), 'w').write('\n'.join(jobs) + '\n')
    subprocess.run(['./gradlew', ':onescan-vision:testDebugUnitTest', '--offline', '-q', '--rerun', '--tests', 'app.onescan.vision.QaHarnessTest'],
                   cwd=ANDROID, check=True, stdout=subprocess.DEVNULL)
    timings = open(os.path.join(MODULE, 'qa', 'timings.txt')).read()
    for (doc, c), size in sizes.items():
        Image.frombytes('RGB', size, open(os.path.join(D, f'{doc}_{c}.raw'), 'rb').read()).save(os.path.join(D, f'{doc}_{c}_out.png'))
    return timings


def lab(rgb):
    a = np.asarray(rgb, np.float32) / 255
    a = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    xyz = a @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]], np.float32)
    xyz = xyz / np.array([0.9505, 1.0, 1.089], np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def region(a, r, scale=1.0):
    return a[int(r[1] * scale):int(r[3] * scale), int(r[0] * scale):int(r[2] * scale)]


def mean_lab(img, r, s=1.0):
    return lab(region(img, r, s)).reshape(-1, 3).mean(0)


def hue_shift(a, b):
    d = abs(np.degrees(np.arctan2(a[2], a[1]) - np.arctan2(b[2], b[1]))) % 360
    return float(min(d, 360 - d))


def dE(a, b):
    return float(np.linalg.norm(a - b))


def decodes(img, truth):
    found = {x.text for x in zxingcpp.read_barcodes(img)}
    return truth['qr'] in found, truth['barcode'] in found


def L(img):
    return cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)


def card_checks(out, ref, m):
    R = m['regions']
    Lo, Lr = L(out), L(ref)
    res = {}
    res['base ΔE'] = (dE(mean_lab(out, R['base']), mean_lab(ref, R['base'])), '≤ 10')
    res['base ΔL (whiter)'] = (float(mean_lab(out, R['base'])[0] - mean_lab(ref, R['base'])[0]), '≤ +8')
    hp = lambda x: x - cv2.GaussianBlur(x, (0, 0), 6)
    res['security pattern kept'] = (float(region(hp(Lo), R['pattern']).std() / region(hp(Lr), R['pattern']).std()), '0.7–1.5')
    # Low-frequency evenness over the card base (shadow / uneven light).
    patches = lambda x: [float(np.percentile(region(x, [x0, 980, x0 + 200, 1060]), 60)) for x0 in (40, 500, 900, 1450)] + \
                        [float(np.percentile(region(x, [40, y0, 240, y0 + 150]), 60)) for y0 in (340, 880)]
    po, pr = patches(Lo), patches(Lr)
    res['shadow / evenness (spread vs ref)'] = (float((max(po) - min(po)) - (max(pr) - min(pr))), '≤ 12')
    res['skin ΔE'] = (dE(mean_lab(out, R['skin']), mean_lab(ref, R['skin'])), '≤ 10')
    res['emblem colour ΔE'] = (dE(mean_lab(out, R['emblem']), mean_lab(ref, R['emblem'])), '≤ 12')
    res['global contrast ratio'] = (float(Lo.std() / Lr.std()), '≤ 1.25')
    # Halo: brightness just outside dark strokes vs a little further away, relative to the reference.
    reg = R['idnumber']
    stroke = (region(Lr, reg) < 90).astype(np.uint8)
    ring = cv2.dilate(stroke, np.ones((5, 5), np.uint8)) - stroke
    far = cv2.dilate(stroke, np.ones((17, 17), np.uint8)) - cv2.dilate(stroke, np.ones((9, 9), np.uint8))
    halo = lambda x: float(region(x, reg)[ring > 0].mean() - region(x, reg)[far > 0].mean())
    res['halo around ID number'] = (halo(Lo) - halo(Lr), '≤ 6')
    sd = lambda x: float(np.percentile(region(x, reg), 95) - np.percentile(region(x, reg), 2))
    res['ID number contrast vs ref'] = (sd(Lo) / sd(Lr), '≥ 0.85')
    qr, bc = decodes(out, m)
    res['QR / barcode'] = (f'{"OK" if qr else "FAIL"}/{"OK" if bc else "FAIL"}', 'OK/OK')
    return res


def a4_checks(out, ref, m, src=None):
    R = m['regions']
    s = out.shape[1] / m['size'][0]
    Lo = L(out)
    res = {}
    qr, bc = decodes(out, m)
    res['QR / barcode'] = (f'{"OK" if qr else "FAIL"}/{"OK" if bc else "FAIL"}', 'OK/OK')
    band = lambda x: cv2.GaussianBlur(x, (0, 0), 1.0) - cv2.GaussianBlur(x, (0, 0), 3.0)
    Lr = L(ref)
    def detail(img, r):
        a = cv2.resize(region(img, r, s), ((r[2] - r[0]) * 2, (r[3] - r[1]) * 2), interpolation=cv2.INTER_CUBIC)
        b = cv2.resize(region(Lr, r), ((r[2] - r[0]) * 2, (r[3] - r[1]) * 2), interpolation=cv2.INTER_CUBIC)
        a, b = band(a), band(b)
        return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum()))
    # Fine detail at 600 dpi (≈ 300 % zoom) vs the ideal page, relative to the scanner's own
    # output: the filter must not lose detail the source had (1.0 = all kept).
    Ls = L(src) if src is not None else None
    for key, label in (('text8', '8 pt detail kept @300%'), ('text10', '10 pt detail kept @300%'), ('table', 'table detail kept @300%')):
        d = detail(Lo, R[key])
        res[label] = (d / detail(Ls, R[key]) if Ls is not None else d, '≥ 0.95')
    paper = region(Lo, R['paper'], s)
    cols = [float(np.percentile(paper[:, i:i + 200], 50)) for i in range(0, paper.shape[1] - 200, 400)]
    res['paper brightness'] = (float(np.median(paper)), '≥ 235')
    pr = region(out, R['paper'], s).reshape(-1, 3).astype(np.float32).mean(0)
    res['paper tint (max channel gap)'] = (float(pr.max() - pr.min()), '≤ 6')
    res['paper evenness (spread)'] = (max(cols) - min(cols), '≤ 10')
    g = region(Lo, R['grey8'], s)
    res['grey 8 pt text depth (paper − ink)'] = (float(np.percentile(g, 95) - np.percentile(g, 1)), '≥ 110')
    # Red stamp ink (ring + text): pixels that are red in the ideal page.
    st = region(ref, R['stamp']).astype(np.int32)
    ink = (st[..., 0] > 150) & (st[..., 1] < 90)
    so = cv2.resize(region(out, R['stamp'], s), (st.shape[1], st.shape[0]), interpolation=cv2.INTER_AREA)
    so_lab, st_lab = lab(so[ink]).mean(0), lab(st[ink].astype(np.uint8)).mean(0)
    res['red stamp ΔE'] = (dE(so_lab, st_lab), '≤ 15')
    # Not darkened or desaturated, hue still red (vs the ideal page).
    res['red stamp L* change'] = (float(so_lab[0] - st_lab[0]), '-10–10')
    res['red stamp chroma kept'] = (float(np.hypot(*so_lab[1:]) / np.hypot(*st_lab[1:])), '0.85–1.25')
    res['red stamp hue shift °'] = (hue_shift(so_lab, st_lab), '≤ 10')
    # Blue signature ink: same rules.
    sg = region(ref, R['signature']).astype(np.int32)
    sink = (sg[..., 2] > 120) & (sg[..., 0] < 80)
    sgo = cv2.resize(region(out, R['signature'], s), (sg.shape[1], sg.shape[0]), interpolation=cv2.INTER_AREA)
    sg_o, sg_r = lab(sgo[sink]).mean(0), lab(sg[sink].astype(np.uint8)).mean(0)
    res['blue signature ΔE'] = (dE(sg_o, sg_r), '≤ 15')
    res['blue signature L* change'] = (float(sg_o[0] - sg_r[0]), '-10–10')
    for k in ('logo_blue', 'logo_orange', 'logo_green'):
        res[f'{k.split("_")[1]} logo ΔE'] = (dE(mean_lab(out, R[k], s), mean_lab(ref, R[k])), '≤ 15')
    return res


def passes(v, rule):
    if isinstance(v, str):
        return v == rule
    if rule.startswith('≤'):
        return v <= float(rule[1:].strip().lstrip('+'))
    if rule.startswith('≥'):
        return v >= float(rule[1:])
    lo, hi = rule.split('–')
    return float(lo) <= v <= float(hi)


if __name__ == '__main__':
    D = os.path.abspath(sys.argv[1])
    meta = json.load(open(os.path.join(D, 'regions.json')))
    timings = run_kotlin(D)
    fails = 0
    for doc, fn in (('a4', a4_checks), ('card', card_checks)):
        ref = np.asarray(Image.open(os.path.join(D, f'{doc}_ref.png')).convert('RGB'))
        table = {}
        for c in CONDS:
            out = np.asarray(Image.open(os.path.join(D, f'{doc}_{c}_out.png')).convert('RGB'))
            if doc == 'card':
                out = cv2.resize(out, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA)
            if doc == 'a4':
                table[c] = fn(out, ref, meta[doc], np.asarray(Image.open(os.path.join(D, f'{doc}_{c}.jpg')).convert('RGB')))
            else:
                table[c] = fn(out, ref, meta[doc])
        print(f'\n== {doc.upper()} ({"scan" if doc == "a4" else "card"} filter) — lighting A normal, B warm, C window, D uneven, E shadow')
        for check in table['A']:
            rule = table['A'][check][1]
            cells = []
            for c in CONDS:
                v = table[c][check][0]
                ok = passes(v, rule)
                fails += not ok
                cells.append(f'{(v if isinstance(v, str) else f"{v:.2f}"):>9}{"" if ok else " ✗"}')
            print(f'  {check:36s} {rule:>8} | ' + ' | '.join(cells))
    print('\nKotlin filter timings (JVM, this machine):')
    print(timings)
    print('FAILED CHECKS:', fails)
