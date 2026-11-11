/**
 * Node-only: read the taxon library from the `species/` folder.
 * Browser builds receive the same JSON through their bundler instead.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type TaxonProfile, parseTaxon } from '../taxon.ts';

export function loadTaxa(speciesDir: string): Map<string, TaxonProfile> {
  const out = new Map<string, TaxonProfile>();
  for (const name of readdirSync(speciesDir).sort()) {
    const dir = join(speciesDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, 'taxon.json');
    const taxon = parseTaxon(JSON.parse(readFileSync(file, 'utf8')), file);
    if (taxon.id !== name) throw new Error(`${file}: id "${taxon.id}" does not match its folder "${name}"`);
    out.set(taxon.id, taxon);
  }
  return out;
}
