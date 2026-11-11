import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE, exposureField, makeHemisphereBower, readBower, sunAt } from '@horti/core';
import { ExposureOverlay, LIGHT_RAMP } from '../src/overlay/exposure.ts';
import { type SiteMaterials, buildSite } from '../src/scene/site.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));

// "Visuals are proof": what the overlay shows is the core's exposure field and nothing of the viewer's own.
describe('light on the structure, as the viewer draws it', () => {
  const bower = makeHemisphereBower({ stations: 12 });
  const field = exposureField(bower, DEFAULT_SITE);

  it('lays a tube along every stretch of every route and a disc at every station', () => {
    const overlay = new ExposureOverlay();
    overlay.setField(bower, field);
    const [tubes, discs] = overlay.group.children as THREE.InstancedMesh[];
    let segments = 0;
    for (const e of bower.graph.edges.values()) segments += e.curve.points.length - 1;
    expect(tubes!.count).toBe(segments);
    expect(discs!.count).toBe(bower.rootStations.length);
    overlay.dispose();
  });

  it('reports the scale it drew with: the whole range by default, the structure\'s own when asked to spread', () => {
    const overlay = new ExposureOverlay();
    overlay.setField(bower, field);
    const june = overlay.show('hours', 5, false)!;
    expect(june.low).toBe(0);
    expect(june.high).toBeCloseTo(field.possibleHours[5]!, 6);
    expect(june.least).toBeGreaterThan(6);
    expect(june.most).toBeLessThanOrEqual(june.high + 1e-6);
    const spread = overlay.show('hours', 5, true)!;
    expect(spread.low).toBe(june.least);
    expect(spread.high).toBe(june.most);
    const share = overlay.show('share', 'year', false)!;
    expect(share.high).toBe(1);
    expect(share.most).toBeLessThanOrEqual(1);
    overlay.dispose();
  });

  it('uses the ramp the scale beside it is painted with', () => {
    const html = readFileSync(`${root}packages/viewer/index.html`, 'utf8');
    for (const colour of LIGHT_RAMP) expect(html, colour).toContain(colour);
  });
});

describe('the sun in the viewer\'s frame', () => {
  it('is the core\'s sun with y and z changed over: three.js (x, y, z) = core (x, z, -y)', () => {
    const s = sunAt(DEFAULT_SITE, 172, 12);
    const three = new THREE.Vector3(s.direction.x, s.direction.z, -s.direction.y);
    // at midsummer noon the sun is high and to the south: +y up, +z south in three.js
    expect(three.y).toBeGreaterThan(0.85);
    expect(three.z).toBeGreaterThan(0.4);
    expect(three.length()).toBeCloseTo(1, 9);
  });
});

// What a site declares is drawn because the light model shades by it.
describe('what a site declares, drawn', () => {
  const mats = (): SiteMaterials => {
    const m = () => new THREE.MeshBasicMaterial();
    return { gravel: m(), soil: m(), mulch: m(), edging: m(), massing: m(), trunk: m(), crown: new THREE.MeshStandardMaterial({ transparent: true }) };
  };
  const yard = readBower(JSON.parse(readFileSync(`${root}examples/arbour-in-a-yard.bower.json`, 'utf8')), 'arbour-in-a-yard.bower.json');

  it('reads the example yard: a wall, a house and a tree on a declared site', () => {
    expect(yard.site.assumed).toBe(false);
    expect(yard.site.obstructions.map((o) => o.kind)).toEqual(['wall', 'building', 'tree']);
    expect(yard.warnings).toEqual([]);
  });

  it('draws each as massing that casts shadow, and none of it in steel', () => {
    const built = buildSite(yard.bower, [], mats());
    const named = (prefix: string) => built.group.children.filter((c) => c.name.startsWith(prefix)) as THREE.Mesh[];
    expect(named('wall:')).toHaveLength(1);
    expect(named('building:')).toHaveLength(1);
    expect(named('tree:')).toHaveLength(1);
    for (const mesh of [...named('wall:'), ...named('building:')]) expect(mesh.castShadow).toBe(true);
    // the wall stands where the description puts it: 3 m high, 2.2 m south of the origin (three.js z = -north)
    const box = new THREE.Box3().setFromObject(named('wall:')[0]!);
    expect(box.max.y).toBeCloseTo(3, 6);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(2.2, 6);
    built.dispose();
  });

  it('shows a deciduous tree in leaf in June and bare, with no solid shadow, in January', () => {
    const built = buildSite(yard.bower, [], mats());
    const crown = built.group.children.find((c) => c.name === 'tree:apple-tree') as THREE.Mesh;
    expect(built.setMonth(6)).toBe(true);
    expect(crown.castShadow).toBe(true);
    expect(built.setMonth(7)).toBe(false);
    expect(built.setMonth(1)).toBe(true);
    expect(crown.castShadow).toBe(false);
    expect((crown.material as THREE.MeshStandardMaterial).opacity).toBeLessThan(0.5);
    built.dispose();
  });
});
