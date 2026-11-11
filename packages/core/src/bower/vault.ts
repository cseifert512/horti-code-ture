/**
 * The barrel-vault segment from the Wisteria prototype, as a Bower.
 *
 * Geometry is the prototype's parametric surface S(u, v) (its structure.js),
 * converted to the core frame:
 *   u  0 (west foot) -> 0.5 (crown) -> 1 (east foot)
 *   v  0 -> 1 along the vault, which runs north to south
 * Lattice nodes sit at u = k / 20, v = m / 12 with k + m even, between the two
 * eaves (k = 4 and k = 16).
 *
 * The structure is the growing surface, exactly as the prototype had it:
 *   RIBS     five glulam arches, the primary structure. Below the eave the
 *            legs stand free and trunk stems twine them.
 *   LATTICE  a diagrid of lighter timber and two eave beams riding on the
 *            ribs: the timber sub-lattice. Framework arms lie along the top
 *            of these members, tied in by the gardener.
 *   CABLES   slender steel cables, level, node to node inside the canopy: the
 *            only steel. A young shoot can twine one unaided.
 *
 * Member and cable sizes are the prototype's and are placeholders for a
 * structure that is still being designed, not a specification.
 */
import { Polyline } from '../math/polyline.ts';
import { type Vec3, addScaled, cross, fromYUp, normalize, smoothstep, sub, v3 } from '../math/vec3.ts';
import { unknown } from '../provenance.ts';
import { SupportGraph } from './support-graph.ts';
import { type Bower, type LocalSupport, type RootStation, type Section, type StructuralMember, type Zone, equivalentDiameterMm, materialSummary } from './types.ts';

/** Dimensions carried over from the prototype. */
export const VAULT = {
  lengthM: 5.2,
  halfSpanM: 2.1,
  riseM: 3.2,
  ribs: 5,
  rib: { widthMm: 100, depthMm: 180 },
  diagrid: { widthMm: 50, depthMm: 70 },
  eave: { widthMm: 70, depthMm: 90 },
  /** Cables sit at mid-depth of the lattice and stop short of each node. */
  cable: { diameterMm: 5, heightM: 0.035, insetM: 0.045 },
  NA: 10,
  NB: 6,
  K0: 4,
  K1: 16,
  MM: 12,
} as const;

export interface VaultStation {
  /** 0 = west foot, 1 = east foot. */
  side: 0 | 1;
  /** Which of the five ribs, 0 (north end) to 4 (south end). */
  rib: number;
}

export interface VaultOptions {
  stations?: readonly VaultStation[];
  segmentsPerEdge?: number;
}

/** The outer face of the ribs, in the core frame. */
export function vaultSurface(u: number, v: number): Vec3 {
  const w = 2 * v - 1;
  const rx = VAULT.halfSpanM * (1 + 0.08 * w * w);
  const ry = VAULT.riseM * (1 + 0.09 * w * w);
  const th = Math.PI * (1 - u);
  const c = Math.cos(th);
  const s = Math.max(Math.sin(th), 0);
  return fromYUp(rx * Math.sign(c) * Math.pow(Math.abs(c), 0.85), ry * Math.pow(s, 0.85), (v - 0.5) * VAULT.lengthM);
}

const EPS = 1e-3;
/** Outward unit normal of the surface. */
export function vaultNormal(u: number, v: number): Vec3 {
  const uc = Math.min(1 - 2 * EPS, Math.max(2 * EPS, u));
  const tu = sub(vaultSurface(uc + EPS, v), vaultSurface(uc - EPS, v));
  const tv = sub(vaultSurface(uc, v + EPS), vaultSurface(uc, v - EPS));
  return normalize(cross(tv, tu));
}

/** A point `h` metres outside the surface. */
export function vaultPoint(u: number, v: number, h: number): Vec3 {
  return addScaled(vaultSurface(u, v), vaultNormal(u, v), h);
}

export const vaultNodeUV = (k: number, m: number): [number, number] => [k / (2 * VAULT.NA), m / (2 * VAULT.NB)];
export const isVaultNode = (k: number, m: number): boolean => k >= VAULT.K0 && k <= VAULT.K1 && m >= 0 && m <= VAULT.MM && ((k + m) & 1) === 0;
const nid = (k: number, m: number) => `n${k}.${m}`;
type UV = [number, number];

export function makeVaultBower(options: VaultOptions = {}): Bower {
  const {
    stations = [
      { side: 0, rib: 1 },
      { side: 1, rib: 3 },
    ],
    segmentsPerEdge = 12,
  } = options;
  const { K0, K1, MM, NA, NB } = VAULT;
  const isEave = (k: number) => k === K0 || k === K1;
  /** Height of the top face of the timber above S at a lattice row: where a stem lies. */
  const top = (k: number) => (isEave(k) ? VAULT.eave.depthMm : VAULT.diagrid.depthMm) / 1000;

  const members: StructuralMember[] = [];
  const supports: LocalSupport[] = [];
  const graph = new SupportGraph();

  /** A curve drawn straight in (u, v) between two parameter points, `h(t)` above the surface. */
  const onSurface = (a: UV, b: UV, h: (t: number) => number, segments = segmentsPerEdge) =>
    Polyline.sample((t) => vaultPoint(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, h(t)), segments);
  const level = (h: number) => () => h;
  const blend = (h0: number, h1: number) => (t: number) => h0 + (h1 - h0) * smoothstep(0, 1, t);

  const timber = (id: string, tier: StructuralMember['tier'], role: string, curve: Polyline, section: Section, material: string): StructuralMember => {
    const m: StructuralMember = { id, tier, role, curve, section, material, surface: 'textured', contact: 'permitted', inspectable: true };
    members.push(m);
    return m;
  };
  const timberRoute = (id: string, from: string, to: string, curve: Polyline, member: StructuralMember) => {
    graph.addEdge({ id, from, to, curve, host: { type: 'member', id: member.id }, kind: 'timber', gripDiameterMm: equivalentDiameterMm(member.section), surface: member.surface, contact: member.contact, zones: [] });
  };

  // ---- primary structure: the glulam ribs --------------------------------------
  const ribs: StructuralMember[] = [];
  for (let r = 0; r < VAULT.ribs; r++) {
    const v = r / (VAULT.ribs - 1);
    const curve = Polyline.sample((t) => {
      const p = vaultPoint(t, v, -VAULT.rib.depthMm / 2000);
      return t === 0 || t === 1 ? v3(p.x, p.y, 0) : p;
    }, 110);
    ribs.push(timber(`rib.${r}`, 'primary', 'rib', curve, { shape: 'rect', ...VAULT.rib }, 'glulam'));
  }

  // ---- timber sub-lattice: eave beams and the diagrid --------------------------
  const eaves = new Map<number, StructuralMember>();
  for (const k of [K0, K1]) {
    const u = k / (2 * NA);
    eaves.set(k, timber(`eave.${k === K0 ? 'west' : 'east'}`, 'sub_lattice', 'eave', onSurface([u, 0], [u, 1], level(VAULT.eave.depthMm / 2000), 40), { shape: 'rect', ...VAULT.eave }, 'larch'));
  }

  for (let k = K0; k <= K1; k++) for (let m = 0; m <= MM; m++) if (isVaultNode(k, m)) graph.addNode({ id: nid(k, m), position: vaultPoint(...vaultNodeUV(k, m), top(k)) });

  for (let k = K0; k < K1; k++) {
    for (let m = 0; m <= MM; m++) {
      if (!isVaultNode(k, m)) continue;
      for (const dm of [-1, 1]) {
        if (!isVaultNode(k + 1, m + dm)) continue;
        const a = vaultNodeUV(k, m);
        const b = vaultNodeUV(k + 1, m + dm);
        const key = `${k}.${m}-${k + 1}.${m + dm}`;
        const member = timber(`diagrid.${key}`, 'sub_lattice', 'diagrid', onSurface(a, b, level(VAULT.diagrid.depthMm / 2000)), { shape: 'rect', ...VAULT.diagrid }, 'larch');
        // a stem lies along the top face of the member
        timberRoute(`T.${key}`, nid(k, m), nid(k + 1, m + dm), onSurface(a, b, blend(top(k), top(k + 1))), member);
      }
    }
  }

  // ---- level runs: eave beams (timber) and, inside the canopy, steel cables ----
  const stationRibM = (s: VaultStation) => Math.round((s.rib / (VAULT.ribs - 1)) * MM);
  for (let k = K0; k <= K1; k++) {
    const u = k / (2 * NA);
    const side = k === K0 ? 0 : 1;
    // a planted rib that meets the eave between two lattice nodes adds a junction there
    const junctions = isEave(k) ? stations.filter((s) => s.side === side && !isVaultNode(k, stationRibM(s))).map(stationRibM) : [];
    for (const mj of junctions) graph.addNode({ id: nid(k, mj), position: vaultPoint(u, mj / (2 * NB), top(k)) });
    for (let m = 0; m + 2 <= MM; m++) {
      if (!isVaultNode(k, m)) continue;
      if (isEave(k)) {
        const stops = [m, ...junctions.filter((mj) => mj > m && mj < m + 2), m + 2];
        for (let i = 0; i + 1 < stops.length; i++) {
          const m0 = stops[i]!;
          const m1 = stops[i + 1]!;
          timberRoute(`E.${k}.${m0}-${k}.${m1}`, nid(k, m0), nid(k, m1), onSurface([u, m0 / (2 * NB)], [u, m1 / (2 * NB)], level(top(k))), eaves.get(k)!);
        }
        continue;
      }
      // A tensioned cable runs straight between the sides of two nodes, at
      // mid-depth of the lattice. A shoot crosses each node over its top,
      // drops on to the wire, and climbs back up at the far end.
      const aTop = graph.nodes.get(nid(k, m))!.position;
      const bTop = graph.nodes.get(nid(k, m + 2))!.position;
      const a0 = vaultPoint(u, m / (2 * NB), VAULT.cable.heightM);
      const b0 = vaultPoint(u, (m + 2) / (2 * NB), VAULT.cable.heightM);
      const dir = normalize(sub(b0, a0));
      const a = addScaled(a0, dir, VAULT.cable.insetM);
      const b = addScaled(b0, dir, -VAULT.cable.insetM);
      const key = `${k}.${m}-${k}.${m + 2}`;
      supports.push({
        id: `cable.${key}`,
        kind: 'cable',
        curve: new Polyline([a, b]),
        diameterMm: VAULT.cable.diameterMm,
        material: 'stainless steel',
        surface: 'smooth',
        contact: 'permitted',
        replaceable: true,
        mountedOn: [],
      });
      graph.addEdge({
        id: `C.${key}`,
        from: nid(k, m),
        to: nid(k, m + 2),
        curve: new Polyline([aTop, a, b, bTop]),
        host: { type: 'support', id: `cable.${key}` },
        kind: 'cable',
        gripDiameterMm: VAULT.cable.diameterMm,
        surface: 'smooth',
        contact: 'permitted',
        zones: [],
      });
    }
  }

  // ---- root stations: each at the foot of a rib leg, which is the way up -------
  const rootStations: RootStation[] = [];
  stations.forEach((s, index) => {
    const m = stationRibM(s);
    const v = m / (2 * NB);
    const K = s.side === 0 ? K0 : K1;
    const step = s.side === 0 ? 1 : -1;
    const uFoot = s.side === 0 ? 0.004 : 0.996;
    const uEave = K / (2 * NA);
    const rib = ribs[s.rib];
    if (!rib) throw new Error(`station ${index}: there is no rib ${s.rib}`);
    const footId = `foot.${index}`;
    graph.addNode({ id: footId, position: vaultPoint(uFoot, v, 0) });
    // up the outer face of the free-standing leg, rolling over the eave beam at the top
    timberRoute(`L.${index}.leg`, footId, nid(K, m), onSurface([uFoot, v], [uEave, v], (t) => top(K) * smoothstep(0.88, 1, t), 3 * segmentsPerEdge), rib);
    // and on up the rib to the first lattice node on its line, where there is one
    if (isVaultNode(K + step, m)) {
      timberRoute(`L.${index}.head`, nid(K, m), nid(K + step, m), onSurface([uEave, v], [(K + step) / (2 * NA), v], blend(top(K), top(K + step))), rib);
    }
    const foot = graph.nodes.get(footId)!.position;
    rootStations.push({
      id: `station.${index}`,
      position: v3(foot.x + (s.side === 0 ? -0.25 : 0.25), foot.y, 0),
      entryNodeIds: [footId],
      soilVolumeM3: unknown('m3'),
      irrigated: unknown(),
      note: `${s.side === 0 ? 'west' : 'east'} foot of rib ${s.rib}`,
    });
  });

  const zones: Zone[] = [
    {
      id: 'walk.headroom',
      kind: 'headroom',
      min: v3(-1.45, -VAULT.lengthM / 2 - 0.3, 0),
      max: v3(1.45, VAULT.lengthM / 2 + 0.3, 2.1),
      note: 'the 2.9 m walk through the vault: nothing may hang below 2.1 m',
    },
  ];

  const bower: Bower = { id: 'vault-segment', name: 'Barrel-vault segment (from the Wisteria prototype)', members, supports, graph, rootStations, zones, facts: {} };
  const mat = materialSummary(bower);
  return {
    ...bower,
    facts: {
      lengthM: VAULT.lengthM,
      spanM: 2 * VAULT.halfSpanM,
      crownHeightM: vaultSurface(0.5, 0.5).z,
      ribEquivalentDiameterMm: Math.round(equivalentDiameterMm({ shape: 'rect', ...VAULT.rib })),
      cableDiameterMm: VAULT.cable.diameterMm,
      steelCableM: Number(mat.steelCableM.toFixed(1)),
      steelShareOfRoute: Number(mat.steelShareOfRoute.toFixed(3)),
      sizes: 'placeholders carried over from the prototype',
    },
  };
}
