// Assumption probe for the Wisteria prototype.
// Measures what the prototype actually does, so its implicit assumptions can
// be compared with the project specification instead of being taken on trust.
//   node scripts/assumptions.mjs [seed ...]
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { growWisteria, stemRadius, GEND } from '../src/skeleton.js';
import { ST, S, validNode, nodeUV, hasCable } from '../src/structure.js';

const V3 = THREE.Vector3;
const seeds = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
if (!seeds.length) seeds.push(7);

const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const stats = (a) => {
  if (!a.length) return { n: 0, min: NaN, med: NaN, max: NaN, mean: NaN };
  const s = [...a].sort((p, q) => p - q);
  return { n: s.length, min: s[0], med: s[s.length >> 1], max: s[s.length - 1], mean: s.reduce((p, q) => p + q, 0) / s.length };
};
const show = (st, d = 2, unit = '') => `n=${st.n} min ${fmt(st.min, d)} / median ${fmt(st.med, d)} / mean ${fmt(st.mean, d)} / max ${fmt(st.max, d)}${unit}`;

function fingerprint(sk) {
  const h = createHash('sha1');
  const r = (x) => Math.round(x * 1e6);
  for (const group of [sk.shoots, sk.spurs, sk.whips]) {
    for (const sh of group) {
      h.update(`${sh.kind}:${sh.order}:${sh.base.length};`);
      for (let i = 0; i < sh.base.length; i++) h.update(`${r(sh.base[i].x)},${r(sh.base[i].y)},${r(sh.base[i].z)},${r(sh.birth[i])},${r(sh.R[i])};`);
    }
  }
  for (const lf of sk.leaves) h.update(`${r(lf.p.x)},${r(lf.p.y)},${r(lf.p.z)},${r(lf.birth)};`);
  for (const rc of sk.racemes) h.update(`${r(rc.p.x)},${r(rc.p.y)},${r(rc.p.z)},${rc.bloomYear};`);
  return h.digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// 1. The structure, measured (seed-independent)
// ---------------------------------------------------------------------------
console.log('=== STRUCTURE (seed-independent) ===');
{
  const w = (v) => 2 * v - 1;
  const span = (v) => 2 * ST.Rx * (1 + 0.08 * w(v) ** 2);
  const height = (v) => ST.Ry * (1 + 0.09 * w(v) ** 2);
  console.log(`vault: length ${ST.L} m, span ${fmt(span(0.5))}-${fmt(span(0))} m, crown height ${fmt(height(0.5))}-${fmt(height(0))} m`);

  // foot-to-crown path length along the surface vs. vertical height
  const arc = (v, u0, u1, n = 4000) => {
    let len = 0;
    const a = new V3();
    const b = new V3();
    S(u0, v, a);
    for (let i = 1; i <= n; i++) {
      S(u0 + ((u1 - u0) * i) / n, v, b);
      len += a.distanceTo(b);
      a.copy(b);
    }
    return len;
  };
  for (const v of [0.25, 0.5]) {
    const crownY = S(0.5, v).y;
    console.log(`  at v=${v}: foot-to-crown surface path ${fmt(arc(v, 0, 0.5))} m vs crown height ${fmt(crownY)} m (ratio ${fmt(arc(v, 0, 0.5) / crownY)}); foot-to-eave path ${fmt(arc(v, 0, ST.uC))} m, eave height ${fmt(S(ST.uC, v).y)} m`);
  }
  const ideal = (Math.PI * 7.5) / 2;
  console.log(`  spec check: 15 m hemisphere meridian = pi*R/2 = ${fmt(ideal, 3)} m (spec says ~11.78)`);

  // the planner's fixed member lengths vs. the real geometry
  const real = { T: [], C: [], E: [] };
  const incl = [];
  for (let k = ST.K0; k <= ST.K1; k++) {
    for (let m = 0; m <= ST.MM; m++) {
      if (!validNode(k, m)) continue;
      const p = S(...nodeUV(k, m));
      for (const dm of [-1, 1]) {
        if (!validNode(k + 1, m + dm)) continue;
        const q = S(...nodeUV(k + 1, m + dm));
        real.T.push(p.distanceTo(q));
        incl.push((Math.asin(Math.abs(q.y - p.y) / p.distanceTo(q)) * 180) / Math.PI);
      }
      if (validNode(k, m + 2)) real[hasCable(k) ? 'C' : 'E'].push(p.distanceTo(S(...nodeUV(k, m + 2))));
    }
  }
  console.log(`  diagonal members (planner assumes 0.61 m): ${show(stats(real.T))} m`);
  console.log(`  cable spans      (planner assumes 0.87 m): ${show(stats(real.C))} m`);
  console.log(`  eave spans       (planner assumes 0.87 m): ${show(stats(real.E))} m`);
  console.log(`  diagonal inclination from horizontal ("about 45 degrees"): ${show(stats(incl), 1)} deg`);
  const rows = [];
  for (let k = ST.K0; k < ST.K1; k++) rows.push(S(k / (2 * ST.NA), 0.5).distanceTo(S((k + 1) / (2 * ST.NA), 0.5)));
  console.log(`  cable row spacing ("about 43 cm"): ${show(stats(rows), 3)} m`);
  const perim = 2 * (ST.ribW + ST.ribD);
  console.log(`  rib leg section ${ST.ribW * 1000}x${ST.ribD * 1000} mm: perimeter ${fmt(perim * 1000, 0)} mm = equivalent round post of ${fmt((perim / Math.PI) * 1000, 0)} mm diameter (what the trunk stems twine)`);
  console.log(`  cable diameter ${ST.cableR * 2000} mm`);
}

// ---------------------------------------------------------------------------
// 2. Per-seed behaviour
// ---------------------------------------------------------------------------
const hashes = {};
for (const seed of seeds) {
  console.log(`\n=== SEED ${seed} ===`);
  const t0 = performance.now();
  const sk = growWisteria(seed);
  const ms = performance.now() - t0;
  const fp = fingerprint(sk);
  const fp2 = fingerprint(growWisteria(seed));
  hashes[seed] = fp;
  console.log(`grown in ${fmt(ms, 0)} ms | fingerprint ${fp} | same-process rerun ${fp === fp2 ? 'IDENTICAL' : 'DIFFERENT (' + fp2 + ')'}`);

  const wood = [...sk.shoots, ...sk.spurs, ...sk.whips];

  // --- invariants ---------------------------------------------------------
  let nan = 0;
  let nonMono = 0;
  let kidBeforeParent = 0;
  for (const sh of wood) {
    for (let i = 0; i < sh.base.length; i++) {
      const p = sh.pts[i];
      if (![p.x, p.y, p.z, sh.birth[i], sh.R[i]].every(Number.isFinite)) nan++;
      if (i && sh.birth[i] < sh.birth[i - 1] - 1e-9) nonMono++;
    }
    if (sh.parent && sh.birth[0] < sh.parent.birth[sh.parentI] - 1e-9) kidBeforeParent++;
  }
  console.log(`invariants: non-finite values ${nan} | births decreasing along a stem ${nonMono} | lateral born before the wood that bears it ${kidBeforeParent}`);

  // --- twining handedness -------------------------------------------------
  // The support-normal rotates about the direction of travel. Summed
  // (sup_i x sup_i+1) . travel > 0 means a right-handed helix: ascending, the
  // stem turns anticlockwise when seen from above.
  const hand = { trunk: [], helix: [] };
  const t = new V3();
  const c = new V3();
  for (const sh of sk.shoots) {
    let run = 0;
    let runMode = null;
    let turns = 0;
    const flush = () => {
      if (runMode && Math.abs(turns) > 0.5) hand[runMode].push(turns);
      run = 0;
      turns = 0;
    };
    for (let i = 0; i < sh.base.length - 1; i++) {
      const mode = sh.mode[i];
      if ((mode !== 'trunk' && mode !== 'helix') || sh.mode[i + 1] !== mode) {
        flush();
        runMode = null;
        continue;
      }
      if (runMode !== mode) {
        flush();
        runMode = mode;
      }
      t.subVectors(sh.base[i + 1], sh.base[i]).normalize();
      c.crossVectors(sh.sup[i], sh.sup[i + 1]);
      turns += Math.asin(Math.max(-1, Math.min(1, c.dot(t)))) / (2 * Math.PI);
      run++;
    }
    flush();
  }
  for (const mode of ['trunk', 'helix']) {
    const a = hand[mode];
    const right = a.filter((x) => x > 0).length;
    console.log(`handedness, ${mode === 'trunk' ? 'trunk stems on rib legs' : 'shoots on cables'}: ${a.length} runs, ${right} right-handed (anticlockwise from above), ${a.length - right} left-handed; turns per run ${show(stats(a.map(Math.abs)), 1)}`);
  }

  // --- extension per growing season --------------------------------------
  const perSeason = {};
  for (const sh of sk.shoots) {
    const acc = new Map();
    for (let i = 1; i < sh.pts.length; i++) {
      const y = Math.floor(sh.birth[i]);
      acc.set(y, (acc.get(y) ?? 0) + sh.pts[i].distanceTo(sh.pts[i - 1]));
    }
    const key = sh.kind === 'leader' ? 'leader' : `lateral order ${sh.order}`;
    (perSeason[key] ??= []).push(...acc.values());
  }
  for (const [k, a] of Object.entries(perSeason)) console.log(`extension per growing season, ${k}: ${show(stats(a))} m`);
  const whipLen = sk.whips.map((w) => {
    let l = 0;
    for (let i = 1; i < w.pts.length; i++) l += w.pts[i].distanceTo(w.pts[i - 1]);
    return l;
  });
  console.log(`summer whip length: ${show(stats(whipLen))} m`);

  // --- how long to reach the crown ---------------------------------------
  let crownAt = Infinity;
  for (const sh of sk.shoots) for (let i = 0; i < sh.pts.length; i++) if (sh.pts[i].y > 0.97 * ST.Ry && sh.birth[i] < crownAt) crownAt = sh.birth[i];
  console.log(`first wood within 3% of crown height: growing season ${fmt(crownAt)} after planting`);
  const lenBy = [];
  for (let y = 1; y <= GEND; y++) {
    let l = 0;
    for (const sh of sk.shoots) for (let i = 1; i < sh.pts.length; i++) if (sh.birth[i] <= y) l += sh.pts[i].distanceTo(sh.pts[i - 1]);
    lenBy.push(`${y}:${fmt(l, 0)}`);
  }
  console.log(`permanent framework length by season (m): ${lenBy.join('  ')}`);

  // --- what the stems are in contact with --------------------------------
  const byMode = {};
  let total = 0;
  for (const sh of sk.shoots) {
    for (let i = 1; i < sh.pts.length; i++) {
      const d = sh.pts[i].distanceTo(sh.pts[i - 1]);
      byMode[sh.mode[i]] = (byMode[sh.mode[i]] ?? 0) + d;
      total += d;
    }
  }
  const pct = (m) => fmt((100 * (byMode[m] ?? 0)) / total, 1);
  console.log(`permanent stem length by contact: twined round rib leg ${pct('trunk')}% | lying on timber members ${pct('surf')}% | on cables ${fmt(Number(pct('helix')) + Number(pct('ramp')), 1)}% | unsupported ${fmt(Number(pct('hang')) + Number(pct('arc')) + Number(pct('free')) + Number(pct('join')), 1)}%`);

  // --- thickening ----------------------------------------------------------
  const lead = sk.shoots.filter((s) => s.kind === 'leader');
  const base = lead.map((s) => s.R[0]);
  const dia = (G) => lead.map((s) => 2000 * stemRadius(G, s.birth[0], s.R[0]));
  console.log(`trunk-stem base diameter (mm): season 3 ${show(stats(dia(3)), 0)} | season 6 ${show(stats(dia(6)), 0)} | season ${GEND} ${show(stats(base.map((r) => r * 2000)), 0)}`);

  // --- flowering -----------------------------------------------------------
  const by = {};
  for (const r of sk.racemes) by[r.bloomYear] = (by[r.bloomYear] ?? 0) + 1;
  console.log(`raceme sites by first possible bloom season index: ${JSON.stringify(by)} (plant.firstBloom = ${sk.plants.map((p) => p.firstBloom).join(',')})`);
  const rl = sk.racemes.map((r) => 0.26 * r.scale);
  console.log(`raceme length: ${show(stats(rl))} m | leaf length: ${show(stats(sk.leaves.map((l) => l.len)))} m`);
  const tips = sk.racemes.map((r) => r.p.y - 0.26 * r.scale);
  const overPath = sk.racemes.filter((r) => Math.abs(r.p.x) < 1.45);
  const low = overPath.filter((r) => r.p.y - 0.26 * r.scale < 2.1).length;
  console.log(`raceme tip height: ${show(stats(tips))} m | over the 2.9 m path: ${overPath.length} racemes, ${low} with tips below 2.1 m headroom`);
}

if (seeds.length > 1) {
  const uniq = new Set(Object.values(hashes));
  console.log(`\n${seeds.length} seeds -> ${uniq.size} distinct fingerprints`);
}
