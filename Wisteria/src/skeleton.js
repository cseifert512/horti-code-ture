import * as THREE from 'three';
import { RNG, lerp, clamp, smoothstep } from './util.js';
import { ST, S, frame, mkFrame, validNode, nodeUV, hasCable, cableEnds, topHeight, structureSolids } from './structure.js';
import { SphereHash } from './collide.js';

// ---------------------------------------------------------------------------
// Growth simulation of Wisteria sinensis over the glulam canopy.
//
// The whole life of the plant is simulated once, up front. Every point of
// every shoot records the moment it came into being ("birth", in growing
// seasons since planting: 3.4 = 40% of the way through the fourth season).
// The renderer then shows any instant by comparing those births against the
// clock - in the vertex shader - so the timeline can be scrubbed freely.
//
// GROWTH FOLLOWS THE STRUCTURE
// A wisteria shoot cannot hold itself up: it goes where there is something
// to wind round or be tied to. So shoots here do not wander over a surface;
// they travel the structure's own members, node to node:
//
//   rib leg     the trunk stems TWINE it, counter-clockwise, side by side
//   glulam      framework arms LIE along the top of the diagonals and the
//   member      eave beams, as a gardener ties them in
//   cable       shoots TWINE the training wires unaided, and cross each
//               lattice node over its top
//
// At every node a shoot chooses its next member: upward before level, level
// before downward, an empty member before an occupied one. Buds break at
// the nodes and take a member their parent did not.
//
// CONTACT, NOT CENTRE LINES
// A stem is stored as the line where it TOUCHES its support, plus the unit
// direction away from that support. Its centre is always
//
//     centre(t) = contact + away * ( lift(t) + radius(t) )
//
// so it sits on the timber / round the cable at every age and thickens
// outwards, never into what carries it. Where a shoot runs over or round one
// that was already there, `lift` raises it clear - by an amount that itself
// follows the older stem's thickening.
//
// Also modelled: a grafted nursery cane; slow establishment; each leaf living
// one season at its node, followed by a spur that leafs and (from the third
// year, on two-year wood) flowers; summer whips pruned in July and winter;
// pipe-model thickening.
// ---------------------------------------------------------------------------

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const UP = new V3(0, 1, 0);
const ZERO = new V3(0, 0, 0);

export const GEND = 12; // growing seasons simulated
export const FOREVER = 1e6;
const R_PRIMARY = 0.0036;
const STEP = 0.04;

// extension-growth multiplier while the plant establishes
const estab = (b) => (b < 1 ? 0.5 : b < 2 ? 0.8 : 1);
// rough final radius by branching order, used only to size clearances
const R_EST = [0.03, 0.02, 0.012, 0.008];

/** Stem radius at growing-time G. Mirrored exactly in the vertex shader. */
export function stemRadius(G, birth, Rf) {
  const age = G - birth;
  if (age <= 0) return 0;
  const rp = Math.min(Rf, R_PRIMARY);
  const span = Math.max(GEND - birth, 1);
  return (
    rp * (0.3 + 0.7 * smoothstep(0, 0.25, age)) * smoothstep(0, 0.03, age) +
    (Rf - rp) * Math.pow(clamp(age / span, 0, 1), 1.35)
  );
}

const SUPPORTED = { surf: 1, helix: 1, trunk: 1, ramp: 1 };

let shootId = 0;
function newShoot(kind, order, plant, rng) {
  return {
    id: shootId++,
    kind,
    order,
    plant,
    base: [], // contact line (or the centre line itself where unsupported)
    sup: [], // direction away from the support; zero where unsupported
    nrm: [], // "up" for anything borne at this point
    birth: [],
    uv: [], // lattice coordinates, or null
    mode: [], // trunk | surf | ramp | helix | arc | hang | join | free
    R: [], // final radius
    lift: [], // final lift over older stems
    over: [], // [birth, radius] of the stem being ridden over, or null
    pts: [], // final centre line
    death: null, // per-point calendar time of removal (whips)
    kids: [],
    nodes: [], // lattice nodes passed: { k, m, i, keys }
    arcs: [], // unsupported bridges to settle later: { i0, n, bulge }
    parent: null,
    parentI: 0,
    phase: rng.f(),
    pitch: rng.range(0.24, 0.36), // how tightly it coils a cable
  };
}
function push(sh, base, b, sup, nrm, uv, mode) {
  sh.base.push(base);
  sh.birth.push(b);
  sh.sup.push(sup);
  sh.nrm.push(nrm);
  sh.uv.push(uv);
  sh.mode.push(mode);
}

function tangentAt(pts, i, out) {
  return out.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
}

// ---------------------------------------------------------------------------
// The lattice as a graph of members a shoot can travel
// ---------------------------------------------------------------------------
const trackKey = (k1, m1, k2, m2) =>
  k1 < k2 || (k1 === k2 && m1 < m2) ? `${k1},${m1}-${k2},${m2}` : `${k2},${m2}-${k1},${m1}`;

function tracksFrom(k, m) {
  const out = [];
  for (const dk of [-1, 1]) for (const dm of [-1, 1]) if (validNode(k + dk, m + dm)) out.push({ type: 'T', k2: k + dk, m2: m + dm });
  for (const dm of [-2, 2]) if (validNode(k, m + dm)) out.push({ type: hasCable(k) ? 'C' : 'E', k2: k, m2: m + dm });
  return out;
}
const CAP = { T: 2, C: 2, E: 3 };
const LEN = { T: 0.61, C: 0.87, E: 0.87 };

const _yCache = new Map();
function nodeY(k, m) {
  const key = k * 100 + m;
  let y = _yCache.get(key);
  if (y === undefined) {
    const [u, v] = nodeUV(k, m);
    y = S(u, v).y;
    _yCache.set(key, y);
  }
  return y;
}

/**
 * Choose the members a shoot will follow from node (k, m).
 * role: 'riser' (make height), 'tier' (run level), 'free'
 */
function planPath(ctx, k, m, { length, role = 'free', avoid = null, prev = null }) {
  const { rng, occ } = ctx;
  const legs = [];
  const used = new Set();
  const first = !prev;
  let remaining = length;
  while (remaining > 0.2) {
    let best = null;
    let bestCost = 4.2;
    for (const c of tracksFrom(k, m)) {
      const key = trackKey(k, m, c.k2, c.m2);
      if (used.has(key) || (first && !legs.length && avoid && avoid.has(key))) continue;
      if (prev && c.k2 === prev.k && c.m2 === prev.m) continue; // never straight back
      const n = occ.get(key) ?? 0;
      if (n >= CAP[c.type]) continue;
      const dy = nodeY(c.k2, c.m2) - nodeY(k, m);
      // shoots make height readily, run level willingly, go downhill hardly at all
      let cost = n * 1.6 + (dy < 0 ? -dy * 5 : -dy * 1.2) + rng.range(0, 0.9);
      if (prev) {
        const straight = prev.type === c.type && prev.k2 - prev.k === c.k2 - k && prev.m2 - prev.m === c.m2 - m;
        if (straight) cost -= 0.6;
      }
      if (role === 'tier' && c.type !== 'T') cost -= 1.2;
      if (role === 'riser' && c.type === 'T' && dy > 0.02) cost -= 1.4;
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    if (!best) break;
    const key = trackKey(k, m, best.k2, best.m2);
    used.add(key);
    occ.set(key, (occ.get(key) ?? 0) + 1);
    const leg = { type: best.type, k, m, k2: best.k2, m2: best.m2, key };
    legs.push(leg);
    remaining -= LEN[best.type];
    prev = leg;
    k = best.k2;
    m = best.m2;
    if (role === 'riser' && nodeY(k, m) > ST.Ry * 0.985) role = 'tier';
    else if (role !== 'free' && rng.chance(0.12)) role = 'free';
  }
  return legs;
}

// ---- emitting the path as contact points -------------------------------------

// Lying along timber: through the given lattice coordinates, corners eased.
function emitSurf(ctx, sh, poly, b, speed, o = {}) {
  const f = mkFrame();
  // ease each interior corner with a short chamfer
  const pts = [poly[0]];
  for (let i = 1; i < poly.length - 1; i++) {
    const [u, v] = poly[i];
    frame(u, v, f);
    for (const other of [poly[i - 1], poly[i + 1]]) {
      const du = other[0] - u;
      const dv = other[1] - v;
      const len = Math.hypot(du * f.hu, dv * f.hv);
      const t = Math.min(0.45, 0.06 / len);
      pts.push([u + du * t, v + dv * t]);
    }
  }
  if (poly.length > 1) pts.push(poly[poly.length - 1]);
  const weaveP = ctx.rng.range(0, TAU);
  const weaveA = o.weave ?? 0.006;
  let s = 0;
  let carry = o.includeStart ? 0 : STEP;
  const lastBase = () => sh.base[sh.base.length - 1];
  const put = (u, v, tu, tv) => {
    frame(u, v, f);
    // a slight side-to-side weave: nothing tied in by hand runs ruler-straight
    const w = weaveA * Math.sin(s * 11 + weaveP);
    const uu = u + (-tv * w) / f.hu;
    const vv = v + (tu * w) / f.hv;
    frame(uu, vv, f);
    const base = f.p.clone().addScaledVector(f.n, o.heightFn ? o.heightFn(uu, f.hu) : topHeight(uu, f.hu));
    if (sh.base.length && base.distanceTo(lastBase()) < 0.006) return;
    if (sh.base.length) b += base.distanceTo(lastBase()) / (speed * estab(b));
    push(sh, base, b, f.n.clone(), f.n.clone(), [uu, vv], 'surf');
  };
  if (pts.length === 1) {
    put(pts[0][0], pts[0][1], 1, 0);
    return b;
  }
  for (let i = 0; i < pts.length - 1 && b < GEND; i++) {
    const [u0, v0] = pts[i];
    const [u1, v1] = pts[i + 1];
    frame((u0 + u1) / 2, (v0 + v1) / 2, f);
    const mu = (u1 - u0) * f.hu;
    const mv = (v1 - v0) * f.hv;
    const len = Math.hypot(mu, mv);
    if (len < 1e-6) continue;
    const tu = mu / len;
    const tv = mv / len;
    let d = carry;
    while (d <= len && b < GEND) {
      const t = d / len;
      put(lerp(u0, u1, t), lerp(v0, v1, t), tu, tv);
      d += STEP;
      s += STEP;
    }
    carry = d - len;
  }
  return b;
}

// index of the emitted point nearest a lattice node
function nearestPoint(sh, from, k, m) {
  const [u, v] = nodeUV(k, m);
  const p = S(u, v);
  let best = -1;
  let bd = 1e9;
  for (let i = from; i < sh.base.length; i++) {
    if (sh.mode[i] !== 'surf') continue;
    const d = sh.base[i].distanceToSquared(p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function arcPlaceholder(sh, to, n, b, speed, bulge = 0.012) {
  const from = sh.base[sh.base.length - 1];
  const step = from.distanceTo(to) / (n + 1);
  sh.arcs.push({ i0: sh.base.length, n, bulge });
  for (let k = 1; k <= n; k++) {
    b += step / (speed * estab(b));
    push(sh, from.clone().lerp(to, k / (n + 1)), b, ZERO.clone(), sh.nrm[sh.nrm.length - 1], null, 'arc');
  }
  return b;
}

// Along a cable from node (k, m) to node (k, m2): over the top of the node,
// down on to the wire, round it in a whole number of turns, and up on to the
// next node. The coil starts and ends on top because the only way past the
// timber at each end is over it; and it stops short of the node by enough
// for the stem, at its final thickness, to fit between the converging
// members.
function emitHelix(ctx, sh, leg, b, speed) {
  const c = cableEnds(leg.k, leg.m, leg.m2);
  // whoever takes a cable first sets how it is coiled; a later shoot winds
  // round that same coil (and so rides over the first all the way along)
  let g = ctx.cables.get(leg.key);
  if (!g) {
    // sized for the thickest stems a wire is likely to end up carrying
    const Re = Math.max(0.024, R_EST[Math.min(3, sh.order)]);
    const dE = (2 * Re + 0.03) / 0.707 + 0.012;
    g = { Re, dTop: (Re + 0.025) / 0.707 + 0.005, dE, turns: Math.max(1, Math.round((c.len - 2 * dE) / sh.pitch)) };
    ctx.cables.set(leg.key, g);
  }
  const { Re, dTop, dE, turns } = g;
  const span = c.len - 2 * dE;
  const e1 = c.up.clone().addScaledVector(c.dir, -c.up.dot(c.dir)).normalize();
  const e2 = new V3().crossVectors(c.dir, e1); // right-handed about the direction of travel
  const hTop = ST.memD - ST.cableH;
  const add = (base, sup, mode) => {
    const last = sh.base[sh.base.length - 1];
    b += (last ? base.distanceTo(last) : 0.02) / (speed * estab(b));
    push(sh, base, b, sup, sup, null, mode);
  };
  const ramp = (d) => {
    const dn = Math.min(d, c.len - d); // distance to the nearer node
    const h = lerp(hTop, ST.cableR, smoothstep(dTop, dE, dn));
    add(c.A.clone().addScaledVector(c.dir, d).addScaledVector(e1, h), e1.clone(), 'ramp');
  };
  for (let d = 0.025; d < dE - 0.008 && b < GEND; d += 0.025) ramp(d);
  const P = span / turns;
  const n = Math.ceil((turns * Math.hypot(P, TAU * (ST.cableR + Re * 0.6))) / 0.03);
  for (let i = 0; i <= n && b < GEND; i++) {
    const t = i / n;
    const phi = TAU * turns * t;
    const sup = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
    add(c.A.clone().addScaledVector(c.dir, dE + span * t).addScaledVector(sup, ST.cableR), sup, 'helix');
  }
  for (let d = c.len - dE + 0.02; d < c.len + 0.001 && b < GEND; d += 0.025) ramp(Math.min(d, c.len));
  return b;
}

/** Turn a planned path into contact points. `cur` is where the shoot stands. */
function emit(ctx, sh, cur, legs, b, speed) {
  let i = 0;
  while (i < legs.length && b < GEND) {
    const from = sh.base.length;
    if (legs[i].type !== 'C') {
      const poly = [cur];
      const passed = [];
      while (i < legs.length && legs[i].type !== 'C') {
        poly.push(nodeUV(legs[i].k2, legs[i].m2));
        passed.push(legs[i]);
        i++;
      }
      b = emitSurf(ctx, sh, poly, b, speed);
      for (const l of passed) {
        const at = nearestPoint(sh, from, l.k2, l.m2);
        if (at >= 0) sh.nodes.push({ k: l.k2, m: l.m2, i: at });
      }
      cur = poly[poly.length - 1];
    } else {
      const leg = legs[i];
      b = emitHelix(ctx, sh, leg, b, speed);
      if (b < GEND) sh.nodes.push({ k: leg.k2, m: leg.m2, i: sh.base.length - 1 });
      cur = nodeUV(leg.k2, leg.m2);
      i++;
    }
  }
  return b;
}

// At the end of the vault a shoot has nothing more to follow and hangs.
function maybeHang(ctx, sh, b, speed) {
  const { rng } = ctx;
  const n = sh.base.length;
  if (n < 4 || sh.mode[n - 1] !== 'surf') return;
  const v = sh.uv[n - 1][1];
  if ((v > 0.015 && v < 0.985) || !rng.chance(0.65)) return;
  const dir = new V3(rng.range(-0.7, 0.7), 0.15, v < 0.5 ? -1 : 1).normalize();
  const p = sh.base[n - 1].clone().addScaledVector(sh.nrm[n - 1], 0.012);
  const len = rng.range(0.4, 0.9);
  for (let s = 0; s < len && b < GEND; s += STEP) {
    dir.y -= STEP * 2.6;
    dir.normalize();
    p.addScaledVector(dir, STEP);
    b += STEP / (speed * estab(b));
    push(sh, p.clone(), b, ZERO, new V3(0, 0.6, dir.z > 0 ? 0.8 : -0.8).normalize(), null, 'hang');
  }
}

// ---- a trunk stem: twines up the free rib leg, then on to the canopy ----------
function growLeader(ctx, plant, j) {
  const { rng } = ctx;
  const sh = newShoot('leader', 0, plant, rng);
  const speed = 2.6;
  const ds = 0.035;
  const f = mkFrame();
  const tau = new V3();
  const e1 = new V3();
  const e2 = new V3();
  // the stem bridges the flats of the rib and bears on its arrises: a
  // rounded outline drawn through the four corners
  const P5 = 5;
  const a = (ST.ribW / 2) * Math.pow(2, 1 / P5);
  const d = (ST.ribD / 2) * Math.pow(2, 1 / P5);
  const climb = plant.side ? -1 : 1;
  const cLimit = ST.uC - 0.02;
  let phi = plant.phi0 + [0, 2.35, 4.05][j] + rng.range(-0.1, 0.1);
  let b = [-0.95, 0.15, 1.1][j];
  let c = 0.0006;
  const outer = [];

  while (c < cLimit && b < GEND) {
    const u = plant.side ? 1 - c : c;
    frame(u, plant.vRib, f);
    tau.copy(f.tu).multiplyScalar(climb);
    e1.copy(f.tv);
    e2.crossVectors(tau, e1).normalize();
    // phi increases right-handed about the direction of climb: the stem goes
    // round counter-clockwise seen from above
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const rho = Math.pow(Math.pow(Math.abs(cp / a), P5) + Math.pow(Math.abs(sp / d), P5), -1 / P5);
    const x = rho * cp;
    const y = rho * sp;
    const gx = (Math.sign(x) * Math.pow(Math.abs(x / a), P5 - 1)) / a;
    const gy = (Math.sign(y) * Math.pow(Math.abs(y / d), P5 - 1)) / d;
    const gl = Math.hypot(gx, gy);
    const sup = e1.clone().multiplyScalar(gx / gl).addScaledVector(e2, gy / gl);
    const base = f.p.clone().addScaledVector(f.n, -ST.ribD / 2).addScaledVector(e1, x).addScaledVector(e2, y);
    push(sh, base, b, sup, sup, null, 'trunk');
    outer.push(sup.dot(f.n));

    // all three stems share one pitch, so they lie parallel and never cross
    const P = 0.82 + 0.2 * Math.sin(c * 23 + plant.id * 2) + 0.09 * Math.sin(c * 61 + plant.id * 5);
    const da = (ds * P) / Math.hypot(P, TAU * (rho + 0.03));
    c += da / f.hu;
    phi += (TAU * da) / P;
    b += ds / (speed * estab(b));
  }

  // leave the spiral the last time the stem faces outwards, then run straight
  // up the outer face of the rib to the eave
  let cut = outer.length - 1;
  for (let i = outer.length - 2; i > 10; i--) {
    if (outer[i] > 0.96 && outer[i] >= outer[i - 1] && outer[i] >= outer[i + 1]) {
      cut = i;
      break;
    }
  }
  for (const key of ['base', 'birth', 'sup', 'nrm', 'uv', 'mode']) sh[key].length = cut + 1;
  b = sh.birth[cut];
  // where is that on the rib?
  let uNow = plant.side ? 1 : 0;
  {
    let bd = 1e9;
    for (let k = 0; k <= 400; k++) {
      const u = plant.side ? 1 - (cLimit * k) / 400 : (cLimit * k) / 400;
      const dd = S(u, plant.vRib).distanceToSquared(sh.base[cut]);
      if (dd < bd) {
        bd = dd;
        uNow = u;
      }
    }
  }
  const K = plant.side ? ST.K1 : ST.K0;
  const uE = K / (2 * ST.NA);
  const mRib = Math.round(plant.vRib * 2 * ST.NB);
  frame(uE, plant.vRib, f);
  // the three stems come up the outer face side by side, bearing on its arrises
  const off = ([0, 0.045, -0.045][j] + rng.range(-0.004, 0.004)) / f.hv;
  // ramp up and over the eave beam so the stem, at its final thickness,
  // rolls over the arris instead of cutting it
  const D1 = ST.eaveW / 2 + 0.05;
  const D0 = D1 + 0.12;
  const overEave = (u, hu) => ST.eaveD * (1 - smoothstep(D1, D0, Math.abs(u - uE) * hu));
  let legs;
  let cur;
  if (j === 0) {
    // the first stem carries straight on: over the eave beam, up the rib's
    // outer face to the first lattice node, and from there makes for the crown
    const kN = K + climb;
    const [uN, vN] = nodeUV(kN, mRib);
    const heightFn = (u, hu) => Math.max(overEave(u, hu), ST.memD * (1 - smoothstep(0.05, 0.17, Math.abs(u - uN) * hu)));
    b = emitSurf(ctx, sh, [[uNow, plant.vRib], [uN, vN]], b, speed, { heightFn, weave: 0 });
    sh.nodes.push({ k: kN, m: mRib, i: sh.base.length - 1 });
    const came = { type: 'X', k: K, m: mRib, k2: kN, m2: mRib, key: 'lead' };
    legs = planPath(ctx, kN, mRib, { length: rng.range(5, 6.5), role: 'riser', prev: came });
    cur = [uN, vN];
  } else {
    // the other two turn along the eave beam, one each way: the lowest tier
    b = emitSurf(ctx, sh, [[uNow, plant.vRib + off * 0.3], [uE, plant.vRib + off]], b, speed, { heightFn: overEave, weave: 0 });
    const dirM = j === 1 ? 1 : -1;
    const m0 = mRib + dirM;
    const first = { type: 'E', k: K, m: m0 - 2 * dirM, k2: K, m2: m0, key: 'lead' };
    legs = [first, ...planPath(ctx, K, m0, { length: rng.range(5, 6.5), role: 'tier', prev: first })];
    cur = [uE, plant.vRib + off];
  }
  sh.legs = legs;
  b = emit(ctx, sh, cur, legs, b, speed);
  maybeHang(ctx, sh, b, speed);
  return sh;
}

function scheduleKids(ctx, sh, legs) {
  const { rng } = ctx;
  if (sh.order >= 3) return;
  for (const nd of sh.nodes) {
    if (nd.i < 3 || !rng.chance([0.9, 0.75, 0.55][sh.order])) continue;
    const bn = sh.birth[nd.i];
    // buds usually break the following spring; some sit dormant a year or more
    let cb = Math.floor(bn) + 1 + rng.range(0.02, 0.3) + (rng.chance(0.5) ? rng.int(1, 3) : 0);
    if (sh.order >= 1 && rng.chance(0.12)) cb = bn + 0.12; // sylleptic
    if (cb > GEND - 0.4) continue;
    const order = sh.order + 1;
    // the bud takes a member its parent did not
    const avoid = new Set(legs.filter((l) => (l.k === nd.k && l.m === nd.m) || (l.k2 === nd.k && l.m2 === nd.m)).map((l) => l.key));
    const leaving = legs.find((l) => l.k === nd.k && l.m === nd.m);
    ctx.queue.push({
      birth: cb,
      parent: sh,
      i: nd.i,
      k: nd.k,
      m: nd.m,
      avoid,
      role: leaving && leaving.type === 'T' ? 'tier' : 'riser',
      order,
      len: [0, rng.range(2.4, 4.4), rng.range(1.2, 2.6), rng.range(0.6, 1.4)][order],
    });
  }
}

// ---------------------------------------------------------------------------
// Crossings. Walk every supported stem and, wherever an OLDER stem lies in
// its way, raise it just enough to clear. Stems are stiff, so the rise is
// spread into a smooth hump rather than a kink.
// ---------------------------------------------------------------------------
function centre(sh, i, out) {
  return out.copy(sh.base[i]).addScaledVector(sh.sup[i], sh.lift[i] + sh.R[i]);
}

function related(sh, i, o, k) {
  const near = 3 * (o.R[k] + sh.R[i]) + 0.04;
  if (o === sh.parent) return i * 0.04 < near;
  if (o.parent === sh) return k * 0.04 < near;
  if (o.parent && o.parent === sh.parent && Math.abs(o.parentI - sh.parentI) < 8) return i < 6 && k < 6;
  return false;
}

// Smallest height >= start that lies in none of the (sorted) forbidden bands.
// The lift is later scaled through time by how far the stems underneath have
// thickened; taking the OLDEST stem in the pile for that keeps the estimate
// on the safe side (a slight gap while young, never an overlap).
function lowestFree(bands, start, dom, i) {
  let lift = start;
  for (const bd of bands) if (lift > bd[0] && lift < bd[1]) lift = bd[1];
  if (lift > 0) {
    let who = dom[i];
    for (const bd of bands) if (bd[1] <= lift + 1e-9 && (!who || bd[2] < who[0])) who = [bd[2], bd[3]];
    dom[i] = who;
  }
  return lift;
}

function resolveCrossings(shoots) {
  const c = new V3();
  for (const sh of shoots) {
    sh.lift = new Array(sh.base.length).fill(0);
    sh.over = new Array(sh.base.length).fill(null);
  }
  const D = 6;
  for (let pass = 0; pass < 7; pass++) {
    const hash = new SphereHash(0.1);
    for (const sh of shoots) {
      for (let i = 0; i < sh.base.length; i++) {
        if (sh.mode[i] === 'arc') continue;
        centre(sh, i, c);
        hash.add(c.x, c.y, c.z, sh.R[i], sh, i);
      }
    }
    for (const sh of shoots) {
      const n = sh.base.length;
      const req = new Float32Array(n);
      const dom = new Array(n).fill(null);
      const all = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        if (!SUPPORTED[sh.mode[i]]) continue;
        const b = sh.base[i];
        const s = sh.sup[i];
        const Rn = sh.R[i];
        const bi = sh.birth[i];
        // every older stem within reach forbids a band of heights; take the
        // lowest height that is free of all of them (passing beneath a stem
        // that is already bridging something is allowed if there is room)
        const bands = [];
        hash.each(b.x + s.x * Rn, b.y + s.y * Rn, b.z + s.z * Rn, Rn + 0.16, (sp) => {
          const o = sp.a;
          if (o === sh || o.birth[sp.b] >= bi || related(sh, i, o, sp.b)) return;
          const dx = sp.x - b.x;
          const dy = sp.y - b.y;
          const dz = sp.z - b.z;
          const along = dx * s.x + dy * s.y + dz * s.z;
          const perp2 = dx * dx + dy * dy + dz * dz - along * along;
          const Rs = Rn + sp.r + 0.002;
          if (perp2 >= Rs * Rs) return;
          const h = Math.sqrt(Rs * Rs - perp2);
          bands.push([along - h - Rn, along + h - Rn, o.birth[sp.b], sp.r]);
        });
        if (bands.length) {
          bands.sort((p, q) => p[0] - q[0]);
          all[i] = bands;
          req[i] = lowestFree(bands, 0, dom, i);
        }
      }
      for (let i = 0; i < n; i++) {
        if (!SUPPORTED[sh.mode[i]]) continue;
        let best = 0;
        let who = null;
        for (let j = Math.max(0, i - D); j <= Math.min(n - 1, i + D); j++) {
          if (!req[j]) continue;
          const w = Math.cos(((Math.PI / 2) * Math.abs(i - j)) / (D + 1));
          const val = req[j] * w * w;
          if (val > best) {
            best = val;
            who = dom[j];
          }
        }
        // the hump must itself stay out of every band
        if (all[i]) {
          dom[i] = who;
          best = lowestFree(all[i], best, dom, i);
          who = dom[i];
        }
        sh.lift[i] = best;
        sh.over[i] = who;
      }
      // a branch starts where its parent is, including the parent's lift
      if (sh.parent && sh.mode[0] === 'join') {
        sh.lift[0] = sh.parent.lift[sh.parentI];
        sh.over[0] = sh.parent.over[sh.parentI];
      }
    }
  }
}

function bezier(p0, p1, p2, p3, t, out) {
  const a = (1 - t) * (1 - t) * (1 - t);
  const b = 3 * (1 - t) * (1 - t) * t;
  const c = 3 * (1 - t) * t * t;
  const d = t * t * t;
  return out.set(0, 0, 0).addScaledVector(p0, a).addScaledVector(p1, b).addScaledVector(p2, c).addScaledVector(p3, d);
}

// Settle the unsupported bridges (rib to eave, timber to cable) now that the
// radii and lifts at both ends are known.
function finishArcs(shoots) {
  const T0 = new V3();
  const T3 = new V3();
  for (const sh of shoots) {
    for (const { i0, n, bulge } of sh.arcs) {
      const iE = i0 + n;
      if (iE >= sh.pts.length || i0 < 1) continue;
      const P0 = sh.pts[i0 - 1];
      const P3 = sh.pts[iE];
      const span = P0.distanceTo(P3);
      T0.subVectors(P3, P0).normalize();
      T3.copy(T0);
      if (i0 >= 2 && sh.mode[i0 - 2] !== 'arc' && sh.pts[i0 - 2].distanceTo(P0) > 1e-4) T0.subVectors(P0, sh.pts[i0 - 2]).normalize();
      if (iE + 1 < sh.pts.length && sh.mode[iE + 1] !== 'arc' && sh.pts[iE + 1].distanceTo(P3) > 1e-4) T3.subVectors(sh.pts[iE + 1], P3).normalize();
      const N = sh.nrm[iE];
      const P1 = P0.clone().addScaledVector(T0, span * 0.33).addScaledVector(N, bulge);
      const P2 = P3.clone().addScaledVector(T3, -span * 0.33).addScaledVector(N, bulge * 0.6);
      const supS = SUPPORTED[sh.mode[i0 - 1]] || sh.mode[i0 - 1] === 'join' ? sh.sup[i0 - 1] : ZERO;
      const supE = SUPPORTED[sh.mode[iE]] ? sh.sup[iE] : ZERO;
      for (let k = 0; k < n; k++) {
        const t = (k + 1) / (n + 1);
        const P = bezier(P0, P1, P2, P3, t, new V3());
        const sup = supS.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(supE, t * t);
        sh.pts[i0 + k] = P;
        sh.sup[i0 + k] = sup;
        sh.base[i0 + k] = P.clone().addScaledVector(sup, -sh.R[i0 + k]);
      }
    }
  }
}

// ---- summer whip: arches into the air, tip searching in a spiral ------------
function growWhip(ctx, host, hi, y) {
  const { rng, solids, wood } = ctx;
  const sh = newShoot('whip', 9, host.plant, rng);
  sh.death = [];
  const N = host.nrm[hi];
  const T = tangentAt(host.pts, hi, new V3());
  const L = rng.range(0.9, 2.0);
  const step = 0.04;
  const lat = new V3().crossVectors(T, N).normalize();
  const axis = N.clone()
    .multiplyScalar(rng.range(0.6, 1))
    .addScaledVector(T, rng.range(-0.6, 0.6))
    .addScaledVector(lat, rng.range(-0.6, 0.6))
    .addScaledVector(UP, 0.5)
    .normalize();
  const curlLen = rng.range(0.22, 0.4);
  const pitchLen = rng.range(0.07, 0.11);
  const e1 = new V3();
  const e2 = new V3();
  const dir = new V3();
  const nn = new V3();
  let b = y + rng.range(0.06, 0.4);
  const summerCut = y + 0.575 + rng.range(0, 0.04);
  const winterCut = y + 0.96 + rng.range(0, 0.03);
  const n = Math.ceil(L / step);
  // springs from the host: the first ring rides with the host's own surface
  push(sh, host.base[hi], b, host.sup[hi], N, null, 'join');
  sh.lift.push(host.lift[hi]);
  sh.over.push(host.over[hi]);
  sh.death.push(FOREVER);
  const p = host.pts[hi].clone();
  for (let i = 1; i <= n; i++) {
    const s = i * step;
    const fr = i / n;
    axis.y -= step * (0.3 + 1.7 * fr) * rng.range(0.6, 1.4);
    axis.x += rng.range(-1, 1) * 0.03;
    axis.z += rng.range(-1, 1) * 0.03;
    axis.normalize();
    e1.crossVectors(axis, UP).normalize();
    e2.crossVectors(axis, e1);
    const c = smoothstep(L - curlLen, L, s);
    const w = (TAU * (s - (L - curlLen))) / pitchLen;
    dir
      .copy(axis)
      .multiplyScalar(Math.cos(c))
      .addScaledVector(e1, Math.cos(w) * Math.sin(c))
      .addScaledVector(e2, Math.sin(w) * Math.sin(c));
    p.addScaledVector(dir, step);
    // a whip cannot grow through timber or a thick stem: it is turned aside
    // and slides along whatever it meets
    for (let it = 0; it < 2; it++) {
      const sd = solids.query(p, 0.06, nn);
      if (sd < 0.014) {
        p.addScaledVector(nn, 0.014 - sd);
        const into = axis.dot(nn);
        if (into < 0) axis.addScaledVector(nn, -into).normalize();
      }
      if (s > 0.12) {
        const cl = wood.clearance(p, 0.006, 0.14, 0.007);
        if (cl < 0) {
          const o = wood.last;
          nn.set(p.x - o.x, p.y - o.y, p.z - o.z).normalize();
          p.addScaledVector(nn, -cl);
          const into = axis.dot(nn);
          if (into < 0) axis.addScaledVector(nn, -into).normalize();
        }
      }
    }
    {
      // whatever else moved it, it must end clear of the structure
      for (let it = 0; it < 4; it++) {
        const sd = solids.query(p, 0.06, nn);
        if (sd >= 0.008) break;
        p.addScaledVector(nn, 0.009 - sd);
      }
    }
    b += step / 3.2;
    push(sh, p.clone(), b, ZERO, e1.clone().multiplyScalar(i % 2 ? 1 : -1).addScaledVector(UP, 0.5).normalize(), null, 'free');
    sh.lift.push(0);
    sh.over.push(null);
    sh.death.push(s < 0.1 ? FOREVER : s < 0.3 ? winterCut : summerCut);
  }
  sh.R = sh.base.map((_, i) => lerp(0.0042, 0.0011, i / n));
  sh.pts = sh.base.map((q, i) => (i === 0 ? host.pts[hi].clone() : q));
  return sh;
}

// Is a leaf lying along `dir` from `origin` clear of the structure?
const LEAF_K = 0.28;
function leafClear(solids, origin, dir, len, tmp, nn) {
  for (const t of [0.4, 0.75, 1]) {
    tmp.copy(origin).addScaledVector(dir, t * len);
    tmp.y -= LEAF_K * t * t * len * 0.6;
    if (solids.query(tmp, 0.08, nn) < 0.012 + 0.05 * len * t) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
export function growWisteria(seed = 7) {
  shootId = 0;
  const rng = new RNG(seed * 7919 + 13);
  const solids = structureSolids();
  const ctx = { rng, occ: new Map(), cables: new Map(), queue: [], solids, wood: null };
  const shoots = [];
  const tmp = new V3();
  const nn = new V3();

  const plants = [
    { id: 0, side: 0, vRib: 0.25, firstBloom: 3 },
    { id: 1, side: 1, vRib: 0.75, firstBloom: 3 },
  ];
  for (const pl of plants) {
    pl.phi0 = rng.range(0, TAU);
    for (let j = 0; j < 3; j++) shoots.push(growLeader(ctx, pl, j));
  }
  // leaders' buds: every node they pass may break
  for (const sh of shoots) scheduleKids(ctx, sh, sh.legs);

  // laterals, earliest first, so older wood claims the members first
  while (ctx.queue.length) {
    ctx.queue.sort((a, b) => b.birth - a.birth);
    const q = ctx.queue.pop();
    const par = q.parent;
    const legs = planPath(ctx, q.k, q.m, { length: q.len, role: q.role, avoid: q.avoid });
    if (!legs.length) continue;
    const sh = newShoot('lateral', q.order, par.plant, rng);
    sh.parent = par;
    sh.parentI = q.i;
    push(sh, par.base[q.i], q.birth, par.sup[q.i], par.nrm[q.i], null, 'join');
    const speed = [0, 2.4, 2.0, 1.6][q.order];
    const b = emit(ctx, sh, nodeUV(q.k, q.m), legs, q.birth, speed);
    maybeHang(ctx, sh, b, speed);
    if (sh.base.length < 8) continue;
    par.kids.push({ i: q.i, sh });
    shoots.push(sh);
    scheduleKids(ctx, sh, legs);
  }

  // ---- pipe-model radii (the envelope: fluting only ever cuts inwards) -----
  const KLEN = 2.6e-5;
  for (let k = shoots.length - 1; k >= 0; k--) {
    const sh = shoots[k];
    const n = sh.base.length;
    const at = new Map();
    for (const kid of sh.kids) at.set(kid.i, (at.get(kid.i) ?? 0) + kid.sh.A0 * 0.9);
    let A = 4e-6;
    sh.R = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      if (i < n - 1) A += KLEN * sh.base[i].distanceTo(sh.base[i + 1]);
      A += at.get(i) ?? 0;
      sh.R[i] = Math.sqrt(A);
    }
    sh.A0 = A;
    if (sh.kind === 'leader') {
      for (let i = 0; i < n; i++) sh.R[i] *= 1 + 0.5 * Math.exp(-Math.max(0, sh.base[i].y) / 0.1);
    }
    sh.R[n - 1] = 0.0004;
  }

  // ---- settle every stem against its support and its elders ----------------
  resolveCrossings(shoots);
  for (const sh of shoots) sh.pts = sh.base.map((_, i) => centre(sh, i, new V3()));
  finishArcs(shoots);

  const wood = new SphereHash(0.1);
  for (const sh of shoots) for (let i = 0; i < sh.pts.length; i++) wood.add(sh.pts[i].x, sh.pts[i].y, sh.pts[i].z, sh.R[i], sh, i);
  ctx.wood = wood;

  // ---- leaves, spurs, racemes ----------------------------------------------
  const leaves = [];
  const racemes = [];
  const spurs = [];
  const whipHosts = [];
  const T = new V3();
  const L = new V3();
  const origin = new V3();
  let frameworkLen = 0;
  const tally = { leafRetry: 0, leafKept: 0, spurDropped: 0, racemeDropped: 0 };

  const addLeaf = (sh, i, o, dir, len, birth, death) => {
    // re-aim away from the support until it clears
    let ok = leafClear(solids, o, dir, len, tmp, nn);
    for (let t = 0; t < 6 && !ok; t++) {
      tally.leafRetry++;
      dir.addScaledVector(sh.nrm[i], 0.7).normalize();
      len *= 0.9;
      ok = leafClear(solids, o, dir, len, tmp, nn);
    }
    if (!ok) tally.leafKept++;
    const ov = sh.over[i];
    leaves.push({
      p: o.clone(),
      dir: dir.clone(),
      len,
      birth,
      death,
      anchor: sh.pts[0],
      phase: sh.phase,
      rank: rng.f(),
      r1: rng.f(),
      // what the node it stands on is doing
      sup: SUPPORTED[sh.mode[i]] ? sh.sup[i] : ZERO,
      nodeR: sh.R[i],
      nodeBirth: sh.birth[i],
      over: ov ? [ov[0], ov[1], sh.lift[i]] : [0, 1, 0],
    });
  };
  // where a leaf or spur leaves the stem: its outer surface if supported
  const surfacePoint = (sh, i, out) => {
    if (SUPPORTED[sh.mode[i]]) return out.copy(sh.base[i]).addScaledVector(sh.sup[i], sh.lift[i] + 2 * sh.R[i]);
    return out.copy(sh.pts[i]);
  };

  // would a raceme hanging from `end` be clear? returns its swing room or -1
  const racemeRoom = (end, scale) => {
    const len = 0.26 * scale;
    let room = 0.2;
    for (let s = 0; s <= len + 0.001; s += s < 0.17 * len ? 0.01 : 0.03) {
      const fr = s / len;
      const rad = fr < 0.17 ? 0.006 : 0.042 * scale * (1 - 0.5 * fr * fr);
      tmp.set(end.x, end.y - s, end.z);
      if (tmp.y - rad < 0.15) return -1;
      const sd = solids.query(tmp, rad + 0.12, nn) - rad;
      const cl = wood.clearance(tmp, rad, 0.2, 0.008);
      if (sd < 0.008 || cl < 0.002) return -1;
      if (fr > 0.4) room = Math.min(room, sd, cl);
    }
    return room;
  };

  for (const sh of shoots) {
    let acc = 0;
    let next = rng.range(0.03, 0.1);
    let side = rng.sign();
    for (let i = 1; i < sh.pts.length - 1; i++) {
      const dl = sh.pts[i].distanceTo(sh.pts[i - 1]);
      frameworkLen += dl;
      acc += dl;
      if (acc < next) continue;
      acc = 0;
      next = rng.range(0.075, 0.11);
      side = -side;
      const N = sh.nrm[i];
      const bn = sh.birth[i];
      const mode = sh.mode[i];
      tangentAt(sh.pts, i, T);
      L.crossVectors(T, N);
      if (L.lengthSq() < 1e-4) L.set(1, 0, 0);
      L.normalize().multiplyScalar(side);
      surfacePoint(sh, i, origin);

      // the leaf this node carries in its first season
      addLeaf(
        sh,
        i,
        origin,
        L.clone().multiplyScalar(0.75).addScaledVector(N, 0.6).addScaledVector(T, 0.3).normalize(),
        rng.range(0.16, 0.28),
        bn + 0.004,
        Math.floor(bn) + 1
      );
      if (mode === 'surf' || mode === 'helix') whipHosts.push({ sh, i, birth: bn });

      // from its second season: a spur. The trunk on the rib leg stays bare.
      if (mode === 'trunk' || mode === 'arc' || mode === 'join') continue;
      if (!rng.chance(0.62)) continue;
      const sb = Math.floor(bn) + 1 + rng.range(0.01, 0.08);
      if (sb > GEND) continue;
      const scale = rng.range(0.78, 1.3);
      const wantRaceme = rng.chance(0.85);

      // look for somewhere the spur can go without fouling anything, ending
      // below the lattice so its raceme hangs through an open cell
      let end = null;
      let mid = null;
      let room = -1;
      let spurOK = false;
      for (let attempt = 0; attempt < 8 && !(spurOK && (room >= 0 || !wantRaceme)); attempt++) {
        let e;
        let m;
        if (mode === 'surf') {
          // off the side of the member, then down past it
          const sgn = attempt % 2 ? -1 : 1;
          const out = rng.range(0.085, 0.125) + attempt * 0.004;
          const drop = origin.clone().sub(sh.base[i]).dot(N) + topHeight(sh.uv[i][0], 8.6) + rng.range(-0.01, 0.05);
          m = sh.pts[i].clone().addScaledVector(L, sgn * out);
          e = m.clone().addScaledVector(N, -drop);
        } else {
          // away from whatever the stem is wound round, never back across it
          tmp.set(rng.range(-1, 1), 0, rng.range(-1, 1));
          if (SUPPORTED[mode]) tmp.addScaledVector(N, 1.6);
          tmp.y = 0;
          if (tmp.lengthSq() < 1e-4) tmp.set(1, 0, 0);
          tmp.normalize();
          m = sh.pts[i].clone().addScaledVector(tmp, rng.range(0.03, 0.07));
          e = m.clone();
          e.y -= rng.range(0.03, 0.06);
        }
        // the stub itself must pass cleanly
        let ok = true;
        for (const t of [0.2, 0.33, 0.5, 0.67, 0.85, 1]) {
          tmp.copy(sh.pts[i]).multiplyScalar((1 - t) * (1 - t)).addScaledVector(m, 2 * t * (1 - t)).addScaledVector(e, t * t);
          if (t > 0.3 && solids.query(tmp, 0.05, nn) < 0.007) ok = false;
        }
        if (!ok) continue;
        const rm = wantRaceme ? racemeRoom(e, scale) : -1;
        if (!spurOK || rm > room) {
          end = e;
          mid = m;
          room = rm;
          spurOK = true;
        }
      }
      if (!spurOK) {
        tally.spurDropped++;
        continue;
      }
      const supported = !!SUPPORTED[mode];
      const spur = newShoot('spur', 8, sh.plant, rng);
      // ring 0 rides with the bearing stem; the rest is the spur's own wood
      push(spur, supported ? sh.base[i] : sh.pts[i].clone(), sb, supported ? sh.sup[i] : ZERO, N, null, 'join');
      spur.lift.push(supported ? sh.lift[i] : 0);
      spur.over.push(supported ? sh.over[i] : null);
      spur.R.push(0.0044);
      spur.pts.push(supported ? centre(spur, 0, new V3()) : sh.pts[i].clone());
      for (let k = 1; k <= 3; k++) {
        const t = k / 3;
        const q = sh.pts[i].clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(mid, 2 * t * (1 - t)).addScaledVector(end, t * t);
        push(spur, q, sb + t * 0.02, ZERO, N, null, 'free');
        spur.lift.push(0);
        spur.over.push(null);
        spur.R.push(lerp(0.0044, 0.003, t));
        spur.pts.push(q);
      }
      spurs.push(spur);

      const nl = rng.int(2, 3);
      for (let k = 0; k < nl; k++) {
        const dir = N.clone()
          .multiplyScalar(rng.range(0.45, 1))
          .addScaledVector(T, rng.range(-0.8, 0.8))
          .addScaledVector(L, rng.range(-0.8, 0.8))
          .normalize();
        addLeaf(sh, i, origin, dir, rng.range(0.14, 0.26), sb, FOREVER);
        const lf = leaves[leaves.length - 1];
        lf.anchor = lf.p;
        lf.phase = rng.f();
      }
      if (wantRaceme) {
        if (room < 0) {
          tally.racemeDropped++;
          continue;
        }
        racemes.push({
          p: end,
          bloomYear: Math.max(Math.floor(sb) + 1, sh.plant.firstBloom),
          scale,
          phase: rng.range(-1, 1),
          r1: rng.f(),
          variant: rng.int(0, 3),
          yaw: rng.range(0, TAU),
          swing: clamp(room / 0.09, 0.12, 1),
          rank: rng.f(),
          pod: rng.chance(0.08),
          id: racemes.length,
        });
      }
    }
  }

  // ---- yearly crop of whips -------------------------------------------------
  const whips = [];
  for (let y = 1; y <= GEND; y++) {
    const cands = whipHosts.filter((n) => n.birth < y - 0.1);
    if (!cands.length) continue;
    const nW = Math.min(44, Math.round(cands.length * 0.11 * 0.2));
    for (let k = 0; k < nW; k++) {
      const c = rng.pick(cands);
      const w = growWhip(ctx, c.sh, c.i, y);
      whips.push(w);
      let acc = 0;
      let next = 0.08;
      for (let i = 2; i < w.pts.length - 1; i++) {
        acc += 0.04;
        if (acc < next) continue;
        acc = 0;
        next = rng.range(0.075, 0.105);
        const fr = i / w.pts.length;
        tangentAt(w.pts, i, T);
        addLeaf(
          w,
          i,
          w.pts[i],
          w.nrm[i].clone().addScaledVector(T, 0.45).normalize(),
          lerp(0.24, 0.05, Math.pow(fr, 1.4)) * rng.range(0.85, 1.1),
          w.birth[i] + 0.004,
          Math.min(w.death[i], y + 1)
        );
      }
    }
  }

  rng.shuffle(leaves);
  let tracksUsed = 0;
  for (const n of ctx.occ.values()) if (n) tracksUsed++;
  return {
    plants,
    shoots,
    spurs,
    whips,
    leaves,
    racemes,
    solids,
    stats: { frameworkLen, shoots: shoots.length, whips: whips.length, tracksUsed, ...tally },
  };
}

// ---------------------------------------------------------------------------
// Wood geometry. Vertices sit ON the contact line; the vertex shader moves
// each ring out to its centre and then to its surface, both by amounts that
// depend on the clock.
//   position = contact point        normal  = radial direction of the ring
//   aGrow    = (birth, death, final radius, fluting depth)
//   aSup     = direction away from the support (zero if unsupported)
//   aOver    = (birth, radius) of the older stem ridden over, final lift
//   aAnchor  = (shoot base xyz, phase)
// ---------------------------------------------------------------------------
export function buildWoodGeometry({ shoots, spurs, whips }) {
  const pos = [];
  const nor = [];
  const uv = [];
  const grow = [];
  const sup = [];
  const over = [];
  const anc = [];
  const idx = [];
  let vcount = 0;
  const T = new V3();
  const prevT = new V3();
  const N = new V3();
  const B = new V3();
  const q = new THREE.Quaternion();

  const add = (sh) => {
    const n = sh.pts.length;
    if (n < 2) return;
    const rMax = sh.R[0];
    const radial = rMax > 0.03 ? 16 : rMax > 0.012 ? 10 : rMax > 0.006 ? 7 : sh.kind === 'lateral' ? 5 : 4;
    const ring = radial + 1;
    const base = vcount;
    const a = sh.pts[0];
    const flute = sh.kind === 'leader' ? 1 : sh.order === 1 ? 0.5 : 0.2;
    let s = 0;
    let v = 0;
    for (let i = 0; i < n; i++) {
      T.subVectors(sh.pts[Math.min(n - 1, i + 1)], sh.pts[Math.max(0, i - 1)]);
      if (T.lengthSq() < 1e-12) T.copy(prevT);
      else T.normalize();
      if (i === 0) {
        N.set(0, 1, 0);
        if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
      } else {
        q.setFromUnitVectors(prevT, T);
        N.applyQuaternion(q);
      }
      N.addScaledVector(T, -N.dot(T)).normalize();
      B.crossVectors(T, N);
      prevT.copy(T);
      if (i > 0) {
        const ds = sh.pts[i].distanceTo(sh.pts[i - 1]);
        s += ds;
        v += ds / (TAU * Math.max(sh.R[i], 0.004));
      }
      const death = sh.death ? sh.death[i] : FOREVER;
      const ov = sh.over[i];
      for (let j = 0; j < ring; j++) {
        const th = ((j % radial) / radial) * TAU;
        const cx = Math.cos(th);
        const sx = Math.sin(th);
        pos.push(sh.base[i].x, sh.base[i].y, sh.base[i].z);
        nor.push(N.x * cx + B.x * sx, N.y * cx + B.y * sx, N.z * cx + B.z * sx);
        uv.push(j / radial, v);
        // furrows only ever cut inwards from the envelope
        const ridge =
          0.5 +
          0.5 *
            (0.5 * Math.sin(3 * th + 7 * s + sh.phase * 9) +
              0.31 * Math.sin(2 * th - 13 * s + sh.phase * 5) +
              0.19 * Math.sin(5 * th + 23 * s));
        grow.push(sh.birth[i], death, sh.R[i], flute * 0.22 * ridge);
        sup.push(sh.sup[i].x, sh.sup[i].y, sh.sup[i].z);
        if (ov) over.push(ov[0], ov[1], sh.lift[i]);
        else over.push(0, 1, 0);
        anc.push(a.x, a.y, a.z, sh.phase);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const p0 = base + i * ring + j;
        idx.push(p0, p0 + 1, p0 + ring, p0 + 1, p0 + ring + 1, p0 + ring);
      }
    }
    vcount += n * ring;
  };
  shoots.forEach(add);
  spurs.forEach(add);
  whips.forEach(add);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aGrow', new THREE.Float32BufferAttribute(grow, 4));
  g.setAttribute('aSup', new THREE.Float32BufferAttribute(sup, 3));
  g.setAttribute('aOver', new THREE.Float32BufferAttribute(over, 3));
  g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(anc, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new V3(0, 1.5, 0), 8);
  return g;
}
