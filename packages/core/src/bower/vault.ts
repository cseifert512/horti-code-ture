/**
 * The barrel-vault segment from the Wisteria prototype, rebuilt as a proper
 * two-graph Bower.
 *
 * Geometry is the prototype's parametric surface S(u, v) (its structure.js),
 * converted to the core frame:
 *   u  0 (west foot) -> 0.5 (crown) -> 1 (east foot)
 *   v  0 -> 1 along the vault, which runs north to south
 * Lattice nodes sit at u = k / 20, v = m / 12 with k + m even, between the two
 * eaves (k = 4 and k = 16).
 *
 * What changed from the prototype, and why:
 *   The prototype let trunk stems twine the glulam rib legs and laid 57% of
 *   the permanent framework directly on the diagrid timber. The specification
 *   makes primary structure a non-climbing surface by default (CONSTRAINTS
 *   section 7). Here every plant route lies on a SECONDARY element standing
 *   `layerM` clear of the timber:
 *     leader rods    up the outside of the planted rib legs
 *     training rods  along the diagonals and the eaves
 *     cables         level, node to node, as in the prototype
 *   The topology a shoot can travel is unchanged; what it touches is not.
 *
 * Rod and cable sizes and the standoff are design choices for this reference
 * scene, not validated support specifications.
 */
import { Polyline } from '../math/polyline.ts';
import { type Vec3, addScaled, cross, fromYUp, normalize, sub, v3 } from '../math/vec3.ts';
import { unknown } from '../provenance.ts';
import { SupportGraph } from './support-graph.ts';
import type { Bower, LocalSupport, RootStation, StructuralMember, SupportEdge, Zone } from './types.ts';

/** Dimensions carried over from the prototype (metres). */
export const VAULT = {
  lengthM: 5.2,
  halfSpanM: 2.1,
  riseM: 3.2,
  ribs: 5,
  rib: { widthMm: 100, depthMm: 180 },
  diagrid: { widthMm: 50, depthMm: 70 },
  eave: { widthMm: 70, depthMm: 90 },
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
  /** Height of the plant-contact layer above the rib surface S. The diagrid's top face is at 0.07 m. */
  layerM?: number;
  cableDiameterMm?: number;
  rodDiameterMm?: number;
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

export function makeVaultBower(options: VaultOptions = {}): Bower {
  const {
    stations = [
      { side: 0, rib: 1 },
      { side: 1, rib: 3 },
    ],
    layerM = 0.11,
    cableDiameterMm = 5,
    rodDiameterMm = 10,
    segmentsPerEdge = 12,
  } = options;
  const { K0, K1, MM, NA, NB } = VAULT;

  const members: StructuralMember[] = [];
  const supports: LocalSupport[] = [];
  const graph = new SupportGraph();

  /** A curve drawn straight in (u, v) between two parameter points, `h` above the surface. */
  const onSurface = (a: [number, number], b: [number, number], h: number, segments = segmentsPerEdge) =>
    Polyline.sample((t) => vaultPoint(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, h), segments);

  // ---- primary timber --------------------------------------------------------
  for (let r = 0; r < VAULT.ribs; r++) {
    const v = r / (VAULT.ribs - 1);
    members.push({
      id: `rib.${r}`,
      role: 'rib',
      curve: Polyline.sample((t) => {
        const p = vaultPoint(t, v, -VAULT.rib.depthMm / 2000);
        return t === 0 || t === 1 ? v3(p.x, p.y, 0) : p;
      }, 110),
      section: { shape: 'rect', ...VAULT.rib },
      material: 'glulam',
      contact: 'prohibited',
      inspectable: true,
    });
  }
  for (const k of [K0, K1]) {
    members.push({
      id: `eave.${k === K0 ? 'west' : 'east'}`,
      role: 'eave',
      curve: onSurface([k / (2 * NA), 0], [k / (2 * NA), 1], VAULT.eave.depthMm / 2000, 40),
      section: { shape: 'rect', ...VAULT.eave },
      material: 'larch',
      contact: 'prohibited',
      inspectable: true,
    });
  }

  // ---- lattice nodes ---------------------------------------------------------
  for (let k = K0; k <= K1; k++) for (let m = 0; m <= MM; m++) if (isVaultNode(k, m)) graph.addNode({ id: nid(k, m), position: vaultPoint(...vaultNodeUV(k, m), layerM) });

  const addSupportEdge = (id: string, from: string, to: string, curve: Polyline, kind: 'rod' | 'cable', mountedOn: string[]) => {
    const diameterMm = kind === 'cable' ? cableDiameterMm : rodDiameterMm;
    supports.push({ id: `${kind}.${id}`, kind, curve, diameterMm, surface: 'smooth', contact: 'permitted', replaceable: true, mountedOn });
    const edge: SupportEdge = { id, from, to, curve, host: { type: 'support', id: `${kind}.${id}` }, kind, gripDiameterMm: diameterMm, surface: 'smooth', contact: 'permitted', zones: [] };
    graph.addEdge(edge);
  };

  // ---- diagonals: timber member below, training rod above --------------------
  for (let k = K0; k < K1; k++) {
    for (let m = 0; m <= MM; m++) {
      if (!isVaultNode(k, m)) continue;
      for (const dm of [-1, 1]) {
        if (!isVaultNode(k + 1, m + dm)) continue;
        const a = vaultNodeUV(k, m);
        const b = vaultNodeUV(k + 1, m + dm);
        const key = `${k}.${m}-${k + 1}.${m + dm}`;
        members.push({
          id: `diagrid.${key}`,
          role: 'diagrid',
          curve: onSurface(a, b, VAULT.diagrid.depthMm / 2000),
          section: { shape: 'rect', ...VAULT.diagrid },
          material: 'larch',
          contact: 'prohibited',
          inspectable: true,
        });
        addSupportEdge(`T.${key}`, nid(k, m), nid(k + 1, m + dm), onSurface(a, b, layerM), 'rod', [`diagrid.${key}`]);
      }
    }
  }

  // ---- level runs: cables inside the canopy, rods along the eaves ------------
  const stationRibM = (s: VaultStation) => Math.round((s.rib / (VAULT.ribs - 1)) * MM);
  for (let k = K0; k <= K1; k++) {
    const eave = k === K0 || k === K1;
    const side = k === K0 ? 0 : 1;
    // a planted rib that meets the eave between two lattice nodes adds a junction there
    const junctions = eave ? stations.filter((s) => s.side === side && !isVaultNode(k, stationRibM(s))).map(stationRibM) : [];
    for (const mj of junctions) graph.addNode({ id: nid(k, mj), position: vaultPoint(k / (2 * NA), mj / (2 * NB), layerM) });
    for (let m = 0; m + 2 <= MM; m++) {
      if (!isVaultNode(k, m)) continue;
      const u = k / (2 * NA);
      if (!eave) {
        // a tensioned cable runs straight from node to node
        const a = graph.nodes.get(nid(k, m))!.position;
        const b = graph.nodes.get(nid(k, m + 2))!.position;
        addSupportEdge(`C.${k}.${m}-${k}.${m + 2}`, nid(k, m), nid(k, m + 2), new Polyline([a, b]), 'cable', []);
      } else {
        const stops = [m, ...junctions.filter((mj) => mj > m && mj < m + 2), m + 2];
        for (let i = 0; i + 1 < stops.length; i++) {
          const m0 = stops[i]!;
          const m1 = stops[i + 1]!;
          addSupportEdge(`E.${k}.${m0}-${k}.${m1}`, nid(k, m0), nid(k, m1), onSurface([u, m0 / (2 * NB)], [u, m1 / (2 * NB)], layerM), 'rod', [`eave.${side === 0 ? 'west' : 'east'}`]);
        }
      }
    }
  }

  // ---- root stations and their leader rods ------------------------------------
  const rootStations: RootStation[] = [];
  stations.forEach((s, index) => {
    const m = stationRibM(s);
    const v = m / (2 * NB);
    const K = s.side === 0 ? K0 : K1;
    const step = s.side === 0 ? 1 : -1;
    const uFoot = s.side === 0 ? 0.004 : 0.996;
    const uEave = K / (2 * NA);
    const footId = `foot.${index}`;
    graph.addNode({ id: footId, position: vaultPoint(uFoot, v, layerM) });
    addSupportEdge(`L.${index}.leg`, footId, nid(K, m), onSurface([uFoot, v], [uEave, v], layerM, 3 * segmentsPerEdge), 'rod', [`rib.${s.rib}`]);
    // carry on up the rib to the first lattice node, where there is one
    if (isVaultNode(K + step, m)) {
      addSupportEdge(`L.${index}.head`, nid(K, m), nid(K + step, m), onSurface([uEave, v], [(K + step) / (2 * NA), v], layerM), 'rod', [`rib.${s.rib}`]);
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

  const crown = vaultSurface(0.5, 0.5);
  return {
    id: 'vault-segment',
    name: 'Barrel-vault segment (from the Wisteria prototype)',
    members,
    supports,
    graph,
    rootStations,
    zones,
    facts: {
      lengthM: VAULT.lengthM,
      spanM: 2 * VAULT.halfSpanM,
      crownHeightM: crown.z,
      contactLayerAboveRibSurfaceM: layerM,
      cableDiameterMm,
      rodDiameterMm,
    },
  };
}
