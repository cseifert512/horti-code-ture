// Write a reference shell out as a Bower description, the format a designed structure is read from.
//   npm run export-bower -- hemisphere|vault <out.json>
// The palette's planting plan is written beside the hemisphere, as <out>.planting.json.
import { writeFileSync } from 'node:fs';
import { type BowerDescription, describeBower } from '../src/bower/description.ts';
import { makeHemisphereBower } from '../src/bower/hemisphere.ts';
import { makeVaultBower } from '../src/bower/vault.ts';
import type { PlantingPlan } from '../src/sim/planting.ts';
import { HEMISPHERE_VIEWPOINTS, REFERENCE_PALETTE, VAULT_VIEWPOINTS } from '../src/sim/scenarios.ts';

const [which = 'hemisphere', out] = process.argv.slice(2);
if (!out || !['hemisphere', 'vault'].includes(which)) throw new Error('usage: npm run export-bower -- hemisphere|vault <out.json>');

/** One element to a line, so that the file can be read and compared. */
function write(file: string, d: BowerDescription | PlantingPlan): void {
  const lines: string[] = ['{'];
  const entries = Object.entries(d);
  entries.forEach(([key, value], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    if (Array.isArray(value)) {
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, k) => lines.push(`    ${JSON.stringify(item)}${k < value.length - 1 ? ',' : ''}`));
      lines.push(`  ]${comma}`);
    } else lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)}${comma}`);
  });
  lines.push('}');
  writeFileSync(file, `${lines.join('\n')}\n`);
  console.log(`written: ${file}`);
}

if (which === 'vault') write(out, describeBower(makeVaultBower(), VAULT_VIEWPOINTS));
else {
  // coarser curves than the generator's default: a rib is still smooth to the eye at eight points a band
  write(out, describeBower(makeHemisphereBower({ diameterM: 15, stations: 12, segmentsPerEdge: 8 }), HEMISPHERE_VIEWPOINTS));
  const plan: PlantingPlan = { schemaVersion: 1, name: 'The reference palette', plants: REFERENCE_PALETTE.map((p) => ({ plantId: p.plantId, taxonId: p.taxonId, stationId: `station.${p.meridian}` })) };
  write(out.replace(/(\.bower)?\.json$/, '.planting.json'), plan);
}
