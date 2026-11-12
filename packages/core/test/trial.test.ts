import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadGrowable, loadTaxa } from '../src/node/load-taxa.ts';
import { Simulation } from '../src/sim/engine.ts';
import { designReport } from '../src/sim/report.ts';
import { ATTACHMENT_TRIAL, attachmentTrial } from '../src/sim/scenarios.ts';
import type { GardenerEvent } from '../src/sim/types.ts';
import { ATTACHMENT_MECHANISM } from '../src/vocab.ts';

const speciesDir = fileURLToPath(new URL('../../../species', import.meta.url));
const taxa = loadGrowable(speciesDir);
const END = '2033-12-31';
const untended = new Simulation(attachmentTrial({ taxa, care: 'untended' })).runUntil(END);
const trained = new Simulation(attachmentTrial({ taxa, care: 'trained' })).runUntil(END);
const end = (sim: Simulation, plantId: string) => sim.summaries.find((s) => s.plantId === plantId && s.year === 2033)!;
const runsOf = (sim: Simulation, plantId: string) =>
  sim.plants
    .get(plantId)!
    .axisIds.flatMap((id) => sim.axes.get(id)!.runs)
    .filter((r) => r.status !== 'detached')
    .map((r) => ({ r, edge: sim.scenario.bower.graph.edges.get(r.edgeId)! }));
const stalled = (sim: Simulation, plantId: string) => sim.decisions.find((d) => d.plantId === plantId && d.kind === 'no_route')!.text;

// DEVELOPMENT_GUIDE.md stage 3 exit check: "Each species can approach a support, attempt a biologically
// correct kind of contact, fail without support, and be rescued by an explicit gardener training event
// where legitimate." SIMULATION_KEY.md section 9, "Attachment exclusivity".
describe('six ways of climbing, each at the foot of a bare glulam rib', () => {
  it('covers every attachment class in the vocabulary, with the shrub as the one that does not climb', () => {
    const all = loadTaxa(speciesDir);
    const grown = new Set(ATTACHMENT_TRIAL.map((p) => all.get(p.taxonId)!.attachment.mechanism));
    grown.add(all.get('sarcococca-confusa')!.attachment.mechanism);
    expect([...grown].sort()).toEqual([...ATTACHMENT_MECHANISM].sort());
  });

  describe('with nobody gardening', () => {
    it('lets the wisteria twine its way up, holding everything itself', () => {
      expect(end(untended, 'wisteria').frameworkM).toBeGreaterThan(40);
      const runs = runsOf(untended, 'wisteria');
      expect(runs.length).toBeGreaterThan(20);
      for (const { r } of runs) {
        expect(r.mode).toBe('twine');
        expect(r.by).toBe('plant');
      }
    });

    it('lets the ivy cling its way over the timber, and never on to a cable', () => {
      expect(end(untended, 'ivy').frameworkM).toBeGreaterThan(10);
      const runs = runsOf(untended, 'ivy');
      expect(runs.length).toBeGreaterThan(10);
      for (const { r, edge } of runs) {
        expect(edge.kind).toBe('timber');
        expect(r.mode).toBe('along');
        expect(r.by).toBe('plant');
        expect(r.status).toBe('grasped');
      }
    });

    it('leaves the other four at the foot of the rib, each for its own reason', () => {
      for (const id of ['honeysuckle', 'clematis', 'vine', 'rose']) expect(end(untended, id).frameworkM, id).toBeLessThan(0.1);
      // each says the limit its own model gives, in millimetres
      expect(stalled(untended, 'honeysuckle')).toMatch(/too thick for a twining stem to grasp \(limit \d+ mm\)/);
      expect(stalled(untended, 'clematis')).toMatch(/too thick for a twining leaf stalk to grasp \(limit \d+ mm\)/);
      expect(stalled(untended, 'vine')).toMatch(/too thick for a tendril to grasp \(limit \d+ mm\)/);
      expect(stalled(untended, 'rose')).toContain('a scrambling cane cannot hold on by itself');
      for (const id of ['honeysuckle', 'clematis', 'vine', 'rose']) expect(stalled(untended, id), id).toContain('nobody ties it in');
    });

    it('says so in the report', () => {
      const r = designReport(untended);
      for (const id of ['honeysuckle', 'clematis', 'vine', 'rose']) expect(r.alerts.some((a) => a.kind === 'no_hold' && a.plantId === id), id).toBe(true);
      expect(r.alerts.some((a) => a.kind === 'no_hold' && a.plantId === 'wisteria')).toBe(false);
      // the ivy climbs, but some of its shoots stall where the only way on is a cable, and the report says that too
      const ivy = r.alerts.find((a) => a.kind === 'no_hold' && a.plantId === 'ivy');
      if (ivy) expect(ivy.text).toContain('aerial roots cannot cling to a 5 mm cable');
    });
  });

  describe('with a gardener tying growth in', () => {
    it('gets all six up the structure', () => {
      for (const p of ATTACHMENT_TRIAL) {
        expect(end(trained, p.plantId).frameworkM, p.plantId).toBeGreaterThan(8);
        expect(end(trained, p.plantId).highestM, p.plantId).toBeGreaterThan(3);
      }
    });

    it('ties the rose wherever it goes: it never holds anything itself', () => {
      const runs = runsOf(trained, 'rose');
      expect(runs.length).toBeGreaterThan(10);
      for (const { r } of runs) {
        expect(r.by).not.toBe('plant');
        expect(r.status).toBe('trained_by_human');
        expect(r.mode).toBe('along');
      }
    });

    it('ties the three slender climbers to timber and leaves them to hold cables themselves, each in its own way', () => {
      const expectCable = { honeysuckle: 'twine', clematis: 'along', vine: 'along' } as const;
      for (const id of ['honeysuckle', 'clematis', 'vine'] as const) {
        const runs = runsOf(trained, id);
        const cables = runs.filter((x) => x.edge.kind === 'cable');
        expect(cables.length, id).toBeGreaterThan(0);
        for (const { r } of cables) {
          expect(r.by, id).toBe('plant');
          expect(r.mode, id).toBe(expectCable[id]);
        }
        for (const { r } of runs.filter((x) => x.edge.kind === 'timber')) {
          expect(r.status, id).toBe('trained_by_human');
          expect(r.mode, id).toBe('along');
        }
      }
    });

    it('leaves the ivy to cling to timber by itself even so, and ties it only to cables', () => {
      for (const { r, edge } of runsOf(trained, 'ivy')) {
        if (edge.kind === 'timber') expect(r.by).toBe('plant');
        else expect(r.status).toBe('trained_by_human');
      }
    });

    it('still lets the wisteria twine the glulam ribs unaided', () => {
      for (const { r, edge } of runsOf(trained, 'wisteria')) if (edge.host.id.startsWith('rib.')) expect(r.by).toBe('plant');
    });
  });

  it('rescues a stalled plant when a gardener begins tying it in, and records who did', () => {
    const tie: GardenerEvent = { id: 'tie-the-rose', date: '2029-03-20', type: 'train_leader', plantId: 'rose', tieToTimber: true, author: 'gardener', reason: 'lead the canes up the rib' };
    const s = attachmentTrial({ taxa, care: 'untended' });
    const sim = new Simulation({ ...s, events: [tie] }).runUntil(END);
    expect(sim.summaries.find((x) => x.plantId === 'rose' && x.year === 2028)!.frameworkM).toBeLessThan(0.1);
    expect(end(sim, 'rose').frameworkM).toBeGreaterThan(5);
    for (const { r } of runsOf(sim, 'rose')) expect(r.by).toBe('tie-the-rose');
    expect(sim.events.find((e) => e.eventId === 'tie-the-rose')!.outcome).toContain('led on');
    // the neighbours nobody tied are where they were
    expect(end(sim, 'clematis').frameworkM).toBeLessThan(0.1);
  });
});
