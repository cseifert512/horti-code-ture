// Swept rectangular timber sections (ribs, lattice members, ring and eave
// beams). Ported from the Wisteria prototype (Wisteria/src/sweep.js).
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
      const base = this.n;
      const t = new V3().crossVectors(B[i]!, N[i]!).multiplyScalar(i === 0 ? 1 : -1);
      const tn = new V3().subVectors(C[i === 0 ? 1 : m - 2]!, C[i]!).normalize();
      if (t.dot(tn) > 0) t.negate();
      const sg: Sign2[] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (const s of sg) {
        corner(i, s, pa);
        this.pos.push(pa.x, pa.y, pa.z);
        this.nor.push(t.x, t.y, t.z);
        this.uv.push(0.03 + 0.03 * (s[0] + 1), 0.03 * (s[1] + 1));
      }
      corner(i, sg[0]!, pa);
      corner(i, sg[1]!, pb);
      corner(i, sg[2]!, pc);
      const ccw = pb.sub(pa).cross(pc.sub(pa)).dot(t) > 0;
      if (ccw) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      this.n += 4;
    }
  }

  get vertexCount(): number {
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
