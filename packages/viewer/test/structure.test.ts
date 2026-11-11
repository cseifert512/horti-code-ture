import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeHemisphereBower, makeVaultBower, vaultNormal } from '@horti/core';
import { buildStructure } from '../src/structure/build.ts';
import { bowerFrames, toThree } from '../src/structure/frames.ts';

const materials = () => ({
  glulam: new THREE.MeshBasicMaterial(),
  larch: new THREE.MeshBasicMaterial(),
  steel: new THREE.MeshBasicMaterial(),
  stone: new THREE.MeshBasicMaterial(),
});

// CLAUDE.md, conventions: three.js (x, y, z) = core (x, z, -y).
describe('frame conversion', () => {
  it('maps core east, north, up on to three.js x, -z, y', () => {
    expect(toThree({ x: 1, y: 2, z: 3 }).toArray()).toEqual([1, 3, -2]);
  });
});

// KEY.md section 5: the timber is the growing surface. A plant route lies on the
// outer face of the member that hosts it, so that face must be drawn where the route is.
describe('section orientation of timber members', () => {
  it('turns every member of the hemisphere to face outwards, from the routes it hosts', () => {
    const dome = makeHemisphereBower();
    const frames = bowerFrames(dome);
    for (const m of dome.members) {
      const f = frames.get(m.id)!;
      expect(f.source).toBe('hosted_routes');
      for (let i = 0; i < f.C.length; i += 7) {
        // the depth axis is radial: the shell's centre is the origin
        const radial = f.C[i]!.clone().normalize();
        expect(f.N[i]!.dot(radial)).toBeGreaterThan(0.999);
        expect(Math.abs(f.N[i]!.dot(f.B[i]!))).toBeLessThan(1e-6);
      }
    }
  });

  it('orients the lattice of the vault from its routes, and the ribs from the routes and lattice they carry', () => {
    const vault = makeVaultBower();
    const built = buildStructure(vault, materials());
    expect(built.frameSources).toEqual({ hosted_routes: vault.members.length - 5, neighbours: 5, own_plane: 0, outward: 0 });
    // a rib's depth axis follows the surface normal the core built it from, to within 2.5 degrees
    // (unhelped, an end rib would lean 12 degrees away from the lattice that sits on it)
    let worst = 1;
    for (let r = 0; r < 5; r++) {
      const f = built.frames.get(`rib.${r}`)!;
      const v = r / 4;
      for (let i = 2; i <= 108; i++) worst = Math.min(worst, f.N[i]!.dot(toThree(vaultNormal(i / 110, v))));
    }
    expect(worst).toBeGreaterThan(Math.cos((2.5 * Math.PI) / 180));
    built.dispose();
  });

  it('falls back to the plane of the arch for a rib that nothing rides on', () => {
    const vault = makeVaultBower();
    const rib = vault.members.find((m) => m.id === 'rib.2')!;
    const alone = bowerFrames({ ...vault, members: [rib], graph: Object.assign(Object.create(Object.getPrototypeOf(vault.graph)), vault.graph, { edges: new Map() }) });
    const f = alone.get('rib.2')!;
    expect(f.source).toBe('own_plane');
    // the middle rib lies in a plane across the vault: its width axis runs along the vault (three.js z)
    for (let i = 0; i < f.B.length; i += 10) expect(Math.abs(f.B[i]!.z)).toBeGreaterThan(0.999);
    // and its depth axis points outwards
    expect(f.N[55]!.y).toBeGreaterThan(0.99);
  });
});

describe('structure meshes', () => {
  for (const [name, bower, feet] of [
    ['vault', makeVaultBower(), 10],
    ['hemisphere', makeHemisphereBower(), 12],
  ] as const) {
    it(`${name}: a stone pad under each foot of the primary members, and finite geometry`, () => {
      const built = buildStructure(bower, materials());
      expect(built.feet).toHaveLength(feet);
      for (const foot of built.feet) expect(foot.position.y).toBe(0);
      built.group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const pos = o.geometry.getAttribute('position');
        for (let i = 0; i < pos.array.length; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
      });
      expect(built.bounds.max.y).toBeGreaterThan(3);
      built.dispose();
    });

    // KEY.md section 5: steel appears only as slender cables. Nothing else in the scene is steel.
    it(`${name}: the only steel drawn is the Bower's cables`, () => {
      const mats = materials();
      const built = buildStructure(bower, mats);
      const steel: THREE.InstancedMesh[] = [];
      built.group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material === mats.steel) steel.push(o as THREE.InstancedMesh);
      });
      const runs = bower.supports.filter((s) => s.kind === 'cable').reduce((n, s) => n + s.curve.points.length - 1, 0);
      expect(steel).toHaveLength(1);
      expect(steel[0]!.count).toBe(runs);
      // and each is as thin as the Bower says
      const m = new THREE.Matrix4();
      const scale = new THREE.Vector3();
      steel[0]!.getMatrixAt(0, m);
      m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      expect(scale.x).toBeCloseTo(bower.supports[0]!.diameterMm / 2000, 6);
      built.dispose();
    });
  }
});
