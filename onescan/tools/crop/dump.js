// Dump crop candidates + features + corner error for every benchmark case (JSONL).
const fs = require('fs');
const C = require((process.env.BUILD || __dirname + '/build') + '/core/document-engine/capture/crop/documentCrop.js');
const Q = require((process.env.BUILD || __dirname + '/build') + '/core/document-engine/capture/quadDetector.js');
const [dir, out, only] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(dir + '/cases.json'));
const orders = [0, 1, 2, 3].flatMap((s) => [[0, 1, 2, 3].map((i) => (s + i) % 4), [0, 1, 2, 3].map((i) => (s + 4 - i) % 4)]);
const err = (q, t, diag) => Math.min(...orders.map((o) => Math.max(...q.map((p, i) => Math.hypot(p.x - t[o[i]][0], p.y - t[o[i]][1]))))) / diag;
const fd = fs.openSync(out, 'w');
let n = 0, ms = 0;
for (const [k, m] of Object.entries(meta)) {
  if (only && !k.startsWith(only)) continue;
  const rd = (e) => new Uint8Array(fs.readFileSync(`${dir}/${k}.${e}`));
  const img = { width: m.w, height: m.h, data: rd('bin'), cb: rd('cb'), cr: rd('cr') };
  const mb = rd(process.env.MASK_EXT || 'mask'); const mask = new Float32Array(mb.length); for (let i = 0; i < mb.length; i++) mask[i] = mb[i] / 255;
  const t0 = Date.now();
  const prior = process.env.PRIOR ? ({ card: 'card', receipt: 'receipt' })[process.env.PRIOR === 'cat' ? m.group : ''] ?? null : null;
  const { candidates, ev } = C.cropCandidates(img, mask, 64, prior);
  const mag = Q.sobel(Q.boxBlur(img.data, m.w, m.h, 1), m.w, m.h).mag;
  const G = Q.gradients(img.data, m.w, m.h);
  const refine = (q) => {
    let px = q.map((p) => ({ x: p.x * (m.w - 1), y: p.y * (m.h - 1) }));
    px = Q.refineQuadRobust(px, G, m.w, m.h, Number(process.env.SEARCH || 12)).quad;
    px = Q.refineQuadRobust(px, G, m.w, m.h, 3).quad;
    return px.map((p) => ({ x: p.x / (m.w - 1), y: p.y / (m.h - 1) }));
  };
  const withF = candidates.map((c) => ({ ...c, features: C.cropFeatures(c.quad, ev) }));
  C.addRelative(withF);
  const rows = withF.map((c) => {
    const f = c.features;
    const e = m.truth ? err(c.quad.map((p) => ({ x: p.x * m.w - 0.5, y: p.y * m.h - 0.5 })), m.truth, Math.hypot(m.w, m.h)) : null;
    const rq = refine(c.quad);
    const er = m.truth ? err(rq.map((p) => ({ x: p.x * m.w - 0.5, y: p.y * m.h - 0.5 })), m.truth, Math.hypot(m.w, m.h)) : null;
    return { s: c.source, v: C.featureVector(f, c.source, c.refined), e, er, q: c.quad.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4)]) };
  });
  ms += Date.now() - t0; n++;
  fs.writeSync(fd, JSON.stringify({ k, split: m.split, cat: m.category, neg: !m.truth, rows }) + '\n');
}
console.log(`${n} cases, ${(ms / n).toFixed(1)} ms/case`);
