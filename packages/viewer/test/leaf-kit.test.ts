import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_STATUS, RENDER_CONTRACT, type RenderData, type RenderLeaf } from '@horti/core';
import { bladeFrame, bladeTurn } from '../src/plant/hold.ts';
import { type PalmateVeins, palmateVeins, veinUv } from '../src/plant/kit.ts';
import type { BladeHold, LeafAsset, LeafTexture } from '../src/plant/look.ts';
import { loadLooks, lookFor } from '../src/plant/registry.ts';
import { PlantView, makePlantMaterials } from '../src/plant/view.ts';
import type { TexturePair } from '../src/textures.ts';
import { camera as makeCamera, materials } from './helpers.ts';

await loadLooks();
const camera = makeCamera();
const V3 = THREE.Vector3;

const SPEC: PalmateVeins = {
  origin: 0.3,
  span: 1.6,
  main: [
    { deg: -110, length: 0.4 },
    { deg: -55, length: 0.7 },
    { deg: 0, length: 0.95 },
    { deg: 55, length: 0.7 },
    { deg: 110, length: 0.4 },
    { deg: 130, length: 0.3, from: { vein: 4, at: 0.2 } },
  ],
  secondary: { angle: 45, spacing: 0.12, first: 0.08, reach: 0.3, curve: 20 },
  net: { cell: 0.05, jitter: 0.8 },
  width: { main: 0.03, secondary: 0.01, net: 0.005 },
  ground: 0.75,
  pale: { main: 0.2, secondary: 0.15, net: 0.05 },
  tint: { main: 0.8, secondary: 0.6, net: 0.3 },
  relief: { vein: 0.5, pucker: 0.5 },
  seed: 3,
};

// TAXON_LOOKS.md section 3, the kit: a palmate vein generator a taxon module calls with its own numbers.
describe('the palmate vein generator', () => {
  const lines = palmateVeins(SPEC);

  it('draws the stated number of main veins, all from the one point where they meet, and the branches as branches', () => {
    const mains = lines.filter((l) => l.kind === 'main');
    expect(mains).toHaveLength(SPEC.main.filter((m) => !m.from).length);
    for (const m of mains) {
      expect(m.points[0]![0]).toBeCloseTo(0.5, 9);
      expect(m.points[0]![1]).toBeCloseTo(SPEC.origin, 9);
    }
    expect(lines.filter((l) => l.kind === 'branch')).toHaveLength(1);
    // each main vein runs out at its bearing and to its length
    for (const [i, m] of mains.entries()) {
      const end = m.points[m.points.length - 1]!;
      const deg = (Math.atan2(end[0] - 0.5, end[1] - SPEC.origin) * 180) / Math.PI;
      expect(Math.abs(deg - SPEC.main[i]!.deg)).toBeLessThan(1);
      expect(Math.hypot(end[0] - 0.5, end[1] - SPEC.origin) * SPEC.span).toBeCloseTo(SPEC.main[i]!.length, 2);
    }
  });

  it('gives every main vein secondaries on both sides, each staying in the ground of its own vein, and gives the same plan every time', () => {
    const secondaries = lines.filter((l) => l.kind === 'secondary');
    expect(secondaries.length).toBeGreaterThan(SPEC.main.length * 4);
    for (const s of secondaries) {
      for (const p of s.points) {
        expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
        // no further round than half way to the outermost vein's neighbour beyond it
        expect(Math.abs((Math.atan2(p[0] - 0.5, p[1] - SPEC.origin) * 180) / Math.PI)).toBeLessThanOrEqual(130 + 60 + 1e-6);
      }
      // tapering
      expect(s.widths[s.widths.length - 1]!).toBeLessThan(s.widths[0]!);
    }
    expect(palmateVeins(SPEC)).toEqual(lines);
  });

  it('lays the flat blade on the texture so that a leaf whose veins stand at other bearings has each vein on its line', () => {
    // the uv convention (LeafTexture): u = 0.5 + x / span, v = origin + z / span
    expect(veinUv(SPEC, 0, 0)).toEqual([0.5, SPEC.origin]);
    const [u, v] = veinUv(SPEC, 0.16, 0.8);
    expect(u).toBeCloseTo(0.6, 9);
    expect(v).toBeCloseTo(SPEC.origin + 0.5, 9);
    // a leaf whose side veins stand at 62 degrees, not 55
    const own = [-118, -62, 0, 62, 118, 140];
    const a = 62 * (Math.PI / 180);
    const [su, sv] = veinUv(SPEC, 0.5 * Math.sin(a), 0.5 * Math.cos(a), own);
    expect((Math.atan2(su - 0.5, sv - SPEC.origin) * 180) / Math.PI).toBeCloseTo(55, 6);
    // and the distance from the meeting point is kept
    expect(Math.hypot(su - 0.5, sv - SPEC.origin) * SPEC.span).toBeCloseTo(0.5, 9);
  });
});

// look.ts, BladeHold: "its upper face to the open side ... and its tip as low as it can go with its face turned so".
describe('the hold of a blade', () => {
  const hold: BladeHold = { unitAt: 60, rise: [20, 20], riseOpen: [60, 60], turn: 0 };
  const UP = new V3(0, 1, 0);
  const out = new V3(0, 0, 1);

  it('hangs a blade tip down with its face out from an upright support, whichever way the stalk points', () => {
    for (const stalk of [new V3(0, 1, 0), new V3(1, 0, 0), new V3(0, 0, 1), new V3(0, -1, 0), new V3(0.6, 0.6, 0.53).normalize()]) {
      const f = bladeFrame(stalk, out, hold, 0.5, 0.5, 0.5);
      // the face looks out from the support, 20 degrees above level
      // (leaning a little the way the stalk points along the support)
      expect(f.y.dot(out)).toBeGreaterThan(0.8);
      expect(f.y.dot(UP)).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 6);
      // the tip points down, and not into the support
      expect(f.z.y).toBeLessThan(-0.8);
      expect(f.z.dot(out)).toBeGreaterThan(-1e-6);
      // a right-handed frame
      expect(new V3().crossVectors(f.y, f.z).dot(f.x)).toBeCloseTo(1, 6);
    }
  });

  it('turns the face to the sky on top of a support, and holds it flatter on a shoot out in the open', () => {
    const top = bladeFrame(new V3(1, 0, 0), UP, hold, 0.5, 0.5, 0.5);
    expect(top.y.y).toBeGreaterThan(0.99);
    const open = bladeFrame(new V3(1, 0, 0), new V3(), hold, 0.5, 0.5, 0.5);
    expect((Math.asin(open.y.y) * 180) / Math.PI).toBeCloseTo(60, 3);
    // out the way the stalk points
    expect(open.y.x).toBeGreaterThan(0.4);
  });

  it('is written in the leaf\'s own frame, so that the instance turned by it holds the blade as the frame says', () => {
    const instance = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3, 1.1, -0.4)).scale(new V3(0.07, 0.07, 0.07));
    const f = bladeFrame(new V3(1, 0.2, 0).normalize(), out, hold, 0.2, 0.7, 0.1);
    const q = bladeTurn(instance, f);
    const tip = new V3(0, 0, 1).applyQuaternion(q).transformDirection(instance);
    const face = new V3(0, 1, 0).applyQuaternion(q).transformDirection(instance);
    expect(tip.distanceTo(f.z)).toBeLessThan(1e-6);
    expect(face.distanceTo(f.y)).toBeLessThan(1e-6);
  });
});

/** One plant of a taxon with one upright stem against a support to its south, and one leaf on it, level, to the east. */
function oneLeaf(taxonId: string, over: Partial<RenderLeaf> = {}): RenderData {
  return {
    contract: RENDER_CONTRACT,
    scenario: 'leaf kit test',
    start: '2030-01-01',
    lastDay: 729,
    frame: 'right-handed, metres, x east, y north, z up',
    plants: [{ id: 'p', taxonId, label: `A ${taxonId}`, stationId: 's', plantedDay: 0, leafHabit: 'deciduous', flowerDisplay: '' }],
    stems: [{ id: 'p/stem', plantId: 'p', parentId: null, role: 'leader', order: 0, contact: [0, 0, 0, 0, 0, 1, 0, 0, 2], away: [0, 1, 0, 0, 1, 0, 0, 1, 0], bornDay: [0, 10, 20], removedDay: [-1, -1, -1], radiusMm: [20, 15, 10] }],
    leaves: [{ plantId: 'p', stemId: 'p/stem', position: [0, 0, 1], direction: [1, 0, 0], lengthM: 0.1, firstYear: 2030, lastYear: null, evergreen: true, bornDay: 50, removedDay: -1, ...over }],
    flowers: [],
    fruits: [],
    appendages: [],
    seasons: [
      { plantId: 'p', year: 2030, budburstDay: 90, growthEndDay: 270, leafFlush: [100, 140], autumnColour: [280, 310], leafFall: [310, 340] },
      { plantId: 'p', year: 2031, budburstDay: 455, growthEndDay: 635, leafFlush: [465, 505], autumnColour: [645, 675], leafFall: [675, 705] },
    ],
    events: [],
    thickening: { tipRadiusMm: 2, exponent: 1 },
    statement: 'test',
    assumptions: Object.fromEntries(EVIDENCE_STATUS.map((status) => [status, 0])) as RenderData['assumptions'],
  };
}

/** The one leaf instance a view draws: its matrix and its blade turn. */
function drawnLeaf(view: PlantView, key: string): { m: THREE.Matrix4; q: THREE.Quaternion } {
  const meshes = (view.group.getObjectByName(key)?.children ?? []).filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.count > 0);
  expect(meshes).toHaveLength(1);
  const m = new THREE.Matrix4();
  meshes[0]!.getMatrixAt(0, m);
  const b = meshes[0]!.geometry.getAttribute('aBlade');
  return { m, q: new THREE.Quaternion(b.getX(0), b.getY(0), b.getZ(0), b.getW(0)) };
}

// look.ts, LeafAsset.hold: "Left out: the whole leaf is turned with its stalk, as authored".
describe('a leaf in the viewer', () => {
  it('without a hold is drawn exactly as authored: its blade is not turned', () => {
    const asset = lookFor('wisteria-sinensis').leaves.default;
    expect(asset.hold).toBeUndefined();
    const view = new PlantView(oneLeaf('wisteria-sinensis'), materials());
    view.update(camera, 300, 1);
    expect(drawnLeaf(view, asset.key).q.toArray()).toEqual([0, 0, 0, 1]);
    view.dispose();
  });

  it('with a hold keeps its stalk on the direction the data gives, and hangs its blade tip down, face out from the support', () => {
    for (const taxonId of ['hedera-helix', 'vitis-coignetiae']) {
      for (const direction of [[1, 0, 0], [0, 0, 1], [0, -1, 0.3], [0.2, 0, -1]] as const) {
        const asset = lookFor(taxonId).leaves.default;
        const view = new PlantView(oneLeaf(taxonId, { direction: [...direction] }), materials());
        view.update(camera, 300, 1);
        const { m, q } = drawnLeaf(view, asset.key);
        // the stalk: the model's +Z, on to the data's direction (core frame to three.js: x, z, -y)
        const stalk = new V3(0, 0, 1).transformDirection(m);
        const d = new V3(direction[0], direction[2], -direction[1]).normalize();
        expect(stalk.distanceTo(d), `${taxonId} ${direction.join(',')}`).toBeLessThan(1e-6);
        // the blade: tip below level, face out from the support (the support is to the south: the way out is north, -z in three.js)
        const tip = new V3(0, 0, 1).applyQuaternion(q).transformDirection(m);
        const face = new V3(0, 1, 0).applyQuaternion(q).transformDirection(m);
        expect(tip.y, `${taxonId} ${direction.join(',')}`).toBeLessThan(-0.3);
        expect(face.z, `${taxonId} ${direction.join(',')}`).toBeLessThan(-0.3);
        expect(face.y).toBeGreaterThan(0);
        view.dispose();
      }
    }
  });
});

// look.ts, FruitAsset.stalkKeepsColour: "the parts tagged as axis ... keep their unripe colours as the fruit ripens".
describe('the stalk of a fruit', () => {
  it('is axis in the vine\'s bunch, which keeps its colour, and the berries are what ripens; a fruit that does not say so ripens whole, as before', () => {
    const bunch = lookFor('vitis-coignetiae').fruits!.default;
    expect(bunch.stalkKeepsColour).toBe(true);
    const part = bunch.make(1, 0).getAttribute('aPart');
    let axis = 0;
    let berries = 0;
    for (let i = 0; i < part.count; i++) if (part.getW(i) < -0.5) axis++;
    else berries++;
    expect(axis).toBeGreaterThan(0);
    expect(berries).toBeGreaterThan(axis);
    expect(lookFor('wisteria-sinensis').fruits!.default.stalkKeepsColour).toBeUndefined();
  });
});

// look.ts, LeafAsset.texture: "Left out: the shared, feather-veined one".
describe('the materials of a leaf', () => {
  const shared = new THREE.Texture();
  const made: LeafTexture[] = [];
  const own = (t: LeafTexture): TexturePair => {
    made.push(t);
    return { map: new THREE.Texture() as THREE.CanvasTexture, bump: new THREE.Texture() as THREE.CanvasTexture };
  };
  const mats = makePlantMaterials({ bark: () => ({ map: new THREE.Texture() as THREE.CanvasTexture, bump: new THREE.Texture() as THREE.CanvasTexture }), leafTex: shared, ownLeafTex: own });
  const mapOf = (asset: LeafAsset) => mats.leaf(asset).map((m) => (m as THREE.MeshStandardMaterial).map);

  it('are drawn with the shared texture where the look gives no texture of its own, as before', () => {
    const wisteria = lookFor('wisteria-sinensis').leaves.default;
    expect(wisteria.texture).toBeUndefined();
    expect(mapOf(wisteria)).toEqual([shared, shared, shared]);
    expect((mats.leaf(wisteria)[0] as THREE.MeshStandardMaterial).bumpMap).toBe(shared);
    expect((mats.leaf(wisteria)[0] as THREE.MeshStandardMaterial).bumpScale).toBe(1.2);
    expect(made).toHaveLength(0);
  });

  it('are drawn with its own texture where it has one, made once, at the same number of materials', () => {
    for (const taxonId of ['hedera-helix', 'vitis-coignetiae']) {
      const asset = lookFor(taxonId).leaves.default;
      expect(asset.texture).toBeDefined();
      const maps = mapOf(asset);
      expect(maps).toHaveLength(3);
      for (const map of maps) expect(map).not.toBe(shared);
      expect((mats.leaf(asset)[0] as THREE.MeshStandardMaterial).bumpScale).toBe(asset.texture!.relief);
    }
    // once for each asset, however often its materials are asked for
    mats.leaf(lookFor('hedera-helix').leaves.default);
    expect(made).toHaveLength(2);
  });

  it('give the leaf\'s own texture uv inside the texture, at every level of detail', () => {
    for (const taxonId of ['hedera-helix', 'vitis-coignetiae']) {
      const asset = lookFor(taxonId).leaves.default;
      for (let v = 0; v < asset.variants; v++) {
        for (let lod = 0; lod < asset.lods; lod++) {
          const uv = asset.make(v, lod).getAttribute('uv');
          for (let i = 0; i < uv.count; i++) {
            expect(uv.getX(i)).toBeGreaterThanOrEqual(0);
            expect(uv.getX(i)).toBeLessThanOrEqual(1);
            expect(uv.getY(i)).toBeGreaterThanOrEqual(0);
            expect(uv.getY(i)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
