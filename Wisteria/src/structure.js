import * as THREE from 'three';
import { Solids } from './collide.js';
import { RectSweep } from './sweep.js';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------------------
// The support: a curved glulam canopy designed around how wisteria grows.
//
//  LEGS    Five laminated ribs, each a tall basket arch. Below the eave the
//          ribs stand free, with nothing fixed to them: a twining trunk needs
//          a member it can wind round and thicken against for decades
//          without anything in its way. (The pergola principle: posts for
//          the trunk, lattice only overhead.)
//  CANOPY  From the eave up, a diagrid of curved glulam members rides on the
//          ribs. The diagonals cross the surface at roughly 40 degrees to the
//          ribs; because the vault curves over, their true inclination to the
//          horizontal falls from about 42 degrees at the eave to almost level
//          at the crown (median 22; measured by scripts/assumptions.mjs).
//          They give the gardener something stout to tie the framework arms
//          to.
//  CABLES  Between the lattice nodes run thin stainless cables, level, 34 to
//          43 cm apart (median 37): close to the usual spacing for wisteria
//          training wires. A 5 mm cable is assumed slender enough for a young
//          shoot to twine round unaided - an assumption, not a measurement.
//          They end AT the nodes (fixed to the sides of the timber, at
//          mid-depth), so nothing lying on top of a member is ever trapped
//          under a wire.
//  CELLS   The lattice cells are about 0.9 m across and open: racemes hang
//          through freely, and there is room to reach in and prune.
//
// Everything is described by one parametric surface S(u, v): the outer face
// of the ribs.
//   u: 0 (left foot) -> 0.5 (crown) -> 1 (right foot)
//   v: 0 -> 1 along the length
// Lattice nodes sit at u = k / 20, v = m / 12 with k + m even.
// ---------------------------------------------------------------------------
export const ST = {
  L: 5.2,
  Rx: 2.1,
  Ry: 3.2,
  nRibs: 5,
  ribW: 0.1,
  ribD: 0.18,
  memW: 0.05, // diagrid member, across
  memD: 0.07, // diagrid member, depth (its top face is S + memD)
  eaveW: 0.07,
  eaveD: 0.09,
  NA: 10,
  NB: 6,
  K0: 4, // eave row  (u = 0.2)
  K1: 16, // far eave (u = 0.8)
  MM: 12,
  cableR: 0.0025,
  cableH: 0.035, // cables sit at mid-depth of the members
  cableInset: 0.045, // where a cable meets the side of a node
};
ST.uC = ST.K0 / (2 * ST.NA);

export function S(u, v, out = new V3()) {
  const w = 2 * v - 1;
  const rx = ST.Rx * (1 + 0.08 * w * w);
  const ry = ST.Ry * (1 + 0.09 * w * w);
  const th = Math.PI * (1 - u);
  const c = Math.cos(th);
  const s = Math.max(Math.sin(th), 0);
  return out.set(rx * Math.sign(c) * Math.pow(Math.abs(c), 0.85), ry * Math.pow(s, 0.85), (v - 0.5) * ST.L);
}

export function mkFrame() {
  return { p: new V3(), n: new V3(), tu: new V3(), tv: new V3(), hu: 1, hv: 1 };
}

const _a = new V3();
const _b = new V3();
const E = 1e-3;
// Position, outward normal, unit tangents and metric (metres per unit u / v).
export function frame(u, v, f) {
  const uc = Math.min(1 - 2 * E, Math.max(2 * E, u));
  S(uc, v, f.p);
  S(uc + E, v, _a);
  S(uc - E, v, _b);
  f.tu.subVectors(_a, _b);
  f.hu = f.tu.length() / (2 * E);
  f.tu.normalize();
  S(uc, v + E, _a);
  S(uc, v - E, _b);
  f.tv.subVectors(_a, _b);
  f.hv = f.tv.length() / (2 * E);
  f.tv.normalize();
  f.n.crossVectors(f.tv, f.tu).normalize();
  return f;
}

export const ribVs = Array.from({ length: ST.nRibs }, (_, k) => k / (ST.nRibs - 1));

// ---- the lattice as a graph ---------------------------------------------------
export const validNode = (k, m) => k >= ST.K0 && k <= ST.K1 && m >= 0 && m <= ST.MM && ((k + m) & 1) === 0;
export const nodeUV = (k, m) => [k / (2 * ST.NA), m / (2 * ST.NB)];
export const hasCable = (k) => k > ST.K0 && k < ST.K1;

const _f = mkFrame();
/** The cable between nodes (k, m) and (k, m2), node centre to node centre. */
export function cableEnds(k, m, m2) {
  const [u, v] = nodeUV(k, m);
  const [, v2] = nodeUV(k, m2);
  frame(u, v, _f);
  const A = _f.p.clone().addScaledVector(_f.n, ST.cableH);
  const nA = _f.n.clone();
  frame(u, v2, _f);
  const B = _f.p.clone().addScaledVector(_f.n, ST.cableH);
  const dir = B.clone().sub(A);
  const len = dir.length();
  dir.multiplyScalar(1 / len);
  return { A, B, dir, len, up: nA.add(_f.n).normalize() };
}

/** Height of the timber top above S: the eave beams stand a little prouder. */
export function topHeight(u, hu) {
  const d = Math.min(Math.abs(u - ST.uC), Math.abs(u - (1 - ST.uC))) * hu;
  const t = Math.min(1, Math.max(0, (d - ST.eaveW / 2 - 0.006) / 0.07));
  return ST.eaveD + (ST.memD - ST.eaveD) * t * t * (3 - 2 * t);
}

// Every timber member as a swept section, shared by the meshes and by the
// collision solids so the two cannot drift apart.
function members() {
  const f = mkFrame();
  const ribs = [];
  const lattice = [];
  for (const rv of ribVs) {
    const C = [];
    const N = [];
    const B = [];
    const M = 110;
    for (let i = 0; i <= M; i++) {
      frame(i / M, rv, f);
      C.push(f.p.clone().addScaledVector(f.n, -ST.ribD / 2));
      N.push(f.n.clone());
      B.push(f.tv.clone());
    }
    C[0].y = -0.05;
    C[M].y = -0.05;
    ribs.push({ C, N, B, w: ST.ribW, d: ST.ribD, lams: 5 });
  }
  // diagrid: lines u*NA + v*NB = const and u*NA - v*NB = const, halved
  // together at the nodes so both families lie in one layer
  const M = 110;
  for (const sg of [1, -1]) {
    const lo = Math.floor(sg > 0 ? ST.uC * ST.NA : ST.uC * ST.NA - ST.NB);
    const hi = Math.ceil(sg > 0 ? (1 - ST.uC) * ST.NA + ST.NB : (1 - ST.uC) * ST.NA);
    for (let i = lo; i <= hi; i++) {
      let C = [];
      let N = [];
      const flush = () => {
        if (C.length > 2) {
          const B = C.map((_, k) => {
            const t = new V3().subVectors(C[Math.min(C.length - 1, k + 1)], C[Math.max(0, k - 1)]).normalize();
            return new V3().crossVectors(N[k], t).normalize();
          });
          lattice.push({ C, N, B, w: ST.memW, d: ST.memD, lams: 2 });
        }
        C = [];
        N = [];
      };
      for (let k = 0; k <= M; k++) {
        const u = ST.uC + ((1 - 2 * ST.uC) * k) / M;
        const v = (sg * (i - u * ST.NA)) / ST.NB;
        if (v < -0.0005 || v > 1.0005) {
          flush();
          continue;
        }
        frame(u, v, f);
        C.push(f.p.clone().addScaledVector(f.n, ST.memD / 2));
        N.push(f.n.clone());
      }
      flush();
    }
  }
  // eave beams
  for (const u of [ST.uC, 1 - ST.uC]) {
    const C = [];
    const N = [];
    const B = [];
    for (let k = 0; k <= 40; k++) {
      frame(u, k / 40, f);
      C.push(f.p.clone().addScaledVector(f.n, ST.eaveD / 2));
      N.push(f.n.clone());
      B.push(f.tu.clone());
    }
    lattice.push({ C, N, B, w: ST.eaveW, d: ST.eaveD, lams: 2 });
  }
  // cables, node to node along each level row
  const cables = [];
  for (let k = ST.K0 + 1; k < ST.K1; k++) {
    for (let m = 0; m + 2 <= ST.MM; m++) {
      if (!validNode(k, m)) continue;
      const c = cableEnds(k, m, m + 2);
      cables.push([
        c.A.clone().addScaledVector(c.dir, ST.cableInset),
        c.B.clone().addScaledVector(c.dir, -ST.cableInset),
      ]);
    }
  }
  // stone pads under the rib feet
  const pads = [];
  for (const rv of ribVs) {
    for (const u of [0, 1]) {
      frame(u, rv, f);
      const c = f.p.clone().addScaledVector(f.n, -ST.ribD / 2);
      pads.push(new V3(c.x, 0, c.z));
    }
  }
  return { ribs, lattice, cables, pads };
}

export function buildStructure({ glulam, larch, steel, stone }) {
  const group = new THREE.Group();
  const m = members();

  const ribs = new RectSweep();
  for (const r of m.ribs) ribs.add(r.C, r.N, r.B, r.w, r.d, r.lams, 1 / 1.4);
  const ribMesh = new THREE.Mesh(ribs.build(), glulam);

  const lat = new RectSweep();
  for (const l of m.lattice) lat.add(l.C, l.N, l.B, l.w, l.d, l.lams, 1 / 1.4);
  const latMesh = new THREE.Mesh(lat.build(), larch);

  // cables: one unit cylinder, instanced
  const cyl = new THREE.CylinderGeometry(ST.cableR, ST.cableR, 1, 6, 1, true);
  const cables = new THREE.InstancedMesh(cyl, steel, m.cables.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const Y = new V3(0, 1, 0);
  const d = new V3();
  m.cables.forEach(([a, b], k) => {
    d.subVectors(b, a);
    const len = d.length();
    q.setFromUnitVectors(Y, d.multiplyScalar(1 / len));
    m4.compose(a.clone().add(b).multiplyScalar(0.5), q, new V3(1, len, 1));
    cables.setMatrixAt(k, m4);
  });

  const pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 20), stone, m.pads.length);
  m.pads.forEach((c, k) => pads.setMatrixAt(k, m4.makeTranslation(c.x, 0.002, c.z)));
  pads.receiveShadow = true;
  group.add(pads);

  for (const mesh of [ribMesh, latMesh, cables]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** The same members as collision solids. */
export function structureSolids() {
  const m = members();
  const s = new Solids(0.3);
  for (const r of m.ribs) s.addSweep(r.C, r.N, r.B, r.w, r.d, 'rib');
  for (const l of m.lattice) s.addSweep(l.C, l.N, l.B, l.w, l.d, 'lattice');
  for (const [a, b] of m.cables) s.addCapsule(a, b, ST.cableR, 'cable');
  return s;
}
