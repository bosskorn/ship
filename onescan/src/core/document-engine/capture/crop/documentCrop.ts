import type { Point, Quad } from '../../model';
import { maskRegionQuads } from '../docSeg';
import { convexHull, edgeCandidates, edgeSupport, gradients, sideOvershoot, GrayImage, orderQuad, polygonArea, refineQuadRobust, sideContrasts } from '../quadDetector';
import { CellMap, cellMap } from './cellMap';
import { CROP_MODEL, CropModel } from './cropModel';

/**
 * Post-capture document crop (P0 hotfix). Instead of "largest region / strongest
 * rectangle = document", every plausible page outline is a candidate and is scored on
 * what it encloses and how it is bounded:
 *
 *   segmentation agreement + text coverage + edge continuity + paper likelihood
 *   + aspect plausibility + centre prior − background texture penalty
 *
 * The weights are a logistic model fitted on held-out real photos (tools/crop), so the
 * score is a calibrated probability that the crop is right — which drives the
 * auto / review / manual gate. Nothing here is tuned to one surface or colour.
 */

export type CandidateSource = 'mask' | 'edge' | 'text' | 'rect' | 'frame';

/** What the user said they are scanning (scanner mode), when known. */
export type DocPrior = 'card' | 'receipt' | 'page' | null;

/** A second, zoomed segmentation pass: page probabilities for one region of the photo. */
export interface ZoomMask {
  mask: Float32Array;
  n: number;
  region: { x: number; y: number; width: number; height: number };
}

/**
 * Region for the zoomed pass: the first-pass page region grown by 35%, when the page is
 * small in the frame (the 64×64 map has too few pixels on it for accurate corners).
 */
export function zoomRegion(mask: Float32Array, n = 64): ZoomMask['region'] | null {
  const r = maskRegionQuads(mask, n, 0.5, 1)[0];
  if (!r || r.size > 0.3) return null;
  const xs = r.hull.map((p) => p.x);
  const ys = r.hull.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const hw = ((Math.max(...xs) - Math.min(...xs)) / 2) * 1.35 + 0.03;
  const hh = ((Math.max(...ys) - Math.min(...ys)) / 2) * 1.35 + 0.03;
  const x = Math.max(0, cx - hw);
  const y = Math.max(0, cy - hh);
  const region = { x, y, width: Math.min(1, cx + hw) - x, height: Math.min(1, cy + hh) - y };
  return region.width * region.height > 0.7 ? null : region;
}

/** ID-1 (ID cards, driving licences, bank cards): 85.6 × 54 mm. */
export const ID1_RATIO = 85.6 / 54;

/** How many of the leading mask/edge outlines also get an edge-snapped (refined) variant. */
const REFINE_TOP = 10;
/** Edge-detector outlines kept as candidates (best first). */
const EDGE_TOP = 36;
/** Leading outlines that also get +1% / +2% grown variants. */
const GROW_TOP = 12;

/** Push every corner `amt` of the image diagonal away from the centre. */
function growQuad(q: Quad, amt: number, sx: number, sy: number): Quad {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const diag = Math.hypot(sx, sy);
  return q.map((p) => {
    const vx = (p.x - cx) * sx;
    const vy = (p.y - cy) * sy;
    const l = Math.hypot(vx, vy) || 1;
    const k = (l + amt * diag) / l;
    return { x: Math.min(1, Math.max(0, cx + (p.x - cx) * k)), y: Math.min(1, Math.max(0, cy + (p.y - cy) * k)) };
  }) as Quad;
}

export interface CropCandidate {
  quad: Quad;
  source: CandidateSource;
  /** Edge-snapped variant of another outline. */
  refined: boolean;
  features: CropFeatures;
  /** Ranking score (logit); compare within one photo. */
  score: number;
}

export interface CropFeatures {
  area: number;
  aspect: number;
  centerDist: number;
  borderCorners: number;
  maskIn: number;
  maskOut: number;
  maskIoU: number;
  textRecall: number;
  /** Share of the dominant text block inside the outline. */
  mainRecall: number;
  textDensity: number;
  textSpan: number;
  edgeMin: number;
  edgeMean: number;
  /** Edge support past the corners (lines that run on: grout, tiles, table edges). */
  overshootMax: number;
  overshootMean: number;
  /** Text just outside the outline, relative to text inside (the outline cuts content). */
  textOutside: number;
  contrast: number;
  paperTexture: number;
  paperEvenness: number;
  outsideTexture: number;
  backgroundPenalty: number;
  hasMask: number;
  hasText: number;
  /** Shape agreement with the scanner mode's document type (0 when unknown). */
  priorMatch: number;
  hasPrior: number;
  /** Relative to the other candidates of the same photo (see `addRelative`). */
  outerEdge: number;
  innerEdge: number;
  recallRel: number;
  edgeRel: number;
  areaRel: number;
}

export type CropDecision = 'auto' | 'review' | 'manual';

export interface CropResult {
  /** Best outline (normalised TL, TR, BR, BL); null = nothing page-like found. */
  quad: Quad | null;
  confidence: number;
  /** ≥ 0.85 apply; 0.65–0.85 apply and suggest "adjust edges"; below: suggest only, open the crop editor. */
  decision: CropDecision;
  candidates: CropCandidate[];
  selected: number;
}

/**
 * Auto-apply only above the model's threshold, chosen on held-in photos for >= 98%
 * precision (precision over coverage: no crop beats a wrong crop). Until a threshold
 * reaches that, nothing is auto-applied.
 */
export const autoCropThreshold = (model: CropModel = CROP_MODEL) => model.autoThreshold;
/** Below this the crop is not even suggested as applied: original + crop editor. */
export const REVIEW_CROP = 0.65;

export const decisionFor = (confidence: number, model: CropModel = CROP_MODEL): CropDecision =>
  confidence >= autoCropThreshold(model) ? 'auto' : confidence >= REVIEW_CROP ? 'review' : 'manual';

const FULL: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function insideQuad(q: Point[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c === 0) continue;
    const s = c > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Downscale by an integer factor (box) so the edge detector sees the ~200 px frames it was tuned on. */
function shrink(img: GrayImage, f: number): GrayImage {
  if (f <= 1) return img;
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const plane = (src: Uint8Array) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) s += src[(y * f + dy) * img.width + x * f + dx];
        out[y * w + x] = Math.round(s / (f * f));
      }
    }
    return out;
  };
  return { width: w, height: h, data: plane(img.data), cb: img.cb ? plane(img.cb) : undefined, cr: img.cr ? plane(img.cr) : undefined };
}

/** Rotated bounding box of the text cells (rotating calipers on their hull), grown by `grow`. */
function textBox(cm: CellMap, grow: number): Quad | null {
  if (cm.mainCount < 6) return null;
  const pts: Point[] = [];
  for (let cy = 0; cy < cm.rows; cy++) {
    for (let cx = 0; cx < cm.cols; cx++) {
      if (!cm.mainText[cy * cm.cols + cx]) continue;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        pts.push({ x: (cx + dx) / cm.cols, y: (cy + dy) / cm.rows });
      }
    }
  }
  return minAreaRect(pts, grow, 1, 1);
}

/**
 * Smallest rotated rectangle around `points` (rotating calipers on their hull), grown by
 * `grow` of its size per side. `sx`/`sy` give the pixel aspect of the normalised space so
 * the rectangle is a true rectangle in the image.
 */
export function minAreaRect(points: Point[], grow: number, sx: number, sy: number, ratio?: number): Quad | null {
  const hull = convexHull(points.map((p) => ({ x: p.x * sx, y: p.y * sy })));
  if (hull.length < 3) return null;
  let best: { area: number; box: Point[] } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.y * uy;
      const v = -p.x * uy + p.y * ux;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      let gu = (maxU - minU) * grow;
      let gv = (maxV - minV) * grow;
      if (ratio) {
        // Snap to a known aspect (ID-1 cards): grow the short side to match.
        const lu = maxU - minU + 2 * gu;
        const lv = maxV - minV + 2 * gv;
        if (lu >= lv) gv += (lu / ratio - lv) / 2;
        else gu += (lv / ratio - lu) / 2;
      }
      const corner = (u: number, v: number) => ({ x: (u * ux - v * uy) / sx, y: (u * uy + v * ux) / sy });
      best = {
        area,
        box: [corner(minU - gu, minV - gv), corner(maxU + gu, minV - gv), corner(maxU + gu, maxV + gv), corner(minU - gu, maxV + gv)],
      };
    }
  }
  if (!best) return null;
  return orderQuad(best.box.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })));
}

const sameQuad = (a: Quad, b: Quad) => {
  // Same outline if every corner of one is within 1.5% of some corner of the other.
  return a.every((p) => b.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 0.015));
};

interface Evidence {
  w: number;
  h: number;
  mask: Float32Array | null;
  maskN: number;
  cells: CellMap;
  edge: { w: number; h: number; near: Uint8Array[]; light: Uint8Array };
  textTotal: number;
  prior: DocPrior;
}

/** Measurements of one candidate outline (normalised quad). */
function priorMatch(aspect: number, prior: DocPrior): number {
  if (prior === 'card') return Math.exp(-Math.abs(Math.log(aspect / ID1_RATIO)) / 0.08);
  if (prior === 'receipt') return Math.min(1, Math.max(0, (aspect - 1.3) / 1.2));
  if (prior === 'page') return Math.exp(-Math.abs(Math.log(aspect / Math.SQRT2)) / 0.2);
  return 0;
}

export function cropFeatures(q: Quad, ev: Evidence): CropFeatures {
  const { cells: cm } = ev;
  const px = q.map((p) => ({ x: p.x * ev.w, y: p.y * ev.h }));
  const side = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const wSide = (side(px[0], px[1]) + side(px[3], px[2])) / 2;
  const hSide = (side(px[0], px[3]) + side(px[1], px[2])) / 2;
  const aspect = Math.max(wSide, hSide) / Math.max(1e-6, Math.min(wSide, hSide));
  const area = polygonArea(q);
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const border = 0.012;
  const borderCorners = q.filter((p) => p.x < border || p.y < border || p.x > 1 - border || p.y > 1 - border).length;

  // Segmentation agreement.
  let maskIn = 0;
  let maskOut = 0;
  let maskIoU = 0;
  if (ev.mask) {
    const n = ev.maskN;
    let sIn = 0;
    let nIn = 0;
    let sOut = 0;
    let nOut = 0;
    let inter = 0;
    let uni = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = ev.mask[y * n + x];
        const inQ = insideQuad(q, (x + 0.5) / n, (y + 0.5) / n);
        if (inQ) {
          sIn += v;
          nIn++;
        } else {
          sOut += v;
          nOut++;
        }
        const m = v >= 0.5;
        if (inQ && m) inter++;
        if (inQ || m) uni++;
      }
    }
    maskIn = nIn ? sIn / nIn : 0;
    maskOut = nOut ? sOut / nOut : 0;
    maskIoU = uni ? inter / uni : 0;
  }

  // Text, paper and background, cell by cell.
  let textIn = 0;
  let mainIn = 0;
  let cellsIn = 0;
  let texIn = 0;
  let texInN = 0;
  let texOut = 0;
  let texOutN = 0;
  let rough = 0;
  let sy = 0;
  let syy = 0;
  let tMinX = 1;
  let tMaxX = 0;
  let tMinY = 1;
  let tMaxY = 0;
  for (let r = 0; r < cm.rows; r++) {
    for (let c = 0; c < cm.cols; c++) {
      const i = r * cm.cols + c;
      const inQ = insideQuad(q, (c + 0.5) / cm.cols, (r + 0.5) / cm.rows);
      if (!inQ) {
        if (!cm.text[i]) {
          texOut += cm.texture[i];
          texOutN++;
        }
        continue;
      }
      cellsIn++;
      if (cm.mainText[i]) mainIn++;
      if (cm.text[i]) {
        textIn++;
        tMinX = Math.min(tMinX, c / cm.cols);
        tMaxX = Math.max(tMaxX, (c + 1) / cm.cols);
        tMinY = Math.min(tMinY, r / cm.rows);
        tMaxY = Math.max(tMaxY, (r + 1) / cm.rows);
        continue;
      }
      texIn += cm.texture[i];
      texInN++;
      if (cm.texture[i] > 0.12) rough++;
      sy += cm.y[i];
      syy += cm.y[i] * cm.y[i];
    }
  }
  const meanY = texInN ? sy / texInN : 0;
  const stdY = texInN ? Math.sqrt(Math.max(0, syy / texInN - meanY * meanY)) : 0;
  const textSpan = textIn ? ((tMaxX - tMinX) * (tMaxY - tMinY)) / Math.max(1e-6, area) : 0;

  // Edge continuity along each side, and the brightness/tint step across it.
  const e = ev.edge;
  const epx = q.map((p) => ({ x: p.x * (e.w - 1), y: p.y * (e.h - 1) }));
  const sup = e.near.length ? edgeSupport(epx, e.near, e.w, e.h) : { min: 0, mean: 0 };
  const contrast = e.near.length ? Math.min(...sideContrasts(epx, e.light, e.w, e.h).map(Math.abs)) : 0;
  const over = e.near.length ? sideOvershoot(epx, e.near, e.w, e.h) : { max: 0, mean: 0 };
  // Text cells within ~4% outside the outline: grow the quad and count the ring.
  const grown = q.map((p) => ({ x: cx + (p.x - cx) * 1.08, y: cy + (p.y - cy) * 1.08 }));
  let ring = 0;
  for (let r = 0; r < cm.rows; r++) {
    for (let c = 0; c < cm.cols; c++) {
      if (!cm.text[r * cm.cols + c]) continue;
      const x = (c + 0.5) / cm.cols;
      const y = (r + 0.5) / cm.rows;
      if (!insideQuad(q, x, y) && insideQuad(grown, x, y)) ring++;
    }
  }

  return {
    area,
    aspect,
    centerDist: Math.hypot(cx - 0.5, cy - 0.5),
    borderCorners,
    maskIn,
    maskOut,
    maskIoU,
    textRecall: ev.textTotal ? textIn / ev.textTotal : 0,
    mainRecall: cm.mainCount ? mainIn / cm.mainCount : 0,
    textDensity: cellsIn ? textIn / cellsIn : 0,
    textSpan,
    edgeMin: sup.min,
    edgeMean: sup.mean,
    overshootMax: over.max,
    overshootMean: over.mean,
    textOutside: ring / Math.max(1, textIn),
    contrast,
    paperTexture: texInN ? texIn / texInN : 0,
    paperEvenness: meanY > 0 ? stdY / meanY : 1,
    outsideTexture: texOutN ? texOut / texOutN : 0,
    backgroundPenalty: texInN ? rough / texInN : 0,
    hasMask: ev.mask ? 1 : 0,
    hasText: ev.textTotal >= 6 ? 1 : 0,
    priorMatch: priorMatch(aspect, ev.prior),
    hasPrior: ev.prior ? 1 : 0,
    outerEdge: 0,
    innerEdge: 0,
    recallRel: 0,
    edgeRel: 0,
    areaRel: 0,
  };
}

/** Every corner of `inner` lies inside `outer` (with a small tolerance). */
function contains(outer: Quad, inner: Quad): boolean {
  const cx = (outer[0].x + outer[1].x + outer[2].x + outer[3].x) / 4;
  const cy = (outer[0].y + outer[1].y + outer[2].y + outer[3].y) / 4;
  const grown = outer.map((p) => ({ x: cx + (p.x - cx) * 1.03, y: cy + (p.y - cy) * 1.03 }));
  return inner.every((p) => insideQuad(grown, p.x, p.y));
}

/**
 * Features that compare a candidate with its siblings in the same photo: a page's inner
 * panels (photo, header, fold) are contained by a well-edged larger outline; the page is
 * the outline with the most text and the strongest edges among comparable ones.
 */
export function addRelative(cands: { quad: Quad; source: CandidateSource; features: CropFeatures }[]) {
  const real = cands.filter((c) => c.source !== 'frame');
  const maxRecall = Math.max(1e-6, ...real.map((c) => c.features.textRecall));
  const maxEdge = Math.max(1e-6, ...real.map((c) => c.features.edgeMean));
  const maxArea = Math.max(1e-6, ...real.map((c) => c.features.area));
  for (const c of cands) {
    const f = c.features;
    f.recallRel = f.textRecall / maxRecall;
    f.edgeRel = f.edgeMean - maxEdge;
    f.areaRel = f.area / maxArea;
    if (c.source === 'frame') continue;
    for (const o of real) {
      if (o === c) continue;
      if (o.features.area >= f.area * 1.12 && o.features.area <= 0.92 && contains(o.quad, c.quad)) f.outerEdge = Math.max(f.outerEdge, o.features.edgeMin);
      if (f.area >= o.features.area * 1.12 && contains(c.quad, o.quad)) f.innerEdge = Math.max(f.innerEdge, o.features.edgeMin);
    }
  }
}

/** Feature vector for the logistic model (fixed order; see tools/crop/fit.py). */
export function featureVector(f: CropFeatures, source: CandidateSource, refined = false): number[] {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const aspectOk = f.aspect <= 3.6 ? 1 : Math.max(0, 1 - (f.aspect - 3.6) / 2);
  const big = f.area > 0.85 ? (f.area - 0.85) / 0.15 : 0;
  return [
    1,
    f.area,
    Math.sqrt(f.area),
    big,
    big * (1 - clamp01(f.textSpan)),
    aspectOk,
    f.centerDist,
    f.borderCorners / 4,
    f.hasMask * f.maskIn,
    f.hasMask * f.maskOut,
    f.hasMask * f.maskIoU,
    f.hasText * f.textRecall,
    f.hasText * f.textDensity,
    f.hasText * (1 - f.textRecall) * (1 - f.textRecall),
    f.edgeMin,
    f.edgeMean,
    Math.min(1, f.contrast / 60),
    Math.min(1, f.paperTexture / 0.2),
    Math.min(1, f.paperEvenness),
    Math.min(1, f.outsideTexture / 0.2),
    f.backgroundPenalty,
    source === 'mask' ? 1 : 0,
    source === 'edge' ? 1 : 0,
    source === 'text' ? 1 : 0,
    source === 'frame' ? 1 : 0,
    f.outerEdge,
    f.innerEdge,
    f.recallRel,
    f.edgeRel,
    f.areaRel,
    f.outerEdge * f.edgeMin,
    refined ? 1 : 0,
    f.overshootMax,
    f.overshootMean,
    Math.min(1, f.textOutside),
    f.hasText * f.mainRecall,
    f.hasText * (1 - f.mainRecall) * (1 - f.mainRecall),
    f.priorMatch,
    f.hasPrior * (1 - f.priorMatch),
    source === 'rect' ? 1 : 0,
  ];
}

/** Ranking score (logit) of one candidate; the best outline in a photo has the highest. */
export function rankScore(v: number[], model: CropModel = CROP_MODEL): number {
  let z = 0;
  for (let i = 0; i < v.length && i < model.weights.length; i++) z += v[i] * model.weights[i];
  return z;
}

/** Calibrated probability that the top-ranked outline is right (top score and its margin). */
export function cropConfidence(top: number, runnerUp: number | null, model: CropModel = CROP_MODEL): number {
  const [c0, c1, c2] = model.calibration;
  const margin = top - (runnerUp ?? top - 5);
  return 1 / (1 + Math.exp(-(c0 + c1 * top + c2 * margin)));
}

/** All candidate outlines with their evidence (also used by the benchmark tooling). */
export function cropCandidates(
  img: GrayImage,
  mask: Float32Array | null,
  maskN = 64,
  prior: DocPrior = null,
  zoom: ZoomMask | null = null,
): { candidates: { quad: Quad; source: CandidateSource; refined: boolean }[]; ev: Evidence } {
  const cells = cellMap(img, 8);
  const small = shrink(img, Math.max(1, Math.round(Math.max(img.width, img.height) / 192)));
  const edge = edgeCandidates(small);
  const list: { quad: Quad; source: CandidateSource; refined: boolean }[] = [];
  const add = (quad: Quad, source: CandidateSource, refined = false) => {
    if (polygonArea(quad) < 0.02) return;
    if (list.some((c) => sameQuad(c.quad, quad))) return;
    list.push({ quad, source, refined });
  };
  const sx = img.width / Math.max(img.width, img.height);
  const sy = img.height / Math.max(img.width, img.height);
  if (mask) {
    // Low threshold too: faded receipts and low-contrast pages score weakly.
    for (const t of [0.5, 0.35, 0.65, 0.8, 0.25]) {
      for (const r of maskRegionQuads(mask, maskN, t, 2)) {
        add(r.quad, 'mask');
        // Rectangle candidates: rotated bounding rectangle of the region (rounded card
        // corners make the inscribed quad cut the corners off), and an ID-1-ratio one.
        const rect = minAreaRect(r.hull, 0, sx, sy);
        if (rect) add(rect, 'rect');
        if (prior !== 'receipt') {
          const card = minAreaRect(r.hull, 0, sx, sy, ID1_RATIO);
          if (card && (prior === 'card' || r.size < 0.35)) add(card, 'rect');
        }
      }
    }
  }
  if (zoom) {
    // Zoomed pass: same region rules, corners mapped back to the full photo.
    const { region: g0 } = zoom;
    const back = (p: Point) => ({ x: g0.x + p.x * g0.width, y: g0.y + p.y * g0.height });
    for (const t of [0.5, 0.35, 0.65]) {
      for (const r of maskRegionQuads(zoom.mask, zoom.n, t, 1)) {
        if (r.edgeRun > 0.2) continue; // region runs off the zoom window: not the whole page
        add(orderQuad(r.quad.map(back)), 'mask');
        const rect = minAreaRect(r.hull.map(back), 0, sx, sy);
        if (rect) add(rect, 'rect');
        if (prior === 'card') {
          const card = minAreaRect(r.hull.map(back), 0, sx, sy, ID1_RATIO);
          if (card) add(card, 'rect');
        }
      }
    }
  }
  const ranked = [...edge.candidates].sort((a, b) => b.score - a.score || b.support.mean - a.support.mean).slice(0, EDGE_TOP);
  for (const c of ranked) add(orderQuad(c.quad.map((p) => ({ x: p.x / (small.width - 1), y: p.y / (small.height - 1) }))), 'edge');
  // Corner refinement: each leading outline also as a version snapped to the paper edges
  // nearby (consistent-polarity edge, robust line fit). The ranker picks raw or refined.
  const g = gradients(img.data, img.width, img.height);
  const search = Math.max(4, Math.round(Math.max(img.width, img.height) * 0.03));
  for (const c of list.filter((x) => x.source !== 'frame').slice(0, REFINE_TOP)) {
    let px = c.quad.map((p) => ({ x: p.x * (img.width - 1), y: p.y * (img.height - 1) }));
    px = refineQuadRobust(px, g, img.width, img.height, search).quad;
    px = refineQuadRobust(px, g, img.width, img.height, 3).quad;
    add(orderQuad(px.map((p) => ({ x: p.x / (img.width - 1), y: p.y / (img.height - 1) }))), c.source, true);
  }
  // Slightly larger variants of the leading outlines: a crop 1–2% inside the page cuts
  // content; the ranker decides whether the grown one fits the edges better.
  for (const c of list.filter((x) => x.source !== 'frame').slice(0, GROW_TOP)) {
    for (const amt of [0.01, 0.02]) add(growQuad(c.quad, amt, sx, sy), c.source, c.refined);
  }
  const tb = textBox(cells, 0.04);
  if (tb) {
    add(tb, 'text');
    // The page edge lies just beyond the text margins: snap each side of the text box
    // outward-or-inward to the nearest consistent paper edge (wide search).
    const wide = Math.max(6, Math.round(Math.max(img.width, img.height) * 0.08));
    let px = tb.map((p) => ({ x: p.x * (img.width - 1), y: p.y * (img.height - 1) }));
    px = refineQuadRobust(px, g, img.width, img.height, wide).quad;
    px = refineQuadRobust(px, g, img.width, img.height, 3).quad;
    add(orderQuad(px.map((p) => ({ x: p.x / (img.width - 1), y: p.y / (img.height - 1) }))), 'text', true);
  }
  add(FULL, 'frame');
  const ev: Evidence = {
    w: img.width,
    h: img.height,
    mask,
    maskN,
    cells,
    edge: { w: small.width, h: small.height, near: edge.near, light: edge.light },
    textTotal: cells.textCount,
    prior,
  };
  return { candidates: list, ev };
}

/**
 * Detect the document on a post-capture analysis image (≈ 384–512 px long edge) with the
 * DocSeg page probabilities (64×64) when available.
 */
export function detectDocument(
  img: GrayImage,
  mask: Float32Array | null,
  model: CropModel = CROP_MODEL,
  prior: DocPrior = null,
  zoom: ZoomMask | null = null,
): CropResult {
  const { candidates, ev } = cropCandidates(img, mask, 64, prior, zoom);
  const withF = candidates.map((c) => ({ ...c, features: cropFeatures(c.quad, ev) }));
  addRelative(withF);
  const scored: CropCandidate[] = withF.map((c) => ({ ...c, score: rankScore(featureVector(c.features, c.source, c.refined), model) }));
  let selected = -1;
  for (let i = 0; i < scored.length; i++) if (selected < 0 || scored[i].score > scored[selected].score) selected = i;
  const best = scored[selected];
  if (!best || best.source === 'frame') return { quad: null, confidence: 0, decision: 'manual', candidates: scored, selected };
  const runnerUp = scored.reduce<number | null>((m, c, i) => (i === selected ? m : m === null ? c.score : Math.max(m, c.score)), null);
  const confidence = cropConfidence(best.score, runnerUp, model);
  return { quad: best.quad, confidence, decision: decisionFor(confidence, model), candidates: scored, selected };
}

/**
 * OCR safe margin: grow any side that has text right at it or just beyond it, by up to
 * `max` of the frame, so a crop never clips line ends, totals, stamps or signatures.
 */
export function textSafeQuad(q: Quad, cm: CellMap, max = 0.02): { quad: Quad; grown: number[] } {
  const signed = q.reduce((acc, p, i) => acc + (p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y), 0);
  const orient = signed > 0 ? 1 : -1;
  const grown = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const tx = (b.x - a.x) / len;
    const ty = (b.y - a.y) / len;
    // Outward normal for this winding.
    const nx = ty * orient;
    const ny = -tx * orient;
    for (let r = 0; r < cm.rows; r++) {
      for (let c = 0; c < cm.cols; c++) {
        if (!cm.text[r * cm.cols + c]) continue;
        const px = (c + 0.5) / cm.cols - a.x;
        const py = (r + 0.5) / cm.rows - a.y;
        const along = (px * tx + py * ty) / len;
        if (along < 0.02 || along > 0.98) continue;
        const d = px * nx + py * ny; // > 0 outside
        if (d < -0.012 || d > 0.03) continue;
        grown[i] = Math.max(grown[i], Math.min(max, d + 0.015));
      }
    }
  }
  if (grown.every((g) => g === 0)) return { quad: q, grown };
  const lines = [0, 1, 2, 3].map((i) => {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = ((b.y - a.y) / len) * orient;
    const ny = (-(b.x - a.x) / len) * orient;
    return { px: a.x + nx * grown[i], py: a.y + ny * grown[i], dx: b.x - a.x, dy: b.y - a.y };
  });
  const out: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[(i + 3) % 4];
    const l2 = lines[i];
    const det = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(det) < 1e-9) return { quad: q, grown: [0, 0, 0, 0] };
    const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / det;
    out.push({ x: Math.min(1, Math.max(0, l1.px + l1.dx * t)), y: Math.min(1, Math.max(0, l1.py + l1.dy * t)) });
  }
  return { quad: orderQuad(out), grown };
}
