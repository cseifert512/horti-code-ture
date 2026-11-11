// How far a scenario's readings move when unmeasured leaf and shoot densities are multiplied.
//   npm run sensitivity -- [wisteria|mixed|dome|palette] [trained|untended] [years] [seed]
//   npm run sensitivity -- design <bower.json> <planting.json> [trained|untended] [years] [seed]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readBower } from '../src/bower/description.ts';
import { loadGrowable } from '../src/node/load-taxa.ts';
import { parsePlantingPlan, plantingOn } from '../src/sim/planting.ts';
import { type Growable, mixedOnVault, referencePalette, wisteriaOnHemisphere, wisteriaOnVault } from '../src/sim/scenarios.ts';
import { formatSensitivity, sensitivity } from '../src/sim/sensitivity.ts';

const args = process.argv.slice(2);
const which = ['mixed', 'wisteria', 'dome', 'palette', 'design'].includes(args[0] ?? '') ? args.shift()! : 'palette';
const files = which === 'design' ? args.splice(0, 2) : [];
if (which === 'design' && files.length < 2) throw new Error('usage: npm run sensitivity -- design <bower.json> <planting.json> [trained|untended] [years] [seed]');
const care = args[0] === 'untended' ? 'untended' : 'trained';
const years = Number(args[1] ?? 12);
const seed = Number(args[2] ?? 7);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

const design = which === 'design' ? readBower(read(files[0]!), files[0]!) : null;
const plan = design ? parsePlantingPlan(read(files[1]!), files[1]!) : null;
const make = (taxa: Growable) =>
  design && plan
    ? plantingOn(design.bower, plan, { taxa, care, years, seed, viewpoints: design.viewpoints })
    : (which === 'mixed' ? mixedOnVault : which === 'dome' ? wisteriaOnHemisphere : which === 'wisteria' ? wisteriaOnVault : referencePalette)({ taxa, care, years, seed });

const t0 = performance.now();
const result = sensitivity(make, loadGrowable(`${root}species`), `${2027 + years - 1}-12-31`);
const text = formatSensitivity(result);
console.log(text);
console.log(`\n${result.rows.length} runs in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

mkdirSync(`${root}out`, { recursive: true });
const file = `${root}out/${design ? design.bower.id : which}-${care}-${years}y.sensitivity`;
writeFileSync(`${file}.txt`, `${text}\n`);
writeFileSync(`${file}.json`, JSON.stringify(result, null, 2));
console.log(`written: ${file}.txt and .json`);
