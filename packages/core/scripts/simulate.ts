// Run a reference scenario and write its render data.
//   npm run simulate -- [wisteria|mixed|dome|trial] [trained|untended] [years] [seed]
// Writes out/<scenario>-<care>-<years>y.json and prints the yearly account and the gardener's log.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { summariseProvenance } from '../src/provenance.ts';
import { Simulation } from '../src/sim/engine.ts';
import { modelProvenance } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { designReport, formatDesignReport } from '../src/sim/report.ts';
import { attachmentTrial, mixedOnVault, wisteriaOnHemisphere, wisteriaOnVault } from '../src/sim/scenarios.ts';

const args = process.argv.slice(2);
const which = ['mixed', 'wisteria', 'dome', 'trial'].includes(args[0] ?? '') ? args.shift()! : 'wisteria';
const care = args[0] === 'untended' ? 'untended' : 'trained';
const years = Number(args[1] ?? 10);
const seed = Number(args[2] ?? 7);
const root = fileURLToPath(new URL('../../../', import.meta.url));

const taxa = loadGrowable(`${root}species`);
const scenario = (which === 'mixed' ? mixedOnVault : which === 'dome' ? wisteriaOnHemisphere : which === 'trial' ? attachmentTrial : wisteriaOnVault)({ taxa, care, years, seed });
const t0 = performance.now();
const sim = new Simulation(scenario).runUntil(`${2027 + years - 1}-12-31`);
const ms = performance.now() - t0;

console.log(`${scenario.name}`);
console.log(`${sim.day + 1} days simulated in ${ms.toFixed(0)} ms\n`);
console.log('year   plant        framework  long shoots  spurs  buds formed  flowers  held by plant / tied  route held  highest');
for (const s of sim.summaries) {
  console.log(
    `${s.year}   ${s.plantId.padEnd(11)}  ${s.frameworkM.toFixed(1).padStart(7)} m  ${s.whipM.toFixed(1).padStart(9)} m  ${String(s.spurs).padStart(5)}  ${String(s.floralBudsInitiated).padStart(11)}  ${String(s.flowersOpened).padStart(7)}  ${`${s.runsSelf} / ${s.runsTied}`.padStart(20)}  ${`${(100 * s.routeShare).toFixed(0)}%`.padStart(10)}  ${s.highestM.toFixed(2)} m`,
  );
}

const acted = sim.events.filter((e) => e.type !== 'monitor');
console.log(`\ngardener's log: ${sim.events.length} entries${acted.length > 12 ? ', the last 12 actions shown' : ''}`);
for (const e of acted.slice(-12)) console.log(`  ${e.date}  ${e.plantId}  ${e.type}: ${e.outcome}`);

const notes = sim.decisions.filter((d) => d.kind === 'not_modelled');
if (notes.length) {
  console.log('\nnot modelled in this run:');
  for (const n of notes) console.log(`  ${n.plantId}: ${n.text}`);
}

console.log('\nassumptions behind this run:');
for (const taxonId of new Set(scenario.plantings.map((p) => p.taxonId))) {
  const { model } = taxa.get(taxonId)!;
  const counts = summariseProvenance(modelProvenance(model));
  console.log(`  ${taxonId}: ${counts.provisional_design_assumption} provisional, ${counts.published_plant_profile} published, ${counts.measured} measured`);
}
console.log('Every growth model here is a running model, not a calibrated one: compare scenarios with it, do not predict dates, sizes or loads.');

const report = designReport(sim);
const text = formatDesignReport(report);
console.log(`\n${'='.repeat(72)}\nDESIGN REPORT\n${'='.repeat(72)}\n${text}`);

mkdirSync(`${root}out`, { recursive: true });
const file = `${root}out/${which}-${care}-${years}y`;
writeFileSync(`${file}.json`, JSON.stringify(toRenderData(sim)));
writeFileSync(`${file}.report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${file}.report.txt`, `${text}\n`);
console.log(`\nwritten: ${file}.json (render data), .report.txt and .report.json`);
