// Portraits of one taxon: the whole plant in four seasons, and close stills of a leaf, a flower, a fruit, a stem and
// what it holds on with, each on a day when the core's data says it is there.
//
//   npm run portrait -- <taxonId> [--years 6] [--care trained|untended] [--out out/portraits] [--port 5197]
//                       [--only whole,leaf,flower,fruit,stem,hold] [--size 1600x1000] [--budget 15000] [--jobs 3]
//   npm run portrait -- --index        write the contact sheet again from what is there
//   npm run portrait -- --stop-server  stop the viewer this script started on that port
//
// The plant is grown twice from the same files with the same seed: here, to find the dates, and in the viewer, to draw
// it (?specimen=<taxonId>, packages/viewer/src/main.ts). The dates come from asking the run what is on the plant day
// by day (src/specimen/specimen.ts); none is taken from the month a plant is supposed to do something in.
//
// Stills are taken by a headless browser, one start of the browser for each:
//   msedge --headless=new --screenshot=<file> --window-size=<w>,<h> --virtual-time-budget=<ms> <url>
// The page keeps a dark curtain over the picture until its frame is final, and a still that shows the curtain is
// reported as failed, so a picture taken too soon is never mistaken for the plant.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { type Growable, parseGrowthModel, parseTaxon, readBower, toRenderData } from '@horti/core';
import { type Care, growPlanting } from '../src/plant/grow.ts';
import { SPECIMEN_VIEWS, SPECIMEN_YEARS, type SpecimenView, portraitDates, specimenPlan } from '../src/specimen/specimen.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const BROWSERS = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
/** The colour of the curtain the viewer keeps over a specimen until its frame is final (index.html, #curtain). */
const CURTAIN = [0x10, 0x15, 0x1a] as const;
const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;

// ---- what was asked for -----------------------------------------------------------------------
const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  args.splice(at, 2);
  return value;
}
function flag(name: string): boolean {
  const at = args.indexOf(`--${name}`);
  if (at >= 0) args.splice(at, 1);
  return at >= 0;
}
const years = Math.min(30, Math.max(1, Math.round(Number(option('years', String(SPECIMEN_YEARS))))));
const care: Care = option('care', 'trained') === 'untended' ? 'untended' : 'trained';
const out = resolve(ROOT, option('out', 'out/portraits'));
const port = Number(option('port', '5197'));
const [width, height] = option('size', '1600x1000').split('x').map(Number) as [number, number];
const budgetMs = Number(option('budget', '15000'));
/** How many browsers take stills at once. */
const jobs = Math.min(8, Math.max(1, Math.round(Number(option('jobs', '3')))));
const only = option('only', SPECIMEN_VIEWS.join(','))
  .split(',')
  .map((v) => v.trim())
  .filter((v): v is SpecimenView => (SPECIMEN_VIEWS as readonly string[]).includes(v));
const indexOnly = flag('index');
const stopServer = flag('stop-server');
const taxonId = args.find((a) => !a.startsWith('--'));
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const pidFile = join(out, `.viewer-${port}.pid`);

// ---- the contact sheet ---------------------------------------------------------------------------
interface Still {
  view: SpecimenView;
  /** For a whole-plant still: which season it stands for. */
  season?: (typeof SEASONS)[number];
  date: string | null;
  /** File name within the taxon's folder; null where no still was taken. */
  file: string | null;
  /** Why this date, or why there is no still. */
  note: string;
  ok: boolean;
}
interface Manifest {
  taxonId: string;
  label: string;
  years: number;
  care: Care;
  taken: string;
  stills: Still[];
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function writeIndex(): string {
  const sheets: Manifest[] = [];
  if (existsSync(out)) {
    for (const name of readdirSync(out).sort()) {
      const file = join(out, name, 'portrait.json');
      if (existsSync(file)) sheets.push(JSON.parse(readFileSync(file, 'utf8')) as Manifest);
    }
  }
  const tile = (taxon: string, s: Still) => {
    const title = `${s.season ?? s.view}${s.date ? ` · ${s.date}` : ''}`;
    const picture = s.file && existsSync(join(out, taxon, s.file)) ? `<a href="${taxon}/${s.file}"><img loading="lazy" src="${taxon}/${s.file}" alt="${escape(`${taxon}: ${title}`)}" /></a>` : `<div class="none">no still</div>`;
    // a view the run has nothing for is not a failure: only a still that was wanted and could not be taken is marked
    const words = s.ok ? s.note : s.date ? `NOT TAKEN: ${s.note}` : `Nothing to take: ${s.note}`;
    return `<figure class="${s.ok || !s.date ? '' : 'failed'}">${picture}<figcaption><b>${escape(title)}</b>${escape(words)}</figcaption></figure>`;
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Specimen portraits</title>
<style>
  body { margin: 0; padding: 24px; background: #171b20; color: #e8edf2; font: 14px/1.4 system-ui, 'Segoe UI', sans-serif; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  h2 { margin: 28px 0 2px; font-size: 17px; }
  p { margin: 0 0 10px; color: #aab4be; max-width: 110ch; }
  .sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }
  figure { margin: 0; background: #20262d; border-radius: 8px; overflow: hidden; }
  figure.failed { outline: 2px solid #e8915a; }
  img { display: block; width: 100%; height: auto; }
  .none { display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 10; color: #7d8894; background: repeating-linear-gradient(135deg, #20262d 0 10px, #252c34 10px 20px); }
  figcaption { padding: 6px 10px 8px; color: #aab4be; font-size: 12px; }
  figcaption b { display: block; color: #e8edf2; font-size: 13px; }
</style>
</head>
<body>
<h1>Specimen portraits</h1>
<p>One plant of each taxon, grown by the engine on the specimen frame (examples/specimen-frame.bower.json) and drawn by the viewer. Each is a scenario, not a forecast: growth rates, dates and flowering chances are provisional assumptions that have not been measured on plants. The date of every still was found by asking the run what is on the plant; the reason is under the picture.</p>
${sheets.length ? '' : '<p>No portraits have been taken yet: npm run portrait -- &lt;taxonId&gt;</p>'}
${sheets
  .map(
    (m) => `<h2>${escape(m.label)}</h2>
<p>${escape(m.taxonId)} · ${m.care}, ${m.years} years · taken ${escape(m.taken)}</p>
<div class="sheet">
${m.stills.map((s) => tile(m.taxonId, s)).join('\n')}
</div>`,
  )
  .join('\n')}
</body>
</html>
`;
  mkdirSync(out, { recursive: true });
  const file = join(out, 'index.html');
  writeFileSync(file, html);
  return file;
}

// ---- the viewer ----------------------------------------------------------------------------------
/** 'viewer' if the viewer answers on the port, 'other' if something else does, 'none' if nothing does. */
async function whatAnswers(): Promise<'viewer' | 'other' | 'none'> {
  try {
    const page = await (await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(4000) })).text();
    // the curtain is how a still is told from a page that is not ready: a viewer without one is not this viewer
    return page.includes('id="curtain"') ? 'viewer' : 'other';
  } catch {
    return 'none';
  }
}

/** Use the viewer already on the port, or start one and leave it running for the next portrait. */
async function ensureViewer(): Promise<void> {
  let answer = await whatAnswers();
  if (answer === 'viewer') return console.log(`viewer: using the one already on http://localhost:${port}/`);
  if (answer === 'other') throw new Error(`port ${port} is in use by something that is not this viewer: pass another with --port`);
  mkdirSync(out, { recursive: true });
  const child = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), join(ROOT, 'packages/viewer'), '--port', String(port), '--strictPort'], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  for (let i = 0; i < 120 && answer !== 'viewer'; i++) {
    await sleep(250);
    answer = await whatAnswers();
  }
  // another portrait may have started one in the same moment and won the port: that one will do
  if (answer !== 'viewer') throw new Error(`the viewer did not start on port ${port}`);
  if (child.pid !== undefined && child.exitCode === null) writeFileSync(pidFile, String(child.pid));
  console.log(`viewer: started on http://localhost:${port}/ and left running for the next portrait (stop it with: npm run portrait -- --stop-server --port ${port})`);
}

// ---- reading a still back -------------------------------------------------------------------------
/** Decodes an 8-bit RGB or RGBA PNG far enough to say what a still shows: how much of it is curtain, and whether it is one flat colour. */
function inspect(file: string): { curtain: number; flat: boolean; width: number; height: number } {
  const buf = readFileSync(file);
  let at = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat: Buffer[] = [];
  while (at + 8 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const kind = buf.toString('latin1', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      type = body[9]!;
    } else if (kind === 'IDAT') idat.push(body);
    at += 12 + length;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  let prev = new Uint8Array(stride);
  let line = new Uint8Array(stride);
  let curtain = 0;
  const seen = new Set<number>();
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let v = src[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x += 2) {
      const r = line[x * bpp]!;
      const g = line[x * bpp + 1]!;
      const b = line[x * bpp + 2]!;
      if (r === CURTAIN[0] && g === CURTAIN[1] && b === CURTAIN[2]) curtain++;
      seen.add((r << 16) | (g << 8) | b);
    }
    [prev, line] = [line, prev];
  }
  return { curtain: curtain / (Math.ceil(w / 2) * h), flat: seen.size < 16, width: w, height: h };
}

// ---- taking a still -------------------------------------------------------------------------------
/** One start of the headless browser, one picture. Returns why it failed, or null. */
async function shoot(browser: string, url: string, file: string, budget: number): Promise<string | null> {
  rmSync(file, { force: true });
  const profile = mkdtempSync(join(tmpdir(), 'portrait-'));
  const child = spawn(
    browser,
    ['--headless=new', `--screenshot=${file}`, `--window-size=${width},${height}`, '--force-device-scale-factor=1', '--hide-scrollbars', `--virtual-time-budget=${budget}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${profile}`, url],
    { stdio: 'ignore', windowsHide: true },
  );
  // Edge's launcher returns at once and the browser it started writes the file later: wait for the file, not for the process
  let size = -1;
  let steady = 0;
  const deadline = Date.now() + 90_000 + budget;
  while (Date.now() < deadline && steady < 3) {
    await sleep(200);
    const now = existsSync(file) ? statSync(file).size : -1;
    steady = now > 0 && now === size ? steady + 1 : 0;
    size = now;
  }
  if (child.exitCode === null) child.unref();
  // the browser lets go of its profile a moment after the picture is written
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(profile, { recursive: true, force: true });
      break;
    } catch {
      await sleep(250);
    }
  }
  if (steady < 3) return 'the browser wrote no picture';
  const seen = inspect(file);
  if (seen.curtain > 0.5) return 'the viewer had not reached a final frame, or refused: the picture shows its curtain, with the reason if it gave one';
  if (seen.flat) return 'the picture is one flat colour: WebGL did not draw';
  return null;
}

// ---- main -----------------------------------------------------------------------------------------
if (stopServer) {
  if (existsSync(pidFile)) {
    try {
      process.kill(Number(readFileSync(pidFile, 'utf8')));
      console.log(`stopped the viewer on port ${port}`);
    } catch {
      console.log(`the viewer this script started on port ${port} is no longer running`);
    }
    rmSync(pidFile, { force: true });
  } else console.log(`this script has no viewer of its own on port ${port}`);
  process.exit(0);
}
if (indexOnly) {
  console.log(`contact sheet: ${writeIndex()}`);
  process.exit(0);
}
if (!taxonId) {
  console.error(`usage: npm run portrait -- <taxonId> [--years ${SPECIMEN_YEARS}] [--care trained|untended] [--out out/portraits] [--port 5197] [--only ${SPECIMEN_VIEWS.join(',')}]\n\ntaxa: ${readdirSync(join(ROOT, 'species')).join(', ')}`);
  process.exit(2);
}

// the one taxon's own files, read here so that a fault in another taxon's file does not stop this portrait
const folder = join(ROOT, 'species', taxonId);
if (!existsSync(join(folder, 'taxon.json'))) throw new Error(`there is no taxon "${taxonId}" under species/`);
if (!existsSync(join(folder, 'model.json'))) throw new Error(`${taxonId} has no growth model (species/${taxonId}/model.json), so the engine cannot grow it and there is nothing to take a portrait of`);
const taxa: Growable = new Map([
  [taxonId, { profile: parseTaxon(JSON.parse(readFileSync(join(folder, 'taxon.json'), 'utf8')), `species/${taxonId}/taxon.json`), model: parseGrowthModel(JSON.parse(readFileSync(join(folder, 'model.json'), 'utf8')), `species/${taxonId}/model.json`) }],
]);
const frame = readBower(JSON.parse(readFileSync(join(ROOT, 'examples/specimen-frame.bower.json'), 'utf8')), 'examples/specimen-frame.bower.json');
const t0 = Date.now();
const { sim } = growPlanting({ bower: frame.bower, plan: specimenPlan(taxonId), viewpoints: frame.viewpoints }, taxa, care, years);
const data = toRenderData(sim);
const dates = portraitDates(data);
const label = data.plants[0]?.label ?? taxonId;
console.log(`${label}: grown ${care} for ${years} years in ${Date.now() - t0} ms: ${data.stems.length} stems, ${data.leaves.length} leaves, ${data.flowers.length} flowers, ${data.fruits.length} fruit, ${data.appendages.length} holds and prickles`);

// what to take: the whole plant in four seasons, then each close view on its day
const wanted: Still[] = [];
if (only.includes('whole')) for (const season of SEASONS) wanted.push({ view: 'whole', season, date: dates.seasons[season], file: null, note: dates.notes[season] ?? '', ok: false });
for (const view of ['leaf', 'flower', 'fruit', 'stem', 'hold'] as const) if (only.includes(view)) wanted.push({ view, date: dates[view], file: null, note: dates.notes[view] ?? '', ok: false });

const browser = [process.env['PORTRAIT_BROWSER'], ...BROWSERS].find((path): path is string => !!path && existsSync(path));
if (!browser) throw new Error(`no browser found to take the stills with. Looked for:\n  ${BROWSERS.join('\n  ')}\nSet PORTRAIT_BROWSER to the path of Edge or Chrome.`);
await ensureViewer();

const dir = join(out, taxonId);
mkdirSync(dir, { recursive: true });
// stills of these views from an earlier portrait go: their dates may no longer be the days of this run
for (const name of readdirSync(dir)) if (only.some((view) => new RegExp(`^${view}-\\d{4}-\\d{2}-\\d{2}\\.png$`).test(name))) rmSync(join(dir, name));

// one picture for each file: two seasons whose day is the same day share theirs
const pictures = new Map<string, Promise<string | null>>();
const urlOf = (still: Still) => `http://localhost:${port}/?specimen=${taxonId}&years=${years}&date=${still.date}&view=${still.view}&bare=1&still=1${care === 'untended' ? '&care=untended' : ''}`;
const queue = wanted.filter((s) => s.date);
let failed = 0;
async function take(still: Still): Promise<void> {
  const fileName = `${still.view}-${still.date}.png`;
  const file = join(dir, fileName);
  let picture = pictures.get(fileName);
  if (!picture) {
    picture = (async () => {
      const why = await shoot(browser!, urlOf(still), file, budgetMs);
      // a machine busy with other portraits may need longer: once more, with three times the budget
      return why ? shoot(browser!, urlOf(still), file, budgetMs * 3) : null;
    })();
    pictures.set(fileName, picture);
  }
  const why = await picture;
  still.file = why && !existsSync(file) ? null : fileName;
  still.ok = !why;
  if (why) {
    failed++;
    still.note = why;
  }
}
// a few browsers at a time
await Promise.all(
  Array.from({ length: jobs }, async () => {
    for (let still = queue.shift(); still; still = queue.shift()) await take(still);
  }),
);
for (const still of wanted) {
  const name = (still.season ?? still.view).padEnd(7);
  if (!still.date) console.log(`  ${name} no still: ${still.note}`);
  else if (still.ok) console.log(`  ${name} ${join(dir, still.file!)}\n          ${still.note}`);
  else console.log(`  ${name} FAILED ${still.file ? join(dir, still.file) : ''}\n          ${still.note}\n          look at it in a browser: ${urlOf(still).replace('&still=1', '')}`);
}

// views not taken this time keep what an earlier portrait recorded for them
const manifestFile = join(dir, 'portrait.json');
const before: Still[] = existsSync(manifestFile) ? (JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest).stills : [];
const kept = before.filter((s) => !only.includes(s.view) && (!s.file || existsSync(join(dir, s.file))));
const order = (s: Still) => (s.view === 'whole' ? SEASONS.indexOf(s.season ?? 'winter') : 3 + SPECIMEN_VIEWS.indexOf(s.view));
const manifest: Manifest = { taxonId, label, years, care, taken: new Date().toISOString().slice(0, 16).replace('T', ' '), stills: [...kept, ...wanted].sort((a, b) => order(a) - order(b)) };
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`contact sheet: ${writeIndex()}`);
if (failed) {
  console.error(`${failed} still${failed === 1 ? '' : 's'} could not be taken`);
  process.exit(1);
}
