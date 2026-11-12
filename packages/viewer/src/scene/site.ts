// Ground dressing round a Bower, derived from what the Bower declares:
//   headroom zone   a gravel walk through it, edged in stone, as in the prototype
//   feet            where rows of feet flank a walk, a planting bed along each row
//   root stations   a planting pit at each, with a mulched crown
//   the site        whatever it declares stands near enough to cast shade: walls
//                   and buildings as plain massing, trees as a stem and a crown
// Nothing here is structure, and none of it is steel. What a site declares is
// drawn because the light model shades by it: a shadow in the picture and an
// hour of sun lost in the report are then the same thing.
import * as THREE from 'three';
import { type Bower, type Site, TREE_IN_LEAF_MONTHS, type Zone } from '@horti/core';
import { toThree } from '../structure/frames.ts';
import type { Foot } from '../structure/build.ts';

const SITE = {
  /** How far a walk runs on beyond each end of its headroom zone, as a share of the zone's length (the prototype's 15 m path through a 5.8 m zone). */
  walkRunout: 0.8,
  bedWidthM: 0.9,
  /** A bed is centred this far outside the line of feet, m. */
  bedOffsetM: 0.14,
  bedOverrunM: 0.3,
  pitRadiusM: 0.42,
  /** Stone edging to walks and pits: width and height above the lawn, m. */
  edgeWidthM: 0.07,
  edgeHeightM: 0.035,
  wallThicknessM: 0.25,
} as const;

export interface SiteMaterials {
  gravel: THREE.Material;
  soil: THREE.Material;
  mulch: THREE.Material;
  edging: THREE.Material;
  /** Walls and buildings a site declares. */
  massing: THREE.Material;
  trunk: THREE.Material;
  /** Tree crowns; made more or less solid with the season, so it has to be a material that can fade. */
  crown: THREE.MeshStandardMaterial;
}

export interface BuiltSite {
  group: THREE.Group;
  /** Show deciduous trees in leaf or bare for a month of the year (1 to 12). Returns true when anything changed. */
  setMonth(month: number): boolean;
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

function block(sizeX: number, sizeY: number, sizeZ: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function buildSite(bower: Bower, feet: readonly Foot[], mats: SiteMaterials, site: Site | undefined = bower.site): BuiltSite {
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
    const run = SITE.walkRunout * Math.max(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const sx = alongZ ? x1 - x0 : x1 - x0 + 2 * run;
    const sz = alongZ ? z1 - z0 + 2 * run : z1 - z0;
    const walk = slab(sx, sz, cx, cz, 0.006, mats.gravel);
    walk.name = `walk:${zone.id}`;
    group.add(walk);
    // a stone edge along each side of the walk keeps the gravel from the grass
    for (const side of [-1, 1]) {
      const edge = alongZ
        ? block(SITE.edgeWidthM, SITE.edgeHeightM, sz, cx + side * (sx / 2 + SITE.edgeWidthM / 2), SITE.edgeHeightM / 2, cz, mats.edging)
        : block(sx, SITE.edgeHeightM, SITE.edgeWidthM, cx, SITE.edgeHeightM / 2, cz + side * (sz / 2 + SITE.edgeWidthM / 2), mats.edging);
      edge.name = 'walk edge';
      group.add(edge);
    }

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
      const bed = alongZ ? slab(SITE.bedWidthM, a1 - a0, mean, (a0 + a1) / 2, 0.004, mats.soil) : slab(a1 - a0, SITE.bedWidthM, (a0 + a1) / 2, mean, 0.004, mats.soil);
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
    pit.position.set(p.x, 0.005, p.z);
    pit.receiveShadow = true;
    pit.name = `pit:${station.id}`;
    const uv = pit.geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * SITE.pitRadiusM, uv.getY(i) * 2 * SITE.pitRadiusM);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(SITE.pitRadiusM * 0.72, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.mulch);
    mound.scale.y = 0.14;
    mound.position.set(p.x, 0.004, p.z);
    mound.receiveShadow = true;
    mound.castShadow = true;
    group.add(pit, mound);
  }

  // ---- what the site declares stands beside the Bower ------------------------------
  const deciduous: THREE.Mesh[] = [];
  const crownBare = mats.crown.clone();
  crownBare.opacity = 0.22;
  crownBare.depthWrite = false;
  const crownLeaf = mats.crown.clone();
  crownLeaf.transparent = false;
  for (const o of site?.obstructions ?? []) {
    if (o.kind === 'wall') {
      const dx = o.to[0] - o.from[0];
      const dy = o.to[1] - o.from[1];
      const wall = block(Math.hypot(dx, dy), o.heightM, SITE.wallThicknessM, (o.from[0] + o.to[0]) / 2, o.heightM / 2, -(o.from[1] + o.to[1]) / 2, mats.massing);
      wall.rotation.y = Math.atan2(dy, dx);
      wall.name = `wall:${o.id}`;
      group.add(wall);
    } else if (o.kind === 'building') {
      // the footprint, drawn in the ground plane and raised
      const shape = new THREE.Shape(o.footprint.map(([x, y]) => new THREE.Vector2(x, y)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: o.heightM, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      const building = new THREE.Mesh(geometry, mats.massing);
      building.castShadow = building.receiveShadow = true;
      building.name = `building:${o.id}`;
      group.add(building);
    } else {
      const stem = o.clearStemM ?? o.heightM / 3;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * o.heightM * 0.6, 0.035 * o.heightM, o.heightM * 0.8, 10), mats.trunk);
      trunk.position.set(o.at[0], o.heightM * 0.4, -o.at[1]);
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), crownLeaf);
      crown.scale.set(o.crownRadiusM, (o.heightM - stem) / 2, o.crownRadiusM);
      crown.position.set(o.at[0], (stem + o.heightM) / 2, -o.at[1]);
      crown.castShadow = true;
      crown.receiveShadow = true;
      crown.name = `tree:${o.id}`;
      if (o.leafHabit === 'deciduous') deciduous.push(crown);
      group.add(trunk, crown);
    }
  }

  let shownInLeaf: boolean | null = null;
  return {
    group,
    setMonth(month: number): boolean {
      const inLeaf = TREE_IN_LEAF_MONTHS.value!.includes(month);
      if (inLeaf === shownInLeaf || !deciduous.length) return false;
      shownInLeaf = inLeaf;
      for (const crown of deciduous) {
        crown.material = inLeaf ? crownLeaf : crownBare;
        // a bare crown lets about half the sun through: it is drawn thin, and its shadow is left out rather than drawn solid
        crown.castShadow = inLeaf;
      }
      return true;
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      crownBare.dispose();
      crownLeaf.dispose();
    },
  };
}
