// Swept timber sections. The rectangular sweep (ribs, lattice members, ring
// and eave beams) is ported from the Wisteria prototype (Wisteria/src/sweep.js);
// the round one, for poles and posts in a designed Bower, is its companion.
//
// UV layout matches makeGlulamTextures(): one lamination is 1/8 of the texture
// width, so the two side faces show `lams` glue lines and the top and bottom
// faces show the face of a single board. Grain runs along V.
import * as THREE from 'three';

const V3 = THREE.Vector3;
type Sign2 = readonly [number, number];

interface Face {
  a: Sign2;
  b: Sign2;
  ax: 'N' | 'B';
  s: number;
  u: readonly [number, number];
}

export class RectSweep {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];
  private n = 0;
  /** The two ends, apart from the sides: UV runs 0 to 1 across the width and 0 to `lams` across the depth. */
  private readonly cap = { pos: [] as number[], nor: [] as number[], uv: [] as number[], idx: [] as number[], n: 0 };

  /**
   * C: centres, N: depth axis, B: width axis (unit vectors per sample)
   * w: width along B, d: depth along N, lams: laminations across the depth
   * vScale: texture repeats per metre of length, vOffset: where the grain starts
   */
  add(C: readonly THREE.Vector3[], N: readonly THREE.Vector3[], B: readonly THREE.Vector3[], w: number, d: number, lams = 1, vScale = 1, vOffset = 0): void {
    const m = C.length;
    if (m < 2) return;
    const faces: Face[] = [
      { a: [-1, 1], b: [1, 1], ax: 'N', s: 1, u: [0.02, 0.105] },
      { a: [1, -1], b: [-1, -1], ax: 'N', s: -1, u: [0.02, 0.105] },
      { a: [1, 1], b: [1, -1], ax: 'B', s: 1, u: [0, lams / 8] },
      { a: [-1, -1], b: [-1, 1], ax: 'B', s: -1, u: [0, lams / 8] },
    ];
    const corner = (i: number, sg: Sign2, out: THREE.Vector3) =>
      out
        .copy(C[i]!)
        .addScaledVector(B[i]!, (sg[0] * w) / 2)
        .addScaledVector(N[i]!, (sg[1] * d) / 2);
    const pa = new V3();
    const pb = new V3();
    const pc = new V3();
    const nn = new V3();
    for (const fc of faces) {
      const base = this.n;
      let len = 0;
      for (let i = 0; i < m; i++) {
        if (i > 0) len += C[i]!.distanceTo(C[i - 1]!);
        corner(i, fc.a, pa);
        corner(i, fc.b, pb);
        nn.copy(fc.ax === 'N' ? N[i]! : B[i]!).multiplyScalar(fc.s);
        this.pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        this.nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
        const v = vOffset + len * vScale;
        this.uv.push(fc.u[0], v, fc.u[1], v);
      }
      // orient the winding to agree with the face normal
      corner(0, fc.a, pa);
      corner(0, fc.b, pb);
      corner(1, fc.a, pc);
      nn.copy(fc.ax === 'N' ? N[0]! : B[0]!).multiplyScalar(fc.s);
      const ccw = pb.sub(pa).cross(pc.sub(pa)).dot(nn) > 0;
      for (let i = 0; i < m - 1; i++) {
        const a = base + i * 2;
        const b = a + 1;
        const c = a + 2;
        const e = a + 3;
        if (ccw) this.idx.push(a, b, c, b, e, c);
        else this.idx.push(a, c, b, b, c, e);
      }
      this.n += m * 2;
    }
    // end caps
    for (const i of [0, m - 1]) {
      const t = new V3().crossVectors(B[i]!, N[i]!).multiplyScalar(i === 0 ? 1 : -1);
      const tn = new V3().subVectors(C[i === 0 ? 1 : m - 2]!, C[i]!).normalize();
      if (t.dot(tn) > 0) t.negate();
      const sg: Sign2[] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      const cap = this.cap;
      const capBase = cap.n;
      for (const s of sg) {
        corner(i, s, pa);
        cap.pos.push(pa.x, pa.y, pa.z);
        cap.nor.push(t.x, t.y, t.z);
        cap.uv.push((s[0] + 1) / 2, ((s[1] + 1) / 2) * lams);
      }
      corner(i, sg[0]!, pa);
      corner(i, sg[1]!, pb);
      corner(i, sg[2]!, pc);
      const ccw = pb.sub(pa).cross(pc.sub(pa)).dot(t) > 0;
      if (ccw) cap.idx.push(capBase, capBase + 1, capBase + 2, capBase, capBase + 2, capBase + 3);
      else cap.idx.push(capBase, capBase + 2, capBase + 1, capBase, capBase + 3, capBase + 2);
      cap.n += 4;
    }
  }

  get vertexCount(): number {
    return this.n;
  }

  /** Append the two ends of every member swept so far to arrays being gathered for the end-grain geometry. */
  appendCapsTo(pos: number[], nor: number[], uv: number[], idx: number[], offset: number): number {
    for (const v of this.cap.pos) pos.push(v);
    for (const v of this.cap.nor) nor.push(v);
    for (const v of this.cap.uv) uv.push(v);
    for (const v of this.cap.idx) idx.push(v + offset);
    return this.cap.n;
  }

  /** Append this sweep's triangles to arrays being gathered for one geometry. */
  appendTo(pos: number[], nor: number[], uv: number[], idx: number[], offset: number): number {
    for (const v of this.pos) pos.push(v);
    for (const v of this.nor) nor.push(v);
    for (const v of this.uv) uv.push(v);
    for (const v of this.idx) idx.push(v + offset);
    return this.n;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

/** Sides of a round section: enough that a 150 mm post reads as round. */
const ROUND_SIDES = 14;

/** Swept round timber sections: poles and round posts. */
export class RoundSweep {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly idx: number[] = [];
  private n = 0;
  /** The two ends, apart from the sides. */
  private readonly cap = { pos: [] as number[], nor: [] as number[], uv: [] as number[], idx: [] as number[], n: 0 };

  /**
   * C: centres, N and B: any two unit axes square to the line and to each
   * other, per sample. The grain runs along V; round the section the texture
   * spans a few boards' width, with no glue lines to speak of.
   */
  add(C: readonly THREE.Vector3[], N: readonly THREE.Vector3[], B: readonly THREE.Vector3[], radius: number, vScale = 1, vOffset = 0): void {
    const m = C.length;
    if (m < 2) return;
    const base = this.n;
    const ring = ROUND_SIDES + 1;
    let len = 0;
    for (let i = 0; i < m; i++) {
      if (i > 0) len += C[i]!.distanceTo(C[i - 1]!);
      for (let j = 0; j < ring; j++) {
        const th = ((j % ROUND_SIDES) / ROUND_SIDES) * Math.PI * 2;
        const nx = N[i]!.x * Math.cos(th) + B[i]!.x * Math.sin(th);
        const ny = N[i]!.y * Math.cos(th) + B[i]!.y * Math.sin(th);
        const nz = N[i]!.z * Math.cos(th) + B[i]!.z * Math.sin(th);
        this.pos.push(C[i]!.x + nx * radius, C[i]!.y + ny * radius, C[i]!.z + nz * radius);
        this.nor.push(nx, ny, nz);
        this.uv.push(0.02 + 0.085 * (1 - Math.abs(1 - (2 * j) / ROUND_SIDES)), vOffset + len * vScale);
      }
    }
    for (let i = 0; i < m - 1; i++) {
      for (let j = 0; j < ROUND_SIDES; j++) {
        const a = base + i * ring + j;
        this.idx.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
      }
    }
    this.n += m * ring;
    // end caps: a fan round the centre, facing out along the line
    for (const i of [0, m - 1]) {
      const out = new V3().subVectors(C[i]!, C[i === 0 ? 1 : m - 2]!).normalize();
      const cap = this.cap;
      const centre = cap.n;
      cap.pos.push(C[i]!.x, C[i]!.y, C[i]!.z);
      cap.nor.push(out.x, out.y, out.z);
      cap.uv.push(0.5, 0.5);
      for (let j = 0; j < ROUND_SIDES; j++) {
        const th = (j / ROUND_SIDES) * Math.PI * 2;
        const dx = N[i]!.x * Math.cos(th) + B[i]!.x * Math.sin(th);
        const dy = N[i]!.y * Math.cos(th) + B[i]!.y * Math.sin(th);
        const dz = N[i]!.z * Math.cos(th) + B[i]!.z * Math.sin(th);
        cap.pos.push(C[i]!.x + dx * radius, C[i]!.y + dy * radius, C[i]!.z + dz * radius);
        cap.nor.push(out.x, out.y, out.z);
        cap.uv.push(0.5 + 0.5 * Math.cos(th), 0.5 + 0.5 * Math.sin(th));
      }
      // wind each triangle to face along `out`
      const ccw = new V3().crossVectors(N[i]!, B[i]!).dot(out) > 0;
      for (let j = 0; j < ROUND_SIDES; j++) {
        const a = centre + 1 + j;
        const b = centre + 1 + ((j + 1) % ROUND_SIDES);
        if (ccw) cap.idx.push(centre, a, b);
        else cap.idx.push(centre, b, a);
      }
      cap.n += ROUND_SIDES + 1;
    }
  }

  get vertexCount(): number {
    return this.n;
  }

  /** Append the two ends of every member swept so far to arrays being gathered for the end-grain geometry. */
  appendCapsTo(pos: number[], nor: number[], uv: number[], idx: number[], offset: number): number {
    for (const v of this.cap.pos) pos.push(v);
    for (const v of this.cap.nor) nor.push(v);
    for (const v of this.cap.uv) uv.push(v);
    for (const v of this.cap.idx) idx.push(v + offset);
    return this.cap.n;
  }

  /** Append this sweep's triangles to arrays being gathered for one geometry. */
  appendTo(pos: number[], nor: number[], uv: number[], idx: number[], offset: number): number {
    for (const v of this.pos) pos.push(v);
    for (const v of this.nor) nor.push(v);
    for (const v of this.uv) uv.push(v);
    for (const v of this.idx) idx.push(v + offset);
    return this.n;
  }
}
