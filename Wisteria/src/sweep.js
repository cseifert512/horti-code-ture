import * as THREE from 'three';

const V3 = THREE.Vector3;

// Swept rectangular timber sections (ribs, lattice members, eave beams).
export class RectSweep {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
    this.n = 0;
  }
  /**
   * C: centres, N: depth axis, B: width axis (unit vectors per sample)
   * w: width along B, d: depth along N, lams: laminations across the depth
   */
  add(C, N, B, w, d, lams = 1, vScale = 1) {
    const m = C.length;
    const faces = [
      { a: [-1, 1], b: [1, 1], ax: 'N', s: 1, u: [0.02, 0.105] },
      { a: [1, -1], b: [-1, -1], ax: 'N', s: -1, u: [0.02, 0.105] },
      { a: [1, 1], b: [1, -1], ax: 'B', s: 1, u: [0, lams / 8] },
      { a: [-1, -1], b: [-1, 1], ax: 'B', s: -1, u: [0, lams / 8] },
    ];
    const corner = (i, sg, out) =>
      out
        .copy(C[i])
        .addScaledVector(B[i], (sg[0] * w) / 2)
        .addScaledVector(N[i], (sg[1] * d) / 2);
    const pa = new V3();
    const pb = new V3();
    const pc = new V3();
    const nn = new V3();
    for (const fc of faces) {
      const base = this.n;
      let len = 0;
      for (let i = 0; i < m; i++) {
        if (i > 0) len += C[i].distanceTo(C[i - 1]);
        corner(i, fc.a, pa);
        corner(i, fc.b, pb);
        nn.copy(fc.ax === 'N' ? N[i] : B[i]).multiplyScalar(fc.s);
        this.pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        this.nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
        this.uv.push(fc.u[0], len * vScale, fc.u[1], len * vScale);
      }
      // orient the winding to agree with the face normal
      corner(0, fc.a, pa);
      corner(0, fc.b, pb);
      corner(1, fc.a, pc);
      nn.copy(fc.ax === 'N' ? N[0] : B[0]).multiplyScalar(fc.s);
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
      const t = new V3().crossVectors(B[i], N[i]).multiplyScalar(i === 0 ? 1 : -1);
      const tn = new V3().subVectors(C[i === 0 ? 1 : m - 2], C[i]).normalize();
      if (t.dot(tn) > 0) t.negate();
      const sg = [
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
      corner(i, sg[0], pa);
      corner(i, sg[1], pb);
      corner(i, sg[2], pc);
      const ccw = pb.sub(pa).cross(pc.sub(pa)).dot(t) > 0;
      if (ccw) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      this.n += 4;
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}
