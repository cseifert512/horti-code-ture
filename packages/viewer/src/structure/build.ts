// Turns a core Bower into meshes: timber as swept laminated sections, steel
// cables as fine tubes, stone pads under the feet of the primary members.
// Geometry comes only from the Bower; nothing here is specific to one design.
import * as THREE from 'three';
import type { Bower, StructuralMember } from '@horti/core';
import { hash2 } from '../util.ts';
import { type FrameSource, type MemberFrames, bowerFrames, toThree } from './frames.ts';
import { RectSweep } from './sweep.ts';

const V3 = THREE.Vector3;

/** Rendering choices for the timber. None of these describes a plant. */
const TIMBER = {
  /** Thickness of one lamination drawn on a member's side faces, mm. Matches the prototype's ribs (5 in 180 mm). */
  lamellaMm: 38,
  /** Texture repeats per metre along the grain, as in the prototype. */
  grainPerM: 1 / 1.4,
  /** How far a member that ends at ground level is carried into the ground, m. */
  buryM: 0.05,
  /** A member end this close to the ground counts as a foot, m. */
  footToleranceM: 0.02,
} as const;

export interface StructureMaterials {
  glulam: THREE.Material;
  larch: THREE.Material;
  steel: THREE.Material;
  stone: THREE.Material;
}

export interface Foot {
  position: THREE.Vector3;
  /** Radius of the stone pad under it, m. */
  padRadiusM: number;
  memberId: string;
}

export interface BuiltStructure {
  group: THREE.Group;
  /** Box round all timber and cables, three.js frame. */
  bounds: THREE.Box3;
  /** Where primary members meet the ground. */
  feet: Foot[];
  /** Section frames per member id: the surface a plant lies on is C + N * depth / 2. */
  frames: Map<string, MemberFrames>;
  /** How many members were oriented by each rule. */
  frameSources: Record<FrameSource, number>;
  triangles: number;
  dispose(): void;
}

const sameSection = (a: StructuralMember, b: StructuralMember) =>
  a.tier === b.tier &&
  a.role === b.role &&
  a.material === b.material &&
  a.section.shape === 'rect' &&
  b.section.shape === 'rect' &&
  a.section.widthMm === b.section.widthMm &&
  a.section.depthMm === b.section.depthMm;

/**
 * Join members that continue one another end to end (the same section, the same
 * line) so that the grain runs through instead of restarting at every node. A
 * lattice the core describes node to node is drawn as the long pieces it is
 * built from.
 */
function chains(members: readonly StructuralMember[], frames: Map<string, MemberFrames>): StructuralMember[][] {
  const key = (p: THREE.Vector3) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`;
  const starts = new Map<string, StructuralMember[]>();
  for (const m of members) {
    const k = key(frames.get(m.id)!.C[0]!);
    const list = starts.get(k);
    if (list) list.push(m);
    else starts.set(k, [m]);
  }
  const next = new Map<string, StructuralMember>();
  const hasPrev = new Set<string>();
  const dirA = new V3();
  const dirB = new V3();
  for (const m of members) {
    const C = frames.get(m.id)!.C;
    const end = C[C.length - 1]!;
    dirA.subVectors(end, C[C.length - 2]!).normalize();
    let best: StructuralMember | null = null;
    let bestDot = 0.94; // within about 20 degrees of straight on
    for (const o of starts.get(key(end)) ?? []) {
      if (o === m || hasPrev.has(o.id) || !sameSection(m, o)) continue;
      const oc = frames.get(o.id)!.C;
      const d = dirA.dot(dirB.subVectors(oc[1]!, oc[0]!).normalize());
      if (d > bestDot) {
        best = o;
        bestDot = d;
      }
    }
    if (best) {
      next.set(m.id, best);
      hasPrev.add(best.id);
    }
  }
  const out: StructuralMember[][] = [];
  const seen = new Set<string>();
  const walk = (start: StructuralMember) => {
    const chain: StructuralMember[] = [];
    for (let m: StructuralMember | undefined = start; m && !seen.has(m.id); m = next.get(m.id)) {
      seen.add(m.id);
      chain.push(m);
    }
    if (chain.length) out.push(chain);
  };
  for (const m of members) if (!hasPrev.has(m.id)) walk(m);
  for (const m of members) walk(m); // closed loops have no first member
  return out;
}

export function buildStructure(bower: Bower, mats: StructureMaterials): BuiltStructure {
  const group = new THREE.Group();
  group.name = `structure:${bower.id}`;
  const bounds = new THREE.Box3();
  const frames = bowerFrames(bower);
  const frameSources: Record<FrameSource, number> = { hosted_routes: 0, neighbours: 0, own_plane: 0, outward: 0 };
  const rect = bower.members.filter((m) => m.section.shape === 'rect');
  for (const m of rect) {
    const f = frames.get(m.id)!;
    frameSources[f.source]++;
    for (const p of f.C) bounds.expandByPoint(p);
  }

  // ---- timber ------------------------------------------------------------------
  const sweeps = new Map<THREE.Material, RectSweep>();
  const feet: Foot[] = [];
  for (const chain of chains(rect, frames)) {
    const first = chain[0]!;
    if (first.section.shape !== 'rect') continue;
    const C: THREE.Vector3[] = [];
    const N: THREE.Vector3[] = [];
    const B: THREE.Vector3[] = [];
    chain.forEach((m, k) => {
      const f = frames.get(m.id)!;
      const from = k === 0 ? 0 : 1; // the joint is shared with the piece before
      for (let i = from; i < f.C.length; i++) {
        C.push(f.C[i]!.clone());
        // keep the width axis from flipping where two pieces meet
        const flip = B.length > 0 && B[B.length - 1]!.dot(f.B[i]!) < 0;
        N.push(f.N[i]!);
        B.push(flip ? f.B[i]!.clone().negate() : f.B[i]!);
      }
    });
    const w = first.section.widthMm / 1000;
    const d = first.section.depthMm / 1000;
    // a member standing on the ground: note the foot, and carry the timber into the ground
    for (const end of [0, C.length - 1]) {
      const p = C[end]!;
      if (Math.abs(p.y) > TIMBER.footToleranceM) continue;
      if (first.tier === 'primary') feet.push({ position: new V3(p.x, 0, p.z), padRadiusM: 1.1 * Math.max(w, d), memberId: chain[end === 0 ? 0 : chain.length - 1]!.id });
      const inward = C[end === 0 ? 1 : C.length - 2]!;
      p.addScaledVector(new V3().subVectors(p, inward).normalize(), TIMBER.buryM);
    }
    const mat = first.material === 'glulam' || first.tier === 'primary' ? mats.glulam : mats.larch;
    let sweep = sweeps.get(mat);
    if (!sweep) sweeps.set(mat, (sweep = new RectSweep()));
    const lams = Math.max(1, Math.round(first.section.depthMm / TIMBER.lamellaMm));
    sweep.add(C, N, B, w, d, lams, TIMBER.grainPerM, hash2(sweep.vertexCount, C.length));
  }
  let triangles = 0;
  const geometries: THREE.BufferGeometry[] = [];
  for (const [mat, sweep] of sweeps) {
    const g = sweep.build();
    geometries.push(g);
    triangles += g.index!.count / 3;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = mat === mats.glulam ? 'glulam' : 'timber sub-lattice';
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- steel cables: one unit cylinder, instanced per straight run --------------
  const runs: { a: THREE.Vector3; b: THREE.Vector3; r: number }[] = [];
  for (const s of bower.supports) {
    if (s.kind !== 'cable') continue;
    const pts = s.curve.points.map((p) => toThree(p));
    for (let i = 0; i + 1 < pts.length; i++) {
      runs.push({ a: pts[i]!, b: pts[i + 1]!, r: s.diameterMm / 2000 });
      bounds.expandByPoint(pts[i]!).expandByPoint(pts[i + 1]!);
    }
  }
  if (runs.length) {
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    geometries.push(cyl);
    const cables = new THREE.InstancedMesh(cyl, mats.steel, runs.length);
    cables.name = 'steel cables';
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new V3(0, 1, 0);
    const dir = new V3();
    runs.forEach(({ a, b, r }, k) => {
      dir.subVectors(b, a);
      const len = dir.length();
      q.setFromUnitVectors(Y, dir.multiplyScalar(1 / len));
      m4.compose(a.clone().add(b).multiplyScalar(0.5), q, new V3(r, len, r));
      cables.setMatrixAt(k, m4);
    });
    cables.castShadow = cables.receiveShadow = true;
    triangles += runs.length * 16;
    group.add(cables);
  }

  // ---- stone pads under the feet --------------------------------------------------
  if (feet.length) {
    const pad = new THREE.CylinderGeometry(1, 1.1, 0.03, 24);
    geometries.push(pad);
    const pads = new THREE.InstancedMesh(pad, mats.stone, feet.length);
    pads.name = 'stone pads';
    const m4 = new THREE.Matrix4();
    feet.forEach((f, k) => pads.setMatrixAt(k, m4.makeScale(f.padRadiusM, 1, f.padRadiusM).setPosition(f.position.x, 0.002, f.position.z)));
    pads.receiveShadow = true;
    pads.castShadow = true;
    group.add(pads);
  }

  return {
    group,
    bounds,
    feet,
    frames,
    frameSources,
    triangles,
    dispose() {
      for (const g of geometries) g.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
    },
  };
}
