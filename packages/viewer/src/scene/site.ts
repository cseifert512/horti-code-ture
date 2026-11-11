// Ground dressing round a Bower, derived from what the Bower declares:
//   headroom zone   a gravel walk through it, as in the prototype
//   feet            where rows of feet flank a walk, a planting bed along each row
//   root stations   a planting pit at each
// Nothing here is structure, and none of it is steel.
import * as THREE from 'three';
import type { Bower, Zone } from '@horti/core';
import { toThree } from '../structure/frames.ts';
import type { Foot } from '../structure/build.ts';

const SITE = {
  /** How far a walk runs on beyond the ends of its headroom zone, m (the prototype's 15 m path through a 5.8 m zone). */
  walkRunoutM: 4.6,
  bedWidthM: 0.9,
  /** A bed is centred this far outside the line of feet, m. */
  bedOffsetM: 0.14,
  bedOverrunM: 0.3,
  pitRadiusM: 0.42,
} as const;

export interface SiteMaterials {
  gravel: THREE.Material;
  soil: THREE.Material;
  mulch: THREE.Material;
}

export interface BuiltSite {
  group: THREE.Group;
  dispose(): void;
}

/** A horizontal rectangle with its texture laid at one repeat per metre. */
function slab(sizeX: number, sizeZ: number, x: number, z: number, y: number, material: THREE.Material): THREE.Mesh {
  const g = new THREE.PlaneGeometry(sizeX, sizeZ);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sizeX, uv.getY(i) * sizeZ);
  const mesh = new THREE.Mesh(g, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildSite(bower: Bower, feet: readonly Foot[], mats: SiteMaterials): BuiltSite {
  const group = new THREE.Group();
  group.name = `site:${bower.id}`;

  const walks: Zone[] = bower.zones.filter((z) => z.kind === 'headroom' && z.min.z <= 0.01);
  for (const zone of walks) {
    // footprint in the three.js ground plane: x = east, z = -north
    const x0 = zone.min.x;
    const x1 = zone.max.x;
    const z0 = -zone.max.y;
    const z1 = -zone.min.y;
    const alongZ = z1 - z0 >= x1 - x0;
    const run = SITE.walkRunoutM;
    const walk = alongZ ? slab(x1 - x0, z1 - z0 + 2 * run, (x0 + x1) / 2, (z0 + z1) / 2, 0.004, mats.gravel) : slab(x1 - x0 + 2 * run, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, 0.004, mats.gravel);
    walk.name = `walk:${zone.id}`;
    group.add(walk);

    // a bed along each row of feet that flanks the walk
    const across = (p: THREE.Vector3) => (alongZ ? p.x : p.z);
    const along = (p: THREE.Vector3) => (alongZ ? p.z : p.x);
    const [lo, hi] = alongZ ? [x0, x1] : [z0, z1];
    for (const side of [-1, 1]) {
      const row = feet.filter((f) => (side < 0 ? across(f.position) < lo : across(f.position) > hi));
      if (row.length < 2) continue;
      const mean = row.reduce((s, f) => s + across(f.position), 0) / row.length + side * SITE.bedOffsetM;
      const a0 = Math.min(...row.map((f) => along(f.position))) - SITE.bedOverrunM;
      const a1 = Math.max(...row.map((f) => along(f.position))) + SITE.bedOverrunM;
      const bed = alongZ ? slab(SITE.bedWidthM, a1 - a0, mean, (a0 + a1) / 2, 0.003, mats.soil) : slab(a1 - a0, SITE.bedWidthM, (a0 + a1) / 2, mean, 0.003, mats.soil);
      bed.name = 'planting bed';
      group.add(bed);
    }
  }

  // a planting pit at each root station: turned soil with a mulched crown
  const p = new THREE.Vector3();
  for (const station of bower.rootStations) {
    toThree(station.position, p);
    const pit = new THREE.Mesh(new THREE.CircleGeometry(SITE.pitRadiusM, 40), mats.soil);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(p.x, 0.0035, p.z);
    pit.receiveShadow = true;
    pit.name = `pit:${station.id}`;
    const uv = pit.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * SITE.pitRadiusM, uv.getY(i) * 2 * SITE.pitRadiusM);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(SITE.pitRadiusM * 0.55, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.mulch);
    mound.scale.y = 0.16;
    mound.position.set(p.x, 0.003, p.z);
    mound.receiveShadow = true;
    mound.castShadow = true;
    group.add(pit, mound);
  }

  return {
    group,
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    },
  };
}
