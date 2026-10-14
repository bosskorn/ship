// Exact old post-capture crop: DocSeg mask → maskToQuad (live rules) or, if none, the whole frame.
const fs = require('fs');
const { maskToQuad } = require((process.env.BUILD || __dirname + '/build') + '/core/document-engine/capture/docSeg.js');
const [dir, ext, out] = process.argv.slice(2);
const meta = JSON.parse(fs.readFileSync(dir + '/cases.json'));
const orders = [0, 1, 2, 3].flatMap((s) => [[0, 1, 2, 3].map((i) => (s + i) % 4), [0, 1, 2, 3].map((i) => (s + 4 - i) % 4)]);
const err = (q, t, diag) => Math.min(...orders.map((o) => Math.max(...q.map((p, i) => Math.hypot(p.x - t[o[i]][0], p.y - t[o[i]][1]))))) / diag;
const res = {};
for (const [k, m] of Object.entries(meta)) {
  if (!m.truth) continue;
  const mb = new Uint8Array(fs.readFileSync(`${dir}/${k}.${ext}`));
  const p = new Float32Array(mb.length); for (let i = 0; i < mb.length; i++) p[i] = mb[i] / 255;
  const r = maskToQuad(p, 64);
  const q = r ? r.quad : [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  res[k] = { e: err(q.map((p) => ({ x: p.x * m.w - 0.5, y: p.y * m.h - 0.5 })), m.truth, Math.hypot(m.w, m.h)), full: !r, q: q.map((p) => [p.x, p.y]) };
}
fs.writeFileSync(out, JSON.stringify(res));
const v = Object.values(res);
console.log(`${dir.split('/').pop()} ${ext}: n=${v.length} ≤3% ${(100 * v.filter((r) => r.e <= 0.03).length / v.length).toFixed(1)}%  whole frame kept ${(100 * v.filter((r) => r.full).length / v.length).toFixed(1)}%`);
