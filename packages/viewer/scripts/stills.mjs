// Looks at the viewer the way a client's screen would: opens it in a headless
// Microsoft Edge or Chrome, sets each reference picture up, saves it as a PNG,
// and (with --measure) times the frames. No dependencies: Node's own fetch and
// WebSocket, talking to the browser over the DevTools protocol.
//
//   node packages/viewer/scripts/stills.mjs <out-dir> <tag> [--port 5196] [--measure] [--only vault|hemisphere]
//       [--size 1600x900] [--hour 11] [--export 3840x2160]
//
// The viewer must already be running (npm run viewer:dev, or a launch entry).
// <tag> goes into every file name, so a set taken before a change can sit
// beside the set taken after it.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const port = Number(flag('port', 5196));
const [width, height] = flag('size', '1600x900').split('x').map(Number);
const only = flag('only', '');
const hour = flag('hour', '');
const exportSize = flag('export', '');
const measure = has('measure');
const [outArg, tag] = args;
if (!outArg || !tag) {
  console.error('usage: node packages/viewer/scripts/stills.mjs <out-dir> <tag> [--port 5196] [--measure] [--only vault|hemisphere] [--size 1600x900] [--hour 11] [--export 3840x2160]');
  process.exit(2);
}
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

/** The reference pictures: each scene in May and in January of its last full year. */
const SCENES = [
  { key: 'vault', name: 'vault-mixed', query: 'bower=vault&plants=mixed-trained&ui=0', dates: { may: '2036-05-15', jan: '2036-01-15' } },
  { key: 'hemisphere', name: 'hemisphere-palette', query: 'bower=hemisphere&plants=palette-trained&ui=0', dates: { may: '2038-05-15', jan: '2038-01-15' } },
].filter((s) => !only || s.key === only);

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const exe = process.env.BROWSER_EXE ?? BROWSERS.find((p) => existsSync(p));
if (!exe) {
  console.error('no Edge or Chrome found: set BROWSER_EXE to a Chromium browser');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const debugPort = 9346 + Math.floor(Math.random() * 200);
const profile = mkdtempSync(join(tmpdir(), 'bower-stills-'));
const browser = spawn(exe, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--ignore-gpu-blocklist', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });

let ws;
const problems = [];
async function connect() {
  let target;
  for (let i = 0; i < 60; i++) {
    try {
      target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!target) throw new Error('the browser did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve: ok, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else ok(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) problems.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    else if (m.method === 'Log.entryAdded' && (m.params.entry.level === 'error' || m.params.entry.level === 'warning')) problems.push(`log.${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  };
}
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((ok, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: ok, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const js = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64'));
  console.log(`  ${name}.png`);
};

/** Frame intervals of the page's own animation loop over a stretch of wall-clock time. */
const frames = (ms) =>
  js(`new Promise((resolve) => { const d = []; let last = performance.now(); const t0 = last; const tick = () => { const now = performance.now(); d.push(now - last); last = now; if (now - t0 < ${ms}) requestAnimationFrame(tick); else { d.sort((a, b) => a - b); resolve({ frames: d.length, medianMs: +d[Math.floor(d.length / 2)].toFixed(1), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(1), worstMs: +d[d.length - 1].toFixed(1), perSecond: +(d.length / ((now - t0) / 1000)).toFixed(1) }); } }; requestAnimationFrame(tick); })`);

/**
 * Time to draw one frame with the GPU made to finish it (a one-pixel read
 * back), which the animation loop's own rate hides behind the display's.
 * `step` days are added to the clock before each frame: 0 times drawing alone,
 * anything else times a scrub of the timeline.
 */
const drawTime = (n, step) =>
  js(`(() => { const B = __bower; const gl = B.stage.renderer.getContext(); const px = new Uint8Array(4); const day0 = B.state.day; const t = []; for (let i = 0; i < ${n}; i++) { const t0 = performance.now(); if (${step}) B.showDay(day0 - i * ${step}); B.stage.invalidateShadows(); B.stage.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - t0); } B.showDay(day0); t.sort((a, b) => a - b); return { medianMs: +t[Math.floor(t.length / 2)].toFixed(1), p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(1), worstMs: +t[t.length - 1].toFixed(1) }; })()`);

const report = { tag, size: [width, height], scenes: {}, problems };
try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (exportSize) await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out }).catch(() => {});

  for (const scene of SCENES) {
    console.log(`${scene.name} (${tag})`);
    await send('Page.navigate', { url: `http://localhost:${port}/?${scene.query}` });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(250);
      ready = await js(`!!(window.__bower && window.__bower.plant && document.querySelector('#report table.calendar'))`).catch(() => false);
    }
    if (!ready) throw new Error(`${scene.name}: the viewer did not come up on port ${port}`);
    const info = await js(`(() => { const B = __bower; const gl = B.stage.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', pixelRatio: devicePixelRatio, triangles: B.stage.renderer.info.render.triangles, calls: B.stage.renderer.info.render.calls }; })()`);
    const entry = (report.scenes[scene.name] = { ...info, stills: {} });

    for (const [season, iso] of Object.entries(scene.dates)) {
      const stats = await js(`(() => { const B = __bower; const t = B.plant.timeline; if (B.setHour && ${JSON.stringify(hour)} !== '') B.setHour(${Number(hour) || 0}); B.showDay(t.calendar.dayOf('${iso}')); return { date: '${iso}', ...B.plant.stats(), sun: B.sunNow ? B.sunNow() : null }; })()`);
      await sleep(1500);
      await shot(`${scene.name}-${season}-${tag}`);
      // the same day from where the first of the scenario's visitors stands
      const stood = await js(`(() => { const b = document.querySelector('#report .where'); if (!b) return false; b.click(); return true; })()`);
      if (stood) {
        await sleep(1200);
        await shot(`${scene.name}-${season}-visitor-${tag}`);
        await js(`document.getElementById('reset-view').click()`);
        await sleep(300);
      }
      entry.stills[season] = stats;
      if (exportSize && season === 'may') {
        const [w, h] = exportSize.split('x').map(Number);
        const made = await js(`(async () => { const B = __bower; if (!B.exportStill) return 'this viewer has no still export'; const t0 = performance.now(); const blob = await B.exportStill({ width: ${w}, height: ${h} }); const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); window.__still = btoa(s); return { bytes: buf.length, ms: Math.round(performance.now() - t0) }; })()`);
        if (typeof made === 'object') {
          const data = await js(`window.__still`);
          writeFileSync(join(out, `${scene.name}-${season}-export-${w}x${h}-${tag}.png`), Buffer.from(data, 'base64'));
          console.log(`  ${scene.name}-${season}-export-${w}x${h}-${tag}.png (${(made.bytes / 1e6).toFixed(1)} MB in ${made.ms} ms)`);
          entry.export = { width: w, height: h, ...made };
          await js(`delete window.__still`);
        } else entry.export = made;
      }
    }

    if (measure) {
      await js(`(() => { const B = __bower; B.showDay(B.plant.timeline.calendar.dayOf('${scene.dates.may}')); })()`);
      await sleep(800);
      const m = (entry.frameTime = {});
      m.idle = await frames(4000);
      m.draw = await drawTime(40, 0);
      m.scrub = await drawTime(60, 3);
      // a year of playback, as a visitor to the page would watch it
      const year = scene.dates.may.slice(0, 4);
      await js(`(() => { const B = __bower; B.showDay(B.plant.timeline.calendar.dayOf('${year}-03-01')); document.getElementById('play').click(); })()`);
      m.playing = await frames(6000);
      await js(`(() => { if (__bower.state.playing) document.getElementById('play').click(); })()`);
      m.triangles = await js(`__bower.stage.renderer.info.render.triangles`);
      console.log(`  frame time: ${JSON.stringify(m)}`);
    }
  }
  writeFileSync(join(out, `stills-${tag}.json`), JSON.stringify(report, null, 2));
  if (problems.length) console.log(`problems reported by the page:\n  ${[...new Set(problems)].join('\n  ')}`);
  else console.log('the page reported no errors or warnings');
} finally {
  try {
    await send('Browser.close');
  } catch {
    browser.kill();
  }
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // the browser may still hold its profile for a moment; it is in the temp folder either way
  }
}
