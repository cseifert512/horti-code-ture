import * as THREE from 'three';

const V3 = THREE.Vector3;

// ---------------------------------------------------------------------------
// Interference tests.
//
//  Solids      the structure, as oriented boxes (timber sections) and
//              capsules (steel tube), in a uniform grid
//  SphereHash  the plant's own wood, as spheres strung along every stem
//
// Both are used while the plant grows (to keep organs out of the way of
// things) and afterwards by the audit that measures what interference is
// left.
// ---------------------------------------------------------------------------
export class Solids {
  constructor(cell = 0.3) {
    this.cell = cell;
    this.items = [];
    this.map = new Map();
    this.seen = [];
    this.stamp = 0;
  }
  _key(i, j, k) {
    return (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  }
  _insert(idx, lo, hi) {
    const c = this.cell;
    for (let i = Math.floor(lo.x / c); i <= Math.floor(hi.x / c); i++)
      for (let j = Math.floor(lo.y / c); j <= Math.floor(hi.y / c); j++)
        for (let k = Math.floor(lo.z / c); k <= Math.floor(hi.z / c); k++) {
          const key = this._key(i, j, k);
          let a = this.map.get(key);
          if (!a) this.map.set(key, (a = []));
          a.push(idx);
        }
    this.seen.push(0);
  }
  addBox(c, ax, ay, az, hx, hy, hz, tag = '') {
    const ex = Math.abs(ax.x) * hx + Math.abs(ay.x) * hy + Math.abs(az.x) * hz;
    const ey = Math.abs(ax.y) * hx + Math.abs(ay.y) * hy + Math.abs(az.y) * hz;
    const ez = Math.abs(ax.z) * hx + Math.abs(ay.z) * hy + Math.abs(az.z) * hz;
    this.items.push({ t: 0, c: c.clone(), ax: ax.clone(), ay: ay.clone(), az: az.clone(), hx, hy, hz, tag });
    this._insert(this.items.length - 1, new V3(c.x - ex, c.y - ey, c.z - ez), new V3(c.x + ex, c.y + ey, c.z + ez));
  }
  addCapsule(a, b, r, tag = '') {
    this.items.push({ t: 1, a: a.clone(), b: b.clone(), r, tag });
    this._insert(
      this.items.length - 1,
      new V3(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r),
      new V3(Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r)
    );
  }
  /** A swept rectangular member: one box per segment. */
  addSweep(C, N, B, w, d, tag) {
    const az = new V3();
    const ax = new V3();
    const ay = new V3();
    const c = new V3();
    for (let i = 0; i < C.length - 1; i++) {
      az.subVectors(C[i + 1], C[i]);
      const len = az.length();
      if (len < 1e-6) continue;
      az.multiplyScalar(1 / len);
      ax.addVectors(B[i], B[i + 1]);
      ax.addScaledVector(az, -ax.dot(az)).normalize();
      ay.crossVectors(az, ax);
      c.addVectors(C[i], C[i + 1]).multiplyScalar(0.5);
      this.addBox(c, ax, ay, az, w / 2, d / 2, len / 2 + 0.002, tag);
    }
  }

  /**
   * Signed distance from p to the nearest solid (negative = inside), looking
   * no further than `range`. Writes the direction away from that solid to
   * outN and returns Infinity when nothing is in range.
   */
  query(p, range, outN) {
    const c = this.cell;
    const st = ++this.stamp;
    let best = Infinity;
    const i0 = Math.floor((p.x - range) / c);
    const i1 = Math.floor((p.x + range) / c);
    const j0 = Math.floor((p.y - range) / c);
    const j1 = Math.floor((p.y + range) / c);
    const k0 = Math.floor((p.z - range) / c);
    const k1 = Math.floor((p.z + range) / c);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++) {
          const a = this.map.get(this._key(i, j, k));
          if (!a) continue;
          for (const idx of a) {
            if (this.seen[idx] === st) continue;
            this.seen[idx] = st;
            const it = this.items[idx];
            let sd;
            if (it.t === 0) {
              const dx = p.x - it.c.x;
              const dy = p.y - it.c.y;
              const dz = p.z - it.c.z;
              const lx = dx * it.ax.x + dy * it.ax.y + dz * it.ax.z;
              const ly = dx * it.ay.x + dy * it.ay.y + dz * it.ay.z;
              const lz = dx * it.az.x + dy * it.az.y + dz * it.az.z;
              const ox = lx - Math.max(-it.hx, Math.min(it.hx, lx));
              const oy = ly - Math.max(-it.hy, Math.min(it.hy, ly));
              const oz = lz - Math.max(-it.hz, Math.min(it.hz, lz));
              const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
              if (d > 1e-9) {
                sd = d;
                if (sd < best && outN) {
                  outN
                    .set(0, 0, 0)
                    .addScaledVector(it.ax, ox / d)
                    .addScaledVector(it.ay, oy / d)
                    .addScaledVector(it.az, oz / d);
                }
              } else {
                const px = it.hx - Math.abs(lx);
                const py = it.hy - Math.abs(ly);
                const pz = it.hz - Math.abs(lz);
                const m = Math.min(px, py, pz);
                sd = -m;
                if (sd < best && outN) {
                  if (m === px) outN.copy(it.ax).multiplyScalar(Math.sign(lx) || 1);
                  else if (m === py) outN.copy(it.ay).multiplyScalar(Math.sign(ly) || 1);
                  else outN.copy(it.az).multiplyScalar(Math.sign(lz) || 1);
                }
              }
            } else {
              const abx = it.b.x - it.a.x;
              const aby = it.b.y - it.a.y;
              const abz = it.b.z - it.a.z;
              const t = Math.max(
                0,
                Math.min(
                  1,
                  ((p.x - it.a.x) * abx + (p.y - it.a.y) * aby + (p.z - it.a.z) * abz) /
                    (abx * abx + aby * aby + abz * abz)
                )
              );
              const qx = p.x - (it.a.x + abx * t);
              const qy = p.y - (it.a.y + aby * t);
              const qz = p.z - (it.a.z + abz * t);
              const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
              sd = d - it.r;
              if (sd < best && outN) outN.set(qx, qy, qz).multiplyScalar(1 / Math.max(d, 1e-9));
            }
            if (sd < best) {
              best = sd;
              this.lastTag = it.tag;
            }
          }
        }
    return best <= range ? best : Infinity;
  }
}

export class SphereHash {
  constructor(cell = 0.1) {
    this.cell = cell;
    this.map = new Map();
  }
  _key(i, j, k) {
    return (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);
  }
  add(x, y, z, r, a, b) {
    const c = this.cell;
    const key = this._key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c));
    let arr = this.map.get(key);
    if (!arr) this.map.set(key, (arr = []));
    arr.push({ x, y, z, r, a, b });
  }
  /** cb(sphere) for every stored sphere whose cell lies within range of p */
  each(x, y, z, range, cb) {
    const c = this.cell;
    for (let i = Math.floor((x - range) / c); i <= Math.floor((x + range) / c); i++)
      for (let j = Math.floor((y - range) / c); j <= Math.floor((y + range) / c); j++)
        for (let k = Math.floor((z - range) / c); k <= Math.floor((z + range) / c); k++) {
          const arr = this.map.get(this._key(i, j, k));
          if (arr) for (const s of arr) cb(s);
        }
  }
  /** signed clearance from point p (radius r) to the nearest stored sphere */
  clearance(p, r, range = 0.15, minR = 0) {
    let best = Infinity;
    this.each(p.x, p.y, p.z, range, (s) => {
      if (s.r < minR) return;
      const d = Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) - s.r - r;
      if (d < best) {
        best = d;
        this.last = s;
      }
    });
    return best;
  }
}
