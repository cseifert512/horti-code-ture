// Run a reference scenario and write its render data.
//   npm run simulate -- [wisteria|mixed|dome|trial|palette] [trained|untended] [years] [seed]
//   npm run simulate -- design <bower.json> <planting.json> [trained|untended] [years] [seed]
// Writes out/<scenario>-<care>-<years>y.json and prints the yearly account and the gardener's log.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readBower } from '../src/bower/description.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { summariseProvenance } from '../src/provenance.ts';
import { Simulation } from '../src/sim/engine.ts';
import { modelProvenance } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { parsePlantingPlan, plantingOn } from '../src/sim/planting.ts';
import { designReport, formatDesignReport } from '../src/sim/report.ts';
import { attachmentTrial, mixedOnVault, referencePalette, wisteriaOnHemisphere, wisteriaOnVault } from '../src/sim/scenarios.ts';

const args = process.argv.slice(2);
const which = ['mixed', 'wisteria', 'dome', 'trial', 'palette', 'design'].includes(args[0] ?? '') ? args.shift()! : 'wisteria';
// a design is two files: what is built, and what is planted where
const files = which === 'design' ? args.splice(0, 2) : [];
if (which === 'design' && files.length < 2) throw new Error('usage: npm run simulate -- design <bower.json> <planting.json> [trained|untended] [years] [seed]');
const care = args[0] === 'untended' ? 'untended' : 'trained';
const years = Number(args[1] ?? 10);
const seed = Number(args[2] ?? 7);
const root = fileURLToPath(new URL('../../../', import.meta.url));

const taxa = loadGrowable(`${root}species`);
const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
const design = which === 'design' ? readBower(read(files[0]!), files[0]!) : null;
const scenario = design
  ? plantingOn(design.bower, parsePlantingPlan(read(files[1]!), files[1]!), { taxa, care, years, seed, viewpoints: design.viewpoints })
  : (which === 'mixed' ? mixedOnVault : which === 'dome' ? wisteriaOnHemisphere : which === 'trial' ? attachmentTrial : which === 'palette' ? referencePalette : wisteriaOnVault)({ taxa, care, years, seed });
if (design) {
  console.log(`read ${files[0]}: ${Object.entries(design.bower.facts).filter(([k]) => k !== 'source').map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const w of design.warnings) console.log(`  to check: ${w}`);
  console.log();
}
const t0 = performance.now();
const sim = new Simulation(scenario).runUntil(`${2027 + years - 1}-12-31`);
const ms = performance.now() - t0;

console.log(`${scenario.name}`);
console.log(`${sim.day + 1} days simulated in ${ms.toFixed(0)} ms\n`);
const idW = Math.max(11, ...scenario.plantings.map((p) => p.plantId.length));
console.log(`year   ${'plant'.padEnd(idW)}  framework  long shoots  spurs  buds formed  flowers  fruit set  held by plant / tied  route held  highest`);
for (const s of sim.summaries) {
  console.log(
    `${s.year}   ${s.plantId.padEnd(idW)}  ${s.frameworkM.toFixed(1).padStart(7)} m  ${s.whipM.toFixed(1).padStart(9)} m  ${String(s.spurs).padStart(5)}  ${String(s.floralBudsInitiated).padStart(11)}  ${String(s.flowersOpened).padStart(7)}  ${String(s.fruitsSet).padStart(9)}  ${`${s.runsSelf} / ${s.runsTied}`.padStart(20)}  ${`${(100 * s.routeShare).toFixed(0)}%`.padStart(10)}  ${s.highestM.toFixed(2)} m`,
  );
}

const acted = sim.events.filter((e) => e.type !== 'monitor');
console.log(`\ngardener's log: ${sim.events.length} entries${acted.length > 12 ? ', the last 12 actions shown' : ''}`);
for (const e of acted.slice(-12)) console.log(`  ${e.date}  ${e.plantId}  ${e.type}: ${e.outcome}`);

const notes = sim.decisions.filter((d) => d.kind === 'not_modelled' || d.kind === 'part_not_modelled' || d.kind === 'assumed' || d.kind === 'generic_shoot');
if (notes.length) {
  console.log('\nnot modelled, or assumed, in this run:');
  for (const n of notes) console.log(`  ${n.plantId}: ${n.text}`);
}

console.log('\nassumptions behind this run:');
for (const taxonId of new Set(scenario.plantings.map((p) => p.taxonId))) {
  const { model } = taxa.get(taxonId)!;
  const counts = summariseProvenance(modelProvenance(model));
  console.log(`  ${taxonId}: ${counts.provisional_design_assumption} provisional, ${counts.published_plant_profile} published, ${counts.measured} measured${counts.unknown ? `, ${counts.unknown} unknown (parts left out of the run)` : ''}`);
}
console.log('Every growth model here is a running model, not a calibrated one: compare scenarios with it, do not predict dates, sizes or loads.');

const report = designReport(sim);
const text = formatDesignReport(report);
console.log(`\n${'='.repeat(72)}\nDESIGN REPORT\n${'='.repeat(72)}\n${text}`);

mkdirSync(`${root}out`, { recursive: true });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const file = `${root}out/${design ? slug(`${design.bower.id}-${scenario.plantings.length}-plants`) : which}-${care}-${years}y`;
writeFileSync(`${file}.json`, JSON.stringify(toRenderData(sim)));
writeFileSync(`${file}.report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${file}.report.txt`, `${text}\n`);
console.log(`\nwritten: ${file}.json (render data), .report.txt and .report.json`);
