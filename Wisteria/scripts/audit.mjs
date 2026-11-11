// Interference audit: measures how far any part of the plant sits inside
// the structure or inside another stem, at several moments of its life.
//   node scripts/audit.mjs [seed]
import * as THREE from 'three';
import { growWisteria, stemRadius, GEND } from '../src/skeleton.js';
import { SphereHash } from '../src/collide.js';

const seed = Number(process.argv[2]) || 7;
const t0 = Date.now();
const sk = growWisteria(seed);
const { solids } = sk;
const V3 = THREE.Vector3;
const n = new V3();
const c = new V3();
console.log(`seed ${seed}: grown in ${Date.now() - t0} ms`, sk.stats);
console.log(`  ${sk.shoots.length} shoots, ${sk.spurs.length} spurs, ${sk.whips.length} whips, ${sk.leaves.length} leaves, ${sk.racemes.length} racemes`);

const mm = (x) => (x * 1000).toFixed(1) + ' mm';
function centreAt(sh, i, G, out) {
  const r = stemRadius(G, sh.birth[i], sh.R[i]);
  const ov = sh.over[i];
  const lift = ov ? (sh.lift[i] * stemRadius(G, ov[0], ov[1])) / ov[1] : 0;
  out.copy(sh.base[i]).addScaledVector(sh.sup[i], lift + r);
  return r;
}
function related(a, i, b, k) {
  const near = 3 * (a.R[i] + b.R[k]) + 0.05;
  if (a === b) return Math.abs(i - k) * 0.035 < near + 0.1;
  if (b === a.parent) return i * 0.04 < near;
  if (a === b.parent) return k * 0.04 < near;
  if (a.parent && a.parent === b.parent && Math.abs(a.parentI - b.parentI) < 8) return i < 6 && k < 6;
  return false;
}

const wood = [...sk.shoots, ...sk.spurs];
for (const sh of sk.spurs) sh.parent ??= null;

for (const G of [1.5, 3, 6, 9, GEND]) {
  const hash = new SphereHash(0.1);
  const pts = [];
  for (const sh of wood) {
    for (let i = 0; i < sh.base.length; i++) {
      if (sh.birth[i] >= G) continue;
      const r = centreAt(sh, i, G, c);
      pts.push({ x: c.x, y: c.y, z: c.z, r, sh, i });
      if (sh.kind !== 'spur') hash.add(c.x, c.y, c.z, r, sh, i);
    }
  }
  let sMax = 0, s2 = 0, s5 = 0, wMax = 0, w2 = 0, w5 = 0;
  const tags = {};
  let worst = null;
  for (const p of pts) {
    c.set(p.x, p.y, p.z);
    const sd = solids.query(c, p.r + 0.02, n);
    const pen = p.r - sd;
    if (pen > 0.002) { s2++; tags[solids.lastTag] = (tags[solids.lastTag] || 0) + 1; }
    if (pen > 0.005) s5++;
    if (pen > sMax) { sMax = pen; worst = `${p.sh.kind}/${p.sh.mode[p.i]} i=${p.i} vs ${solids.lastTag}`; }
    if (p.sh.kind === 'spur') continue;
    hash.each(p.x, p.y, p.z, p.r + 0.12, (o) => {
      if (o.a.id >= p.sh.id && !(o.a === p.sh && o.b > p.i)) return; // each pair once
      if (related(p.sh, p.i, o.a, o.b)) return;
      const pe = p.r + o.r - Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z);
      if (pe > 0.002) w2++;
      if (pe > 0.005) w5++;
      if (pe > wMax) wMax = pe;
      if (pe > 0.004 && G === Number(process.env.VERBOSE_G || GEND) && process.env.VERBOSE) console.log('   ', mm(pe), p.sh.kind, p.sh.mode[p.i], p.sh.id, p.i, 'R', mm(p.r), 'lift', mm(p.sh.lift[p.i]), 'b', p.sh.birth[p.i].toFixed(2), '<->', o.a.kind, o.a.mode[o.b], o.a.id, o.b, 'R', mm(o.r), 'lift', mm(o.a.lift[o.b]), 'b', o.a.birth[o.b].toFixed(2), 'par', p.sh.parent?.id, o.a.parent?.id);
    });
  }
  console.log(`G=${String(G).padEnd(4)} ${String(pts.length).padStart(6)} stem points | vs structure: max ${mm(Math.max(0, sMax))}, >2mm ${s2}, >5mm ${s5} ${JSON.stringify(tags)} ${worst ?? ''} | stem vs stem: max ${mm(wMax)}, >2mm ${w2}, >5mm ${w5}`);
}

// whips (short-lived; tested at full size)
{
  let max = 0, bad = 0, tot = 0;
  for (const w of sk.whips) for (let i = 2; i < w.pts.length; i++) {
    tot++;
    const pen = w.R[i] - solids.query(w.pts[i], 0.05, n);
    if (pen > 0.002) bad++;
    if (pen > max) max = pen;
  }
  console.log(`whips: ${tot} points | vs structure: max ${mm(Math.max(0, max))}, >2mm ${bad}`);
}
// racemes, at rest
{
  const hash = new SphereHash(0.1);
  for (const sh of sk.shoots) for (let i = 0; i < sh.pts.length; i++) hash.add(sh.pts[i].x, sh.pts[i].y, sh.pts[i].z, sh.R[i], sh, i);
  let bad = 0, badW = 0;
  for (const r of sk.racemes) {
    const len = 0.26 * r.scale;
    let hit = false, hitW = false;
    for (let s = 0; s <= len; s += 0.02) {
      const fr = s / len;
      const rad = fr < 0.17 ? 0.004 : 0.04 * r.scale * (1 - 0.5 * fr * fr);
      c.set(r.p.x, r.p.y - s, r.p.z);
      if (solids.query(c, rad + 0.05, n) < rad) hit = true;
      if (hash.clearance(c, rad, 0.2, 0.008) < 0) hitW = true;
    }
    if (hit) bad++;
    if (hitW) badW++;
  }
  console.log(`racemes: ${sk.racemes.length} | touching structure ${bad} | touching stems >8mm thick ${badW}`);
}
// leaves: rachis line against the structure
{
  let bad = 0;
  for (const lf of sk.leaves) {
    let hit = false;
    for (const t of [0.25, 0.5, 0.75, 1]) {
      c.copy(lf.p).addScaledVector(lf.dir, t * lf.len);
      c.y -= 0.28 * t * t * lf.len * 0.6;
      if (solids.query(c, 0.05, n) < 0.004) hit = true;
    }
    if (hit) bad++;
  }
  console.log(`leaves: ${sk.leaves.length} | rachis touching structure ${bad} (${((100 * bad) / sk.leaves.length).toFixed(1)}%)`);
}
