import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Instanced organs with per-organ level of detail.
//
// A pool owns every record of one organ type (all racemes, all leaves...).
// A few times a second it decides which records are alive at the current
// moment, how many the detail budget allows, and which geometry each one
// deserves given its distance from the camera, then packs them into one
// InstancedMesh per (variant, LOD).
// ---------------------------------------------------------------------------
export class LodPool {
  /**
   * geometries[variant][lod], materials[lod], attrs: [{ name, size }]
   * records: { m: Float32Array(16), c: [r,g,b], a: Float32Array, x,y,z, variant, rank, ... }
   */
  constructor({ geometries, materials, attrs, records, depth, castShadow = true }) {
    this.records = records;
    this.attrs = attrs;
    this.nLod = geometries[0].length;
    this.group = new THREE.Group();
    this.meshes = [];
    this.sel = [];
    this.attrFloats = attrs.reduce((s, a) => s + a.size, 0);
    const perVariant = geometries.map(() => 0);
    for (const r of records) perVariant[r.variant]++;

    geometries.forEach((lods, v) => {
      const cap = Math.max(1, perVariant[v]);
      this.meshes.push(
        lods.map((src, l) => {
          // share vertex buffers, own instance buffers
          const g = new THREE.BufferGeometry();
          for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
          g.setIndex(src.index);
          g.boundingSphere = src.boundingSphere;
          const mesh = new THREE.InstancedMesh(g, materials[l], cap);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
          mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
          mesh.userData.attrs = attrs.map((a) => {
            const at = new THREE.InstancedBufferAttribute(new Float32Array(cap * a.size), a.size);
            at.setUsage(THREE.DynamicDrawUsage);
            g.setAttribute(a.name, at);
            return at;
          });
          mesh.count = 0;
          mesh.frustumCulled = false;
          mesh.castShadow = castShadow;
          mesh.receiveShadow = true;
          if (depth) mesh.customDepthMaterial = depth;
          mesh.userData.tris = src.index.count / 3;
          this.group.add(mesh);
          return mesh;
        })
      );
    });
    this.triangles = 0;
    this.visible = 0;
  }

  /**
   * alive(rec) -> bool, density 0..1, dist: LOD switch distances (m),
   * caps: max instances allowed in each of the finest LODs
   */
  update(camera, { alive, density = 1, dist, caps = [] }) {
    const sel = this.sel;
    sel.length = 0;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (const r of this.records) {
      if (r.rank >= density || !alive(r)) continue;
      const dx = r.x - cx;
      const dy = r.y - cy;
      const dz = r.z - cz;
      r._d = dx * dx + dy * dy + dz * dz;
      sel.push(r);
    }
    sel.sort((a, b) => a._d - b._d);

    for (const lods of this.meshes) for (const m of lods) m.count = 0;
    const used = new Array(this.nLod).fill(0);
    const d2 = dist.map((d) => d * d);
    let tris = 0;
    for (const r of sel) {
      let l = 0;
      while (l < this.nLod - 1 && (r._d > d2[l] || used[l] >= (caps[l] ?? Infinity))) l++;
      used[l]++;
      const mesh = this.meshes[r.variant][l];
      const i = mesh.count++;
      mesh.instanceMatrix.array.set(r.m, i * 16);
      mesh.instanceColor.array.set(r.c, i * 3);
      let o = 0;
      for (const at of mesh.userData.attrs) {
        for (let k = 0; k < at.itemSize; k++) at.array[i * at.itemSize + k] = r.a[o + k];
        o += at.itemSize;
      }
      tris += mesh.userData.tris;
    }
    for (const lods of this.meshes) {
      for (const m of lods) {
        m.visible = m.count > 0;
        if (!m.count) continue;
        for (const at of [m.instanceMatrix, m.instanceColor, ...m.userData.attrs]) {
          at.clearUpdateRanges();
          at.addUpdateRange(0, m.count * at.itemSize);
          at.needsUpdate = true;
        }
      }
    }
    this.triangles = tris;
    this.visible = sel.length;
    this.used = used;
  }

  dispose() {
    for (const lods of this.meshes) for (const m of lods) m.dispose();
  }
}
