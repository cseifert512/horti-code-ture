// Light on the structure, drawn on the structure: every stretch of route and
// every root station in the colour of the light the core says it has. No
// light is worked out here: the numbers are the core's exposure field
// (`exposureField`), read for a month and a measure.
//
// One ramp, dark to bright, for "less to more": dark violet where there is
// least, through red and orange to pale yellow where there is most. It is
// drawn in exact colours over the finished picture, so that a colour on the
// structure can be read against the scale beside it.
import * as THREE from 'three';
import type { Bower, ExposureField } from '@horti/core';
import { toThree } from '../structure/frames.ts';

/** The ramp, least to most. Also written out in index.html for the scale: keep the two the same. */
export const LIGHT_RAMP = ['#210c4a', '#6b186e', '#bb3754', '#f37819', '#fcffa4'] as const;
const STOPS = LIGHT_RAMP.map((c) => new THREE.Color(c));

export type LightMeasure = 'hours' | 'share';
/** A month, January = 0, or the whole year taken together. */
export type LightMonth = number | 'year';

export interface LightScale {
  /** The values at the dark and the bright end of the ramp. */
  low: number;
  high: number;
  /** The least and the most on the structure itself. */
  least: number;
  most: number;
}

function ramp(t: number, out: THREE.Color): THREE.Color {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  return out.copy(STOPS[i]!).lerp(STOPS[i + 1]!, x - i);
}

const valueOf = (p: { hours: number[]; share: number[] }, measure: LightMeasure, month: LightMonth): number => {
  const list = measure === 'hours' ? p.hours : p.share;
  return month === 'year' ? list.reduce((s, x) => s + x, 0) / 12 : list[month]!;
};

export class ExposureOverlay {
  readonly group = new THREE.Group();
  private tubes: THREE.InstancedMesh | null = null;
  private discs: THREE.InstancedMesh | null = null;
  /** For each tube, the exposure point it is coloured by; and the same for each station's disc. */
  private tubePoint: number[] = [];
  private discPoint: number[] = [];
  private field: ExposureField | null = null;
  private readonly material = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false });

  constructor() {
    this.group.name = 'light on the structure';
    this.group.visible = false;
  }

  /** Lay tubes along every route and a disc at every station of a Bower, to be coloured by `field`. */
  setField(bower: Bower, field: ExposureField): void {
    this.clear();
    this.field = field;
    const pointsOf = new Map<string, number[]>();
    field.points.forEach((p, i) => {
      if (p.kind !== 'route') return;
      const list = pointsOf.get(p.id);
      if (list) list.push(i);
      else pointsOf.set(p.id, [i]);
    });

    const runs: { a: THREE.Vector3; b: THREE.Vector3; r: number; point: number }[] = [];
    for (const edge of bower.graph.edges.values()) {
      const samples = pointsOf.get(edge.id);
      if (!samples?.length) continue;
      const pts = edge.curve.points;
      const cum = edge.curve.cumulative;
      // stand the tube a little proud of the timber it lies on, so that it is seen from outside
      const r = edge.kind === 'cable' ? 0.022 : 0.034;
      for (let i = 0; i + 1 < pts.length; i++) {
        const mid = (cum[i]! + cum[i + 1]!) / 2 / Math.max(edge.curve.length, 1e-9);
        const point = samples[Math.min(samples.length - 1, Math.floor(mid * samples.length))]!;
        runs.push({ a: toThree(pts[i]!), b: toThree(pts[i + 1]!), r, point });
      }
    }
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7, 1, false);
    const tubes = new THREE.InstancedMesh(cylinder, this.material, runs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    runs.forEach(({ a, b, r }, k) => {
      dir.subVectors(b, a);
      const len = Math.max(dir.length(), 1e-6);
      q.setFromUnitVectors(Y, dir.multiplyScalar(1 / len));
      m4.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len * 1.02, r));
      tubes.setMatrixAt(k, m4);
    });
    this.tubePoint = runs.map((r) => r.point);
    this.tubes = tubes;

    const stations: number[] = [];
    field.points.forEach((p, i) => {
      if (p.kind === 'station') stations.push(i);
    });
    const disc = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 40);
    const discs = new THREE.InstancedMesh(disc, this.material, stations.length);
    const at = new THREE.Vector3();
    stations.forEach((i, k) => {
      toThree(field.points[i]!.position, at);
      discs.setMatrixAt(k, m4.makeTranslation(at.x, 0.03, at.z));
    });
    this.discPoint = stations;
    this.discs = discs;
    this.group.add(tubes, discs);
  }

  /**
   * Colour everything by a measure in a month. `stretch`: spread the ramp over
   * the range found on this structure instead of over the whole range the
   * measure can take, to see small differences.
   */
  show(measure: LightMeasure, month: LightMonth, stretch: boolean): LightScale | null {
    const field = this.field;
    if (!field || !this.tubes || !this.discs) return null;
    const values = field.points.map((p) => valueOf(p, measure, month));
    const least = Math.min(...values);
    const most = Math.max(...values);
    const full = measure === 'share' ? 1 : month === 'year' ? field.possibleHours.reduce((s, x) => s + x, 0) / 12 : field.possibleHours[month]!;
    const low = stretch ? least : 0;
    const high = stretch ? Math.max(most, least + 1e-6) : full;
    const colour = new THREE.Color();
    this.tubePoint.forEach((p, k) => this.tubes!.setColorAt(k, ramp((values[p]! - low) / (high - low), colour)));
    this.discPoint.forEach((p, k) => this.discs!.setColorAt(k, ramp((values[p]! - low) / (high - low), colour)));
    if (this.tubes.instanceColor) this.tubes.instanceColor.needsUpdate = true;
    if (this.discs.instanceColor) this.discs.instanceColor.needsUpdate = true;
    return { low, high, least, most };
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  private clear(): void {
    for (const mesh of [this.tubes, this.discs]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.tubes = this.discs = null;
    this.field = null;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}
