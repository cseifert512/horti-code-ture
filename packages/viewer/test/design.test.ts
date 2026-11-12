import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import domeBower from '../../../examples/hemisphere-15m.bower.json?raw';
import domePlanting from '../../../examples/hemisphere-15m.planting.json?raw';
import { ARBOUR_EXAMPLE, DesignDesk, type DesignFile, openDesign } from '../src/design/open.ts';
import { growDesign } from '../src/plant/scenario.ts';
import { buildStructure } from '../src/structure/build.ts';
import { toThree } from '../src/structure/frames.ts';

const materials = () => ({
  glulam: new THREE.MeshBasicMaterial(),
  larch: new THREE.MeshBasicMaterial(),
  steel: new THREE.MeshBasicMaterial(),
  stone: new THREE.MeshBasicMaterial(),
});
const opened = (files: readonly DesignFile[]) => {
  const r = openDesign(files);
  if (!r.ok) throw new Error(r.error);
  return r.design;
};
const arbourFile = ARBOUR_EXAMPLE[0]!;
const plantingFile = ARBOUR_EXAMPLE[1]!;
/** The arbour description with something changed. */
const arbourWith = (change: (d: Record<string, unknown>) => void, name = 'changed.bower.json'): DesignFile => {
  const d = JSON.parse(arbourFile.text) as Record<string, unknown>;
  change(d);
  return { name, text: JSON.stringify(d) };
};

// DEVELOPMENT_GUIDE.md stage 5, "Input Bower shell": a designed structure is
// read from a file of centre lines and drawn from its members and cables alone.
describe('a design read from files', () => {
  const design = opened(ARBOUR_EXAMPLE);

  it('reads the arbour: its structure, its planting plan and where a visitor stands', () => {
    expect(design.bower.members).toHaveLength(11);
    expect(design.bower.supports.filter((s) => s.kind === 'cable')).toHaveLength(3);
    expect(design.plan?.plants).toHaveLength(4);
    expect(design.viewpoints.length).toBeGreaterThan(0);
    expect(design.files).toEqual({ bower: 'arbour.bower.json', planting: 'arbour.planting.json' });
  });

  it('tells the two files apart by what is in them, not by name or order', () => {
    const swapped = opened([
      { name: 'b.json', text: plantingFile.text },
      { name: 'a.json', text: arbourFile.text },
    ]);
    expect(swapped.files).toEqual({ bower: 'a.json', planting: 'b.json' });
  });

  it('draws the arbour with every member and every cable present, and nothing else in steel', () => {
    const mats = materials();
    const built = buildStructure(design.bower, mats);
    expect([...built.drawn.members].sort()).toEqual(design.bower.members.map((m) => m.id).sort());
    expect([...built.drawn.cables].sort()).toEqual(design.bower.supports.map((s) => s.id).sort());
    const steel: THREE.InstancedMesh[] = [];
    built.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const pos = o.geometry.getAttribute('position');
        expect(Array.prototype.every.call(pos.array, Number.isFinite), 'every position is a finite number').toBe(true);
        if (o.material === mats.steel) steel.push(o as THREE.InstancedMesh);
      }
    });
    expect(steel).toHaveLength(1);
    expect(steel[0]!.count).toBe(design.bower.supports.reduce((n, s) => n + s.curve.points.length - 1, 0));
    // a cable is drawn at its true thickness: 4 mm across
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    steel[0]!.getMatrixAt(0, m);
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.x).toBeCloseTo(0.002, 6);
    // four posts stand on the ground, each on a pad
    expect(built.feet).toHaveLength(4);
    built.dispose();
  });

  it('is framed by its own size: about four metres across, not fifteen', () => {
    const built = buildStructure(design.bower, materials());
    const size = built.bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(3.9);
    expect(size.x).toBeLessThan(4.6);
    expect(size.y).toBeGreaterThan(2.5);
    expect(size.y).toBeLessThan(3);
    built.dispose();
  });

  // bower/description.ts: "A stem tied along an imported member lies on its upper face."
  it('turns every section so that its upper face is where the core lays a stem', () => {
    const built = buildStructure(design.bower, materials());
    expect(built.frameSources).toEqual({ hosted_routes: 0, neighbours: 0, own_plane: 0, upright: design.bower.members.length });
    for (const id of ['beam.s', 'rafter.2']) for (const n of built.frames.get(id)!.N) expect(n.y).toBeCloseTo(1, 9);
    // what a stem lies on is the element's own centre line, as the description gives it: the ends of every stretch's
    // axis are on its element, and the route between its joints is no shorter
    for (const e of design.bower.graph.edges.values()) expect(e.curve.length, e.id).toBeGreaterThanOrEqual(e.axis.length - 1e-9);
    built.dispose();
  });

  it('sweeps round sections and lines with corners in them as well as straight rectangular ones', () => {
    const file = arbourWith((d) => {
      const members = d['members'] as Record<string, unknown>[];
      members[0]!['section'] = { shape: 'round', diameterMm: 160 };
      // a rafter with a kink in it
      members[8]!['points'] = [
        [2, 0, 2.6],
        [2, 1.5, 2.9],
        [2, 3, 2.6],
      ];
    });
    const changed = opened([file]);
    const built = buildStructure(changed.bower, materials());
    expect(built.drawn.members).toHaveLength(changed.bower.members.length);
    // the round post: its skin stands 80 mm from its centre line
    const post = changed.bower.members[0]!;
    const base = toThree(post.curve.start);
    let onSkin = 0;
    built.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      const pos = o.geometry.getAttribute('position');
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        if (Math.abs(Math.hypot(p.x - base.x, p.z - base.z) - 0.08) < 1e-4 && p.y > 0.2 && p.y < 2.5) onSkin++;
      }
    });
    expect(onSkin).toBe(0); // only two rings: at the foot (carried into the ground) and at the top
    built.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      const pos = o.geometry.getAttribute('position');
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        if (Math.abs(Math.hypot(p.x - base.x, p.z - base.z) - 0.08) < 1e-4 && Math.abs(p.y - 2.6) < 1e-6) onSkin++;
      }
    });
    expect(onSkin).toBeGreaterThanOrEqual(14);
    expect(built.bounds.max.y).toBeCloseTo(2.9, 6);
    built.dispose();
  });

  it('opens a structure alone, with no planting plan', () => {
    const alone = opened([arbourFile]);
    expect(alone.plan).toBeNull();
    expect(alone.files.planting).toBeNull();
  });

  it('reads the hemisphere example too, and draws all of it', () => {
    const dome = opened([
      { name: 'hemisphere-15m.bower.json', text: domeBower },
      { name: 'hemisphere-15m.planting.json', text: domePlanting },
    ]);
    const built = buildStructure(dome.bower, materials());
    expect(built.drawn.members).toHaveLength(dome.bower.members.length);
    expect(built.drawn.cables).toHaveLength(dome.bower.supports.length);
    expect(built.bounds.max.y).toBeGreaterThan(7);
    // an arc read from a file still faces outwards: up, squared to its line
    const rib = built.frames.get(dome.bower.members.find((m) => m.tier === 'primary')!.id)!;
    const mid = Math.floor(rib.C.length / 2);
    expect(rib.N[mid]!.dot(rib.C[mid]!.clone().normalize())).toBeGreaterThan(0.99);
    built.dispose();
  });
});

describe('a file that is refused', () => {
  const refusals: [string, readonly DesignFile[], RegExp][] = [
    ['is not JSON', [{ name: 'notes.bower.json', text: '{ "members": [' }], /^notes\.bower\.json is not JSON/],
    ['is neither kind of file', [{ name: 'package.json', text: '{ "name": "x" }' }], /^package\.json is neither a Bower description/],
    ['is a planting plan with no structure', [plantingFile], /No Bower description among the files opened \(arbour\.planting\.json\)/],
    ['is drawn in millimetres', [arbourWith((d) => ((d['members'] as { points: number[][] }[]).forEach((m) => (m.points = m.points.map((p) => p.map((x) => x * 1000)))), d), 'mm.bower.json')], /^mm\.bower\.json: .*metres/],
    ['has the wrong frame', [arbourWith((d) => (d['frame'] = 'y up'), 'yup.bower.json')], /^yup\.bower\.json is not a valid Bower description:\n\s+frame/],
    [
      'plants at a station the structure does not have',
      [arbourFile, { name: 'elsewhere.planting.json', text: plantingFile.text.replace('bed.sw', 'bed.nowhere') }],
      /^elsewhere\.planting\.json: .*no root station "bed\.nowhere"/,
    ],
    [
      'plants a taxon that cannot be grown',
      [arbourFile, { name: 'odd.planting.json', text: plantingFile.text.replace('wisteria-sinensis', 'sarcococca-confusa') }],
      /^odd\.planting\.json: .*"sarcococca-confusa" cannot be grown/,
    ],
    ['holds two structures', [arbourFile, { ...arbourFile, name: 'again.bower.json' }], /More than one Bower description was opened \(arbour\.bower\.json, again\.bower\.json\)/],
  ];

  for (const [what, files, reason] of refusals) {
    it(`is refused when it ${what}, naming the file and the reason`, () => {
      const r = openDesign(files);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(reason);
    });
  }

  it('leaves the design that was open, and so the scene, in place', () => {
    const desk = new DesignDesk();
    expect(desk.open(ARBOUR_EXAMPLE)).toBe(true);
    const before = desk.current;
    expect(before).not.toBeNull();
    for (const [, files] of refusals) {
      expect(desk.open(files)).toBe(false);
      expect(desk.current).toBe(before);
      expect(desk.error).toBeTruthy();
    }
    // and the next good one replaces it, and clears the complaint
    expect(desk.open([arbourFile])).toBe(true);
    expect(desk.current).not.toBe(before);
    expect(desk.error).toBeNull();
  });

  it('leaves nothing open where nothing was', () => {
    const desk = new DesignDesk();
    expect(desk.open([{ name: 'x.json', text: 'not json' }])).toBe(false);
    expect(desk.current).toBeNull();
  });
});

describe('a design grown', () => {
  const design = opened(ARBOUR_EXAMPLE);
  const plan = design.plan!;

  it('grows its planting plan on its own structure, trained or untended, for the years asked', () => {
    const trained = growDesign({ bower: design.bower, plan, viewpoints: design.viewpoints }, 'trained', 3);
    expect(trained.bower).toBe(design.bower);
    expect(trained.data.plants.map((p) => p.id).sort()).toEqual(plan.plants.map((p) => p.plantId).sort());
    expect(trained.data.scenario).toMatch(/trained$/);
    const years = (run: typeof trained) => new Set(run.data.seasons.map((s) => s.year)).size;
    expect(years(trained)).toBe(3);
    const untended = growDesign({ bower: design.bower, plan, viewpoints: design.viewpoints }, 'untended', 5);
    expect(untended.data.scenario).toMatch(/untended$/);
    expect(years(untended)).toBe(5);
    expect(untended.data.events.filter((e) => e.type !== 'plant')).toHaveLength(0);
  });

  it('reports coverage from the viewpoints the description gave, and none where it gave none', () => {
    const withViews = growDesign({ bower: design.bower, plan, viewpoints: design.viewpoints }, 'trained', 3).report();
    expect(withViews.viewpoints.map((v) => v.id)).toEqual(design.viewpoints.map((v) => v.id));
    expect(withViews.months).toHaveLength(12);
    expect(withViews.winter).not.toBeNull();
    const without = growDesign({ bower: design.bower, plan, viewpoints: [] }, 'trained', 3).report();
    expect(without.viewpoints).toEqual([]);
    expect(without.winter).toBeNull();
    expect(without.months).toHaveLength(12); // the flowering calendar is still there
  });
});
