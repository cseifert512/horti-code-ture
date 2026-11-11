// Run a reference scenario and write its render data.
//   npm run simulate -- [trained|untended] [years] [seed]
// Writes out/<care>-<years>y.json and prints the yearly account and the gardener's log.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { summariseProvenance } from '../src/provenance.ts';
import { Simulation } from '../src/sim/engine.ts';
import { modelProvenance } from '../src/sim/model.ts';
import { toRenderData } from '../src/sim/render-data.ts';
import { wisteriaOnVault } from '../src/sim/scenarios.ts';

const care = process.argv[2] === 'untended' ? 'untended' : 'trained';
const years = Number(process.argv[3] ?? 10);
const seed = Number(process.argv[4] ?? 7);
const root = fileURLToPath(new URL('../../../', import.meta.url));

const taxa = loadGrowable(`${root}species`);
const scenario = wisteriaOnVault({ taxa, care, years, seed });
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

const counts = summariseProvenance(modelProvenance(taxa.get('wisteria-sinensis')!.model));
console.log(`\nassumptions behind this run: ${counts.provisional_design_assumption} provisional, ${counts.published_plant_profile} published, ${counts.measured} measured`);
console.log(taxa.get('wisteria-sinensis')!.model.statement);

mkdirSync(`${root}out`, { recursive: true });
const file = `${root}out/${care}-${years}y.json`;
writeFileSync(file, JSON.stringify(toRenderData(sim)));
console.log(`\nrender data written to ${file}`);
