import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_STATUS, RENDER_CONTRACT, type RenderAppendage, type RenderData, type RenderFlower, type RenderFruit, appendagePresent, fruitState } from '@horti/core';
import { loadLooks, lookFor } from '../src/plant/registry.ts';
import { PlantView } from '../src/plant/view.ts';
import { camera as makeCamera, materials } from './helpers.ts';

await loadLooks();
const camera = makeCamera();

/** One plant of a taxon with one short upright stem and nothing on it: the test adds what it is about. Starts on 1 January. */
function plantOf(taxonId: string): RenderData {
  return {
    contract: RENDER_CONTRACT,
    scenario: 'view test',
    start: '2030-01-01',
    lastDay: 729,
    frame: 'right-handed, metres, x east, y north, z up',
    plants: [{ id: 'p', taxonId, label: `A ${taxonId}`, stationId: 's', plantedDay: 0, leafHabit: 'deciduous', flowerDisplay: '' }],
    stems: [{ id: 'p/stem', plantId: 'p', parentId: null, role: 'leader', order: 0, contact: [0, 0, 0, 0, 0, 1, 0, 0, 2], away: [0, -1, 0, 0, -1, 0, 0, -1, 0], bornDay: [0, 10, 20], removedDay: [-1, -1, -1], radiusMm: [20, 15, 10] }],
    leaves: [],
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
const flower = (over: Partial<RenderFlower> = {}): RenderFlower => ({ plantId: 'p', stemId: 'p/stem', position: [0, -0.1, 1.5], lengthM: 0.1, year: 2030, developDay: 100, openDay: 120, spentDay: 150, ...over });
const fruit = (over: Partial<RenderFruit> = {}): RenderFruit => ({ plantId: 'p', stemId: 'p/stem', position: [0, -0.1, 1.5], lengthM: 0.12, year: 2030, swell: [150, 200], ripen: [240, 280], removedDay: 400, ...over });
const hold = (over: Partial<RenderAppendage> = {}): RenderAppendage => ({ plantId: 'p', stemId: 'p/stem', kind: 'tendril', position: [0, 0, 1], direction: [0, -1, 0], lengthM: 0.08, holding: true, bornDay: 30, removedDay: 500, ...over });

/** The matrix of the one instance a pool is drawing, after an update. */
function onlyInstance(view: PlantView, key: string): THREE.Matrix4 {
  const drawn = (view.group.getObjectByName(key)?.children ?? []).filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh && c.count > 0);
  expect(drawn.map((m) => m.count), key).toEqual([1]);
  const m = new THREE.Matrix4();
  drawn[0]!.getMatrixAt(0, m);
  return m;
}
/** Where a matrix sends a direction of the model, as a unit vector. */
const sends = (m: THREE.Matrix4, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).transformDirection(m);
const near = (v: THREE.Vector3, x: number, y: number, z: number) => {
  expect(v.x).toBeCloseTo(x, 5);
  expect(v.y).toBeCloseTo(y, 5);
  expect(v.z).toBeCloseTo(z, 5);
};

// render/contract.ts, RenderFruit; render/presence.ts: "a picture and a number computed from the same run agree".
describe('fruit', () => {
  it('is drawn from the render data with the fruit model of its taxon, on exactly the days the core says it is on the plant', () => {
    const data = plantOf('wisteria-sinensis');
    data.fruits.push(fruit(), fruit({ position: [0.2, -0.1, 1.2], removedDay: -1 }), fruit({ swell: [520, 560], ripen: [600, 640], removedDay: 700, year: 2031 }));
    const view = new PlantView(data, materials());
    expect(view.withoutFruit).toEqual([]);
    expect(view.group.getObjectByName(lookFor('wisteria-sinensis').fruits!.default.key)).toBeDefined();
    for (const day of [0, 149, 150, 175, 260, 399, 400, 519, 520, 640, 700, 729]) {
      view.update(camera, day, 1);
      expect(view.stats().fruit, `day ${day}`).toBe(data.fruits.filter((f) => fruitState(f, day).phase !== 'absent').length);
    }
    view.dispose();
  });

  it('is left out, and said to be, where the taxon has no fruit model', () => {
    // a taxon the viewer has no module for is drawn with the stand-in, which has no fruit
    const data = plantOf('a-taxon-without-a-look');
    data.fruits.push(fruit());
    const view = new PlantView(data, materials());
    expect(view.withoutFruit).toEqual(['A a-taxon-without-a-look']);
    view.update(camera, 300, 1);
    expect(view.stats().fruit).toBe(0);
    view.dispose();
  });
});

// render/contract.ts, RenderAppendage: "a viewer draws them and adds none of its own".
describe('what a plant holds on with', () => {
  it('is drawn from the day it formed to the day it went, with the model its taxon has for that kind', () => {
    const data = plantOf('vitis-coignetiae');
    data.appendages.push(hold(), hold({ position: [0, 0, 1.6], holding: false, bornDay: 200, removedDay: -1 }), hold({ bornDay: 600, removedDay: 650 }));
    const view = new PlantView(data, materials());
    expect(view.withoutAppendages).toEqual([]);
    for (const day of [0, 29, 30, 199, 200, 499, 500, 600, 649, 650, 729]) {
      view.update(camera, day, 1);
      expect(view.stats().appendages, `day ${day}`).toBe(data.appendages.filter((a) => appendagePresent(a, day)).length);
    }
    view.dispose();
  });

  it('reaches along the direction the data gives, as long as the data says', () => {
    const data = plantOf('vitis-coignetiae');
    // towards the east, in the core's frame: +x in three.js too
    data.appendages.push(hold({ direction: [1, 0, 0], lengthM: 0.07 }));
    const view = new PlantView(data, materials());
    view.update(camera, 100, 1);
    const m = onlyInstance(view, lookFor('vitis-coignetiae').appendages.tendril!.key);
    near(sends(m, 0, 0, 1), 1, 0, 0);
    // one unit of the model is the length in the data
    expect(new THREE.Vector3(0, 0, 1).applyMatrix4(m).distanceTo(new THREE.Vector3().applyMatrix4(m))).toBeCloseTo(0.07, 6);
    view.dispose();
  });

  it('is left out, and said to be, where the taxon has no model for that kind', () => {
    const data = plantOf('wisteria-sinensis');
    data.appendages.push(hold({ kind: 'prickle' }), hold({ kind: 'aerial_roots' }));
    const view = new PlantView(data, materials());
    expect(view.withoutAppendages).toEqual(['A wisteria-sinensis (prickle, aerial roots)']);
    view.update(camera, 100, 1);
    expect(view.stats().appendages).toBe(0);
    view.dispose();
  });
});

// render/contract.ts, RenderFlower.direction: "Absent: it hangs, as a wisteria raceme does. A flower that faces out
// from its node or stands above its shoot says so here." look.ts, Poise.
describe('the direction a flower is held in', () => {
  const day = 130;

  it('leaves a model as it was authored where the data gives no direction: one that hangs, hanging; one that is held, standing', () => {
    for (const [taxonId, y] of [
      ['wisteria-sinensis', -1],
      ['rosa-the-generous-gardener', 1],
    ] as const) {
      const data = plantOf(taxonId);
      data.flowers.push(flower());
      const view = new PlantView(data, materials());
      view.update(camera, day, 1);
      const asset = lookFor(taxonId).flowers!.default;
      // the axis the model was authored along (-Y for one that hangs, +Y for one that is held) stays plumb
      near(sends(onlyInstance(view, asset.key), 0, asset.poise === 'hangs' ? -1 : 1, 0), 0, y, 0);
      view.dispose();
    }
  });

  it('turns a held flower on to the direction the data gives, with the side the model calls +Z towards the sky', () => {
    const data = plantOf('rosa-the-generous-gardener');
    // out to the south, level: -y in the core's frame is +z in three.js
    data.flowers.push(flower({ direction: [0, -1, 0] }));
    const view = new PlantView(data, materials());
    view.update(camera, day, 1);
    const m = onlyInstance(view, lookFor('rosa-the-generous-gardener').flowers!.default.key);
    near(sends(m, 0, 1, 0), 0, 0, 1);
    near(sends(m, 0, 0, 1), 0, 1, 0);
    view.dispose();
  });

  it('turns a hanging inflorescence so that it runs along the direction the data gives', () => {
    const data = plantOf('wisteria-sinensis');
    // held out to the east and a little down
    const d = new THREE.Vector3(1, -0.5, 0).normalize();
    data.flowers.push(flower({ direction: [d.x, -d.z, d.y] }));
    const view = new PlantView(data, materials());
    view.update(camera, day, 1);
    const m = onlyInstance(view, lookFor('wisteria-sinensis').flowers!.default.key);
    near(sends(m, 0, -1, 0), d.x, d.y, d.z);
    // and its +Z is on the upper side
    expect(sends(m, 0, 0, 1).y).toBeGreaterThan(0);
    view.dispose();
  });

  it('draws a flower whose direction is plumb exactly as one with none', () => {
    const plain = plantOf('wisteria-sinensis');
    plain.flowers.push(flower());
    const plumb = plantOf('wisteria-sinensis');
    plumb.flowers.push(flower({ direction: [0, 0, -1] }));
    const key = lookFor('wisteria-sinensis').flowers!.default.key;
    const a = new PlantView(plain, materials());
    const b = new PlantView(plumb, materials());
    a.update(camera, day, 1);
    b.update(camera, day, 1);
    expect(onlyInstance(b, key).elements).toEqual(onlyInstance(a, key).elements);
    a.dispose();
    b.dispose();
  });
});

// render/contract.ts, RenderLeaf.form: "The names are the taxon's own, listed in its growth model. Absent: its ordinary leaf."
describe('a form the data names', () => {
  it('is drawn in the ordinary form, and said to be, where the look has no model of it', () => {
    const data = plantOf('hedera-helix');
    data.leaves.push({ plantId: 'p', stemId: 'p/stem', position: [0, 0, 1], direction: [0, -1, 0], lengthM: 0.08, firstYear: 2030, lastYear: null, evergreen: true, bornDay: 50, removedDay: -1, form: 'no-such-form' });
    data.leaves.push({ plantId: 'p', stemId: 'p/stem', position: [0, 0, 1.5], direction: [0, -1, 0], lengthM: 0.08, firstYear: 2030, lastYear: null, evergreen: true, bornDay: 50, removedDay: -1 });
    const view = new PlantView(data, materials());
    expect(view.unknownForms).toEqual(['A hedera-helix: leaf form "no-such-form"']);
    view.update(camera, 300, 1);
    expect(view.stats().leaves).toBe(2);
    view.dispose();
  });
});
