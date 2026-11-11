// Ported from the Wisteria prototype (Wisteria/src/lod.js).

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

export interface LodRecord {
  /** instance matrix, 16 floats, column-major */
  m: Float32Array;
  /** instance colour multiplier */
  c: readonly [number, number, number];
  /** per-instance attribute values, concatenated in the order of `attrs` */
  a: Float32Array;
  /** position used for distance sorting */
  x: number;
  y: number;
  z: number;
  variant: number;
  /** 0..1; records with rank >= density are skipped */
  rank: number;
}

export interface LodAttr {
  name: string;
  size: number;
}

export interface LodPoolOptions<R extends LodRecord> {
  /** [variant][lod] */
  geometries: THREE.BufferGeometry[][];
  /** [lod] */
  materials: THREE.Material[];
  attrs: LodAttr[];
  records: R[];
  depth?: THREE.Material;
  castShadow?: boolean;
}

export interface LodUpdateOptions<R extends LodRecord> {
  alive: (record: R) => boolean;
  /** 0..1 */
  density?: number;
  /** LOD switch distances (m) */
  dist: number[];
  /** max instances allowed in each of the finest LODs */
  caps?: number[];
}

/** One InstancedMesh of the pool with the per-instance buffers it owns. */
interface LodSlot {
  mesh: THREE.InstancedMesh;
  /** per-instance attributes, in the order of the pool's `attrs` */
  attrs: THREE.InstancedBufferAttribute[];
  /** triangles in one instance */
  tris: number;
}

export class LodPool<R extends LodRecord = LodRecord> {
  readonly group: THREE.Group;
  records: R[];
  triangles: number;
  visible: number;
  /** instances placed in each LOD by the last update */
  used: number[];

  private readonly nLod: number;
  /** [variant][lod] */
  private readonly slots: LodSlot[][];
  /** indices into `records` selected by the last update, nearest first */
  private readonly sel: number[];
  /** squared camera distance per record index (scratch for the sort) */
  private d2: Float64Array;

  constructor(options: LodPoolOptions<R>) {
    const { geometries, materials, attrs, records, depth, castShadow = true } = options;
    this.records = records;
    this.nLod = geometries[0]!.length;
    this.group = new THREE.Group();
    this.slots = [];
    this.sel = [];
    this.d2 = new Float64Array(records.length);
    const perVariant = geometries.map(() => 0);
    for (const r of records) perVariant[r.variant]!++;

    geometries.forEach((lods, v) => {
      const cap = Math.max(1, perVariant[v]!);
      this.slots.push(
        lods.map((src, l) => {
          // share vertex buffers, own instance buffers
          const g = new THREE.BufferGeometry();
          for (const k in src.attributes) g.setAttribute(k, src.attributes[k]!);
          g.setIndex(src.index);
          g.boundingSphere = src.boundingSphere;
          const mesh = new THREE.InstancedMesh(g, materials[l]!, cap);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
          mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
          const instanced = attrs.map((a) => {
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
          this.group.add(mesh);
          return { mesh, attrs: instanced, tris: src.index!.count / 3 };
        }),
      );
    });
    this.triangles = 0;
    this.visible = 0;
    this.used = new Array<number>(this.nLod).fill(0);
  }

  /**
   * alive(rec) -> bool, density 0..1, dist: LOD switch distances (m),
   * caps: max instances allowed in each of the finest LODs
   */
  update(camera: THREE.Camera, options: LodUpdateOptions<R>): void {
    const { alive, density = 1, dist, caps = [] } = options;
    const records = this.records;
    const sel = this.sel;
    sel.length = 0;
    if (this.d2.length < records.length) this.d2 = new Float64Array(records.length);
    const dsq = this.d2;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    for (let n = 0; n < records.length; n++) {
      const r = records[n]!;
      if (r.rank >= density || !alive(r)) continue;
      const dx = r.x - cx;
      const dy = r.y - cy;
      const dz = r.z - cz;
      dsq[n] = dx * dx + dy * dy + dz * dz;
      sel.push(n);
    }
    // stable: records at equal distance keep their order in `records`
    sel.sort((a, b) => dsq[a]! - dsq[b]!);

    for (const lods of this.slots) for (const s of lods) s.mesh.count = 0;
    const used = new Array<number>(this.nLod).fill(0);
    const d2 = dist.map((d) => d * d);
    let tris = 0;
    for (const n of sel) {
      const r = records[n]!;
      const d = dsq[n]!;
      let l = 0;
      while (l < this.nLod - 1 && (d > d2[l]! || used[l]! >= (caps[l] ?? Infinity))) l++;
      used[l]!++;
      const slot = this.slots[r.variant]![l]!;
      const mesh = slot.mesh;
      const i = mesh.count++;
      mesh.instanceMatrix.array.set(r.m, i * 16);
      mesh.instanceColor!.array.set(r.c, i * 3);
      let o = 0;
      for (const at of slot.attrs) {
        for (let k = 0; k < at.itemSize; k++) at.array[i * at.itemSize + k] = r.a[o + k]!;
        o += at.itemSize;
      }
      tris += slot.tris;
    }
    for (const lods of this.slots) {
      for (const s of lods) {
        const m = s.mesh;
        m.visible = m.count > 0;
        if (!m.count) continue;
        for (const at of [m.instanceMatrix, m.instanceColor!, ...s.attrs]) {
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

  /**
   * Releases the InstancedMeshes. The vertex buffers are shared with the
   * source geometries and stay with their owner; the pool owns only the
   * per-instance buffers.
   */
  dispose(): void {
    for (const lods of this.slots) for (const s of lods) s.mesh.dispose();
  }
}
