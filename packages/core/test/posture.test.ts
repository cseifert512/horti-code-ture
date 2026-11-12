import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readBower } from '../src/bower/description.ts';
import { type Vec3, length, normalize, sub, v3 } from '../src/math/vec3.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { type Rod, solveRod, startFreeShoot } from '../src/sim/free-shoot.ts';
import { GENERIC_SHOOT } from '../src/sim/generic-shoot.ts';
import { type PlantingPlan, plantingOn } from '../src/sim/planting.ts';
import type { Growable } from '../src/sim/scenarios.ts';

// A shoot in the air that sets out upright: no stem is exactly plumb, a leaf's weight hangs off the stem on the side
// it is turned to, and a long shoot sets out from its stem as a side shoot does, not straight up off a level member.
// SIMULATION_KEY.md section 4.3, "Unsupported shoots", (a), (b) and (c) as replaced on 12 November 2026;
// docs/ASSUMPTIONS_AUDIT.md section 12.

const deg = Math.PI / 180;
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const species = loadGrowable(here('../../../species'));
const frame = readBower(JSON.parse(readFileSync(here('../../../examples/specimen-frame.bower.json'), 'utf8')), 'specimen-frame.bower.json');

describe('the lean a free shoot sets out at', () => {
  it('leans a shoot that would set out plumb by the least lean, towards the side given', () => {
    const s = startFreeShoot(0, v3(0, 0, 1), 4 * deg, v3(0, 1, 0));
    expect(s.baseIncline).toBeCloseTo(4 * deg, 12);
    expect(s.plane.y).toBeCloseTo(1, 12);
  });
  it('leaves alone a shoot that already leans more, and keeps the side it leans to', () => {
    const d = normalize(v3(1, 0, 1));
    const s = startFreeShoot(0, d, 4 * deg, v3(0, 1, 0));
    expect(s.baseIncline).toBeCloseTo(45 * deg, 12);
    expect(s.plane.x).toBeCloseTo(1, 12);
  });
  it('has a generic value, small and labelled as a choice', () => {
    expect(GENERIC_SHOOT['mechanics.leanDeg'].value).toBeGreaterThan(0);
    expect(GENERIC_SHOOT['mechanics.leanDeg'].value).toBeLessThan(10);
    expect(GENERIC_SHOOT['mechanics.leanDeg'].status).toBe('provisional_design_assumption');
  });
});

describe('a weight hung off the stem', () => {
  // a plumb rod of 0.5 m, 1 mm thick at 3000 MPa, weighing 0.03 N a metre: well short of Greenhill's height
  const rod = (couple?: number[]): Rod => {
    const n = 25;
    const ds = 0.02;
    const EI = 3000e6 * ((Math.PI * 0.001 ** 4) / 4);
    return { baseIncline: 0, lengthM: new Array(n).fill(ds), turn: new Array(n).fill(0), compliance: new Array(n).fill(ds / EI), load: new Array(n).fill(0.03 * ds), ...(couple ? { couple } : {}) };
  };
  it('leaves a plumb rod with nothing off its axis standing plumb', () => {
    expect(solveRod(rod()).tipIncline).toBe(0);
  });
  it('bends a plumb rod towards the side the weight hangs on, and the other way for the other side', () => {
    const c = new Array(25).fill(0);
    c[24] = 2e-4;
    expect(solveRod(rod(c)).tipIncline).toBeGreaterThan(1 * deg);
    expect(solveRod(rod(c.map((x) => -x))).tipIncline).toBeLessThan(-1 * deg);
  });
  it('bends a rod more for a weight further out along it', () => {
    const near = new Array(25).fill(0);
    near[4] = 2e-4;
    const far = new Array(25).fill(0);
    far[24] = 2e-4;
    expect(solveRod(rod(far)).tipIncline).toBeGreaterThan(solveRod(rod(near)).tipIncline);
  });
});

describe('a long shoot off a level member', () => {
  // ivy throws many long free shoots from its stems, a great many of them from stems tied along level laths
  const IVY = 'hedera-helix';
  const plan: PlantingPlan = { schemaVersion: 1, name: 'One ivy', plants: [{ plantId: 'ivy', taxonId: IVY, stationId: frame.bower.rootStations[0]!.id }] };
  const sim = new Simulation(plantingOn(frame.bower, plan, { taxa: new Map([[IVY, species.get(IVY)!]]) as Growable, years: 12, care: 'trained', viewpoints: frame.viewpoints })).runUntil('2038-12-31');
  const setOut = (p: Vec3[]): Vec3 => normalize(sub(p[1]!, p[0]!));
  const fromLevel = [...sim.axes.values()].filter((a) => {
    if (a.role !== 'whip' || a.contact.length < 3) return false;
    const host = sim.axes.get(a.parent!.axisId)!;
    const i = a.parent!.pointIndex;
    if (length(host.away[i]!) < 0.5 || host.away[i]!.z < 0.9) return false;
    const t = normalize(sub(host.contact[Math.min(host.alive - 1, i + 1)]!, host.contact[Math.max(0, i - 1)]!));
    return Math.abs(t.z) < 0.25;
  });
  it('does not set out straight up from the top of the member', () => {
    expect(fromLevel.length).toBeGreaterThan(15);
    // until 12 November 2026 a long shoot was headed out from the support with an extra pull upwards, which off the top of
    // a level member put it near plumb; now it leaves from the axil of its leaf, and fewer than a third set out within 20 degrees of plumb
    const nearPlumb = fromLevel.filter((a) => setOut(a.contact).z > Math.cos(20 * deg)).length;
    expect(nearPlumb / fromLevel.length).toBeLessThan(1 / 3);
  });
});
