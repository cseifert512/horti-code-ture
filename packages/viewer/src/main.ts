// Bower viewer: renders a Bower from @horti/core, a design overlay that
// answers reach and material questions from the core, and (as a renderer test)
// a hand-made plant. The viewer holds no growth logic: it reads core data and
// calls core functions.
import * as THREE from 'three';
import { type Bower, type RenderData, type SupportEdge, type Viewpoint, makeHemisphereBower, makeVaultBower } from '@horti/core';
import { ARBOUR_EXAMPLE, DesignDesk, type DesignFile } from './design/open.ts';
import { type ReachView, type StationField, materials, reachView, routeInfo, stationField } from './overlay/model.ts';
import { ReachOverlay } from './overlay/view.ts';
import type { FruitSite } from './plant/adapter.ts';
import { makeTestPlant } from './plant/fixture.ts';
import { type Care, type Planting, canGrow, growDesign, growScenario } from './plant/scenario.ts';
import { shared } from './plant/shaders.ts';
import { PlantView, makePlantMaterials } from './plant/view.ts';
import { renderReport } from './report/panel.ts';
import { makeSiteMaterials, makeStructureMaterials } from './scene/materials.ts';
import { type BuiltSite, buildSite } from './scene/site.ts';
import { DEFAULT_SUN, type ViewPreset, createStage } from './scene/stage.ts';
import { type BuiltStructure, buildStructure } from './structure/build.ts';
import { makeBarkTextures, makeLeafTexture } from './textures.ts';

/** The two reference shells, or a design read from files. */
type BowerKey = 'vault' | 'hemisphere' | 'design';
/** Where the plants shown come from: nowhere, the growth engine, or the hand-made render test. */
type PlantSource = 'none' | 'trained' | 'untended' | 'mixed-trained' | 'mixed-untended' | 'palette-trained' | 'palette-untended' | 'palette-ivy' | 'fixture';
const PLANT_SOURCES: readonly PlantSource[] = ['none', 'trained', 'untended', 'mixed-trained', 'mixed-untended', 'palette-trained', 'palette-untended', 'palette-ivy', 'fixture'];
/** The sources that are scenarios of the growth engine. */
const SCENARIOS: Partial<Record<PlantSource, { planting: Planting; care: Care }>> = {
  trained: { planting: 'wisteria', care: 'trained' },
  untended: { planting: 'wisteria', care: 'untended' },
  'mixed-trained': { planting: 'mixed', care: 'trained' },
  'mixed-untended': { planting: 'mixed', care: 'untended' },
  'palette-trained': { planting: 'palette', care: 'trained' },
  'palette-untended': { planting: 'palette', care: 'untended' },
  'palette-ivy': { planting: 'palette-ivy', care: 'trained' },
};
/** The camera's field of view when it is not standing at one of a report's viewpoints, degrees. */
const FIELD_OF_VIEW = 40;
/** Tells two Bowers apart: a scenario may be grown on a Bower with more root stations than the default. */
const signature = (b: Bower) => `${b.id}|${b.rootStations.map((s) => `${s.id}@${s.entryNodeIds.join('+')}`).join(',')}|${b.graph.edges.size}`;
/** Detail of the organ pools, 0 to 1 (see PlantView.update). */
const PLANT_DETAIL = 0.75;
/** Time-lapse speed, days per second. */
const DAYS_PER_SECOND = 40;
const BOWERS: Record<'vault' | 'hemisphere', () => Bower> = {
  vault: () => makeVaultBower(),
  hemisphere: () => makeHemisphereBower(),
};

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}
const metres = (x: number, digits = 2) => `${x.toFixed(digits)} m`;

const url = new URLSearchParams(location.search);
const canvas = el<HTMLCanvasElement>('scene');

let stage: ReturnType<typeof createStage>;
try {
  stage = createStage(canvas);
} catch (e) {
  const box = el('error');
  box.style.display = 'flex';
  box.textContent = 'This viewer needs WebGL 2, which is not available in this browser.';
  throw e;
}

const structureMaterials = makeStructureMaterials();
const siteMaterials = makeSiteMaterials();
const overlay = new ReachOverlay(el('labels'));
stage.overlayScene.add(overlay.group);

const state = {
  bowerKey: (url.get('bower') === 'hemisphere' ? 'hemisphere' : 'vault') as BowerKey,
  /** Years a design's planting plan is grown for. */
  years: Math.min(30, Math.max(1, Math.round(Number(url.get('years')) || 10))),
  overlay: url.get('overlay') === '1',
  stationId: url.get('station') ?? '',
  budgetM: url.has('budget') ? Number(url.get('budget')) : NaN,
  sun: { ...DEFAULT_SUN },
  orbit: false,
  selected: null as string | null,
  hovered: null as string | null,
  plants: (PLANT_SOURCES.find((p) => p === url.get('plants')) ?? 'none') as PlantSource,
  day: url.has('day') ? Number(url.get('day')) : NaN,
  playing: false,
  wind: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.6,
};

/** The design last opened without fault. A file that is refused leaves it, and the scene, as they were. */
const desk = new DesignDesk();
/** The Bower a key stands for: a reference shell built afresh, or the design that is open. */
const bowerOf = (key: BowerKey): Bower => (key === 'design' ? desk.current!.bower : BOWERS[key]());
/** Whether a choice of plants can be shown on a Bower. A design grows its own planting plan, if it came with one. */
function canShow(source: PlantSource, key: BowerKey): boolean {
  const scenario = SCENARIOS[source];
  if (!scenario) return true;
  if (key === 'design') return scenario.planting === 'wisteria' && !!desk.current?.plan;
  return canGrow(scenario.planting, key);
}

let bower: Bower;
let structure: BuiltStructure | null = null;
let site: BuiltSite | null = null;
let field: StationField;
let view: ReachView;
let plant: PlantView | null = null;
let plantMaterials: ReturnType<typeof makePlantMaterials> | null = null;
let dirty = true;
const invalidate = () => {
  dirty = true;
};

// ---- camera ------------------------------------------------------------------
function defaultView(key: BowerKey, bounds: THREE.Box3): ViewPreset {
  // the prototype's opening view, so the vault can be laid beside it
  if (key === 'vault') return { position: new THREE.Vector3(5.6, 1.9, 7.6), target: new THREE.Vector3(0, 1.9, 0) };
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const distance = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(stage.camera.fov) / 2)) * 0.92;
  const target = new THREE.Vector3(sphere.center.x, bounds.max.y * 0.4, sphere.center.z);
  const dir = new THREE.Vector3(0.74, 0.26, 0.62).normalize();
  return { position: target.clone().addScaledVector(dir, distance), target };
}

function viewFromUrl(): ViewPreset | null {
  const cam = url.get('cam')?.split(',').map(Number);
  if (!cam || cam.length !== 6 || cam.some((n) => !Number.isFinite(n))) return null;
  return { position: new THREE.Vector3(cam[0], cam[1], cam[2]), target: new THREE.Vector3(cam[3], cam[4], cam[5]) };
}

// ---- the Bower ---------------------------------------------------------------
/**
 * Build and show a Bower. `view`: a camera position to move to, 'default' for
 * the opening view of this kind of Bower, or 'keep' to leave the camera alone.
 */
function showStructure(next: Bower, view: ViewPreset | 'default' | 'keep', keepBudget: boolean): void {
  if (structure) {
    stage.scene.remove(structure.group);
    structure.dispose();
  }
  if (site) {
    stage.scene.remove(site.group);
    site.dispose();
  }
  bower = next;
  structure = buildStructure(bower, structureMaterials);
  site = buildSite(bower, structure.feet, siteMaterials);
  stage.scene.add(structure.group, site.group);
  stage.frame(structure.bounds, view === 'keep' ? undefined : view === 'default' ? defaultView(state.bowerKey, structure.bounds) : view);

  el('bower-name').textContent = bower.name;
  const primary = bower.members.filter((m) => m.tier === 'primary').length;
  const cables = bower.supports.filter((s) => s.kind === 'cable').length;
  // a design's primary timber need not be glulam: say what it is where every primary member agrees
  const made = new Set(bower.members.filter((m) => m.tier === 'primary').map((m) => m.material));
  el('stats').textContent = `${primary} ${made.size === 1 && made.has('glulam') ? 'glulam' : 'primary'} members · ${bower.members.length - primary} lattice members · ${cables} steel cables · ${bower.graph.edges.size} plant routes`;

  overlay.setBower(bower);
  const select = el<HTMLSelectElement>('station');
  select.replaceChildren(
    ...bower.rootStations.map((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.note ? `${s.id} · ${s.note}` : s.id;
      return o;
    }),
  );
  state.selected = null;
  state.hovered = null;
  overlay.setSelected(null);
  overlay.setHover(null);
  showMaterials();
  const wanted = bower.rootStations.find((s) => s.id === state.stationId) ?? bower.rootStations[0];
  if (wanted) showStation(wanted.id, !keepBudget);
  invalidate();
}

function showBower(key: BowerKey, opening: ViewPreset | null = null, keepBudget = false, keepDay = false): void {
  if (key === 'design' && !desk.current) return;
  state.bowerKey = key;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-bower]')) b.setAttribute('aria-pressed', String(b.dataset['bower'] === key));
  showStructure(bowerOf(key), opening ?? 'default', keepBudget);
  // on a design, "trained" and "untended" grow the plan it came with; on a shell, wisteria
  const select = el<HTMLSelectElement>('plants');
  for (const o of select.options) {
    const source = o.value as PlantSource;
    o.disabled = !canShow(source, key);
    if (source === 'trained' || source === 'untended') o.textContent = `${key === 'design' ? 'Its planting plan' : 'Wisteria'}, ${source}`;
  }
  // a planting with no scenario on this Bower gives way to the same care of what can be grown here, or to nothing
  const care = SCENARIOS[state.plants]?.care;
  showPlants(canShow(state.plants, key) ? state.plants : care && canShow(care, key) ? care : 'none', keepDay);
  showDesign();
}

// ---- a design read from files -------------------------------------------------------
/** Whether the design section is open although a reference shell is on show: the designer has asked for it. */
let designAsked = false;

/** Show what is known of the design: its name and files, what the core warns of, and why the latest files were refused. */
function showDesign(): void {
  const shown = state.bowerKey === 'design';
  const d = desk.current;
  el('design').hidden = !(shown || designAsked);
  const name = el('design-name');
  name.hidden = !d;
  if (d) {
    name.replaceChildren(d.bower.name, Object.assign(document.createElement('small'), { textContent: `${d.files.bower}${d.files.planting ? ` + ${d.files.planting}` : ' · no planting plan'}${shown ? '' : ' · not on show'}` }));
  }
  el('design-years-field').hidden = !(shown && d?.plan);
  el<HTMLInputElement>('design-years').value = String(state.years);
  const warnings = el('design-warnings');
  warnings.hidden = !(shown && d && d.warnings.length);
  if (d && d.warnings.length) {
    const list = document.createElement('ul');
    for (const w of d.warnings) list.append(Object.assign(document.createElement('li'), { textContent: w }));
    warnings.replaceChildren(Object.assign(document.createElement('b'), { textContent: `${d.warnings.length === 1 ? 'A warning' : `${d.warnings.length} warnings`} from reading the structure` }), list);
  }
  const error = el('design-error');
  error.hidden = !desk.error;
  if (desk.error) error.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'Not opened. The picture is as it was.' }), desk.error);
}

/** Try to open a design. Only one read without fault changes what is on show. */
function openFiles(files: readonly DesignFile[]): void {
  designAsked = true;
  if (!desk.open(files)) {
    showDesign();
    return;
  }
  // a design that comes with a planting plan is shown planted
  if (desk.current!.plan && !SCENARIOS[state.plants]) state.plants = 'trained';
  showBower('design');
}

async function readFiles(list: FileList | null | undefined): Promise<void> {
  if (!list || list.length === 0) return;
  openFiles(await Promise.all([...list].map(async (f) => ({ name: f.name, text: await f.text() }))));
}

el('design-example').addEventListener('click', () => openFiles(ARBOUR_EXAMPLE));
el('design-choose').addEventListener('click', () => el<HTMLInputElement>('design-files').click());
el<HTMLInputElement>('design-files').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  void readFiles(input.files).then(() => {
    input.value = ''; // so that the same files can be chosen again after they are corrected
  });
});
el<HTMLInputElement>('design-years').addEventListener('change', (e) => {
  const years = Math.round(Number((e.target as HTMLInputElement).value));
  state.years = Math.min(30, Math.max(1, Number.isFinite(years) ? years : state.years));
  (e.target as HTMLInputElement).value = String(state.years);
  if (state.bowerKey === 'design' && SCENARIOS[state.plants]) showPlants(state.plants);
});
// files dropped anywhere on the window
const carriesFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragover', (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  el('drop').hidden = false;
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget === null) el('drop').hidden = true;
});
window.addEventListener('drop', (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  el('drop').hidden = true;
  void readFiles(e.dataTransfer?.files);
});

function showMaterials(): void {
  const m = materials(bower);
  el('mat-primary').textContent = metres(m.primaryTimberM, 1);
  el('mat-sub').textContent = metres(m.subLatticeTimberM, 1);
  el('mat-steel').textContent = metres(m.steelCableM, 1);
  const share = m.steelShareOfRoute;
  const split = el('mat-split');
  (split.children[0] as HTMLElement).style.flex = String(Math.max(1 - share, 0.0001));
  (split.children[1] as HTMLElement).style.flex = String(Math.max(share, 0.0001));
  (split.children[1] as HTMLElement).hidden = share <= 0;
  split.setAttribute('aria-label', `Plant route: ${((1 - share) * 100).toFixed(0)}% on timber, ${(share * 100).toFixed(0)}% on steel cable`);
  el('mat-route-timber').textContent = `Route on timber ${metres(m.routeOnTimberM, 1)} · ${((1 - share) * 100).toFixed(0)}%`;
  el('mat-route-steel').textContent = `on steel ${metres(m.routeOnCableM, 1)} · ${(share * 100).toFixed(0)}%`;
}

// ---- reach ---------------------------------------------------------------------
function showStation(stationId: string, resetBudget = false): void {
  state.stationId = stationId;
  field = stationField(bower, stationId);
  overlay.setStation(field);
  el<HTMLSelectElement>('station').value = stationId;
  const station = bower.rootStations.find((s) => s.id === stationId);
  el('station-note').textContent = station ? `Soil volume ${station.soilVolumeM3.value === null ? 'unknown' : `${station.soilVolumeM3.value} m3`} · irrigation ${station.irrigated.value === null ? 'unknown' : station.irrigated.value ? 'yes' : 'no'}` : '';

  const slider = el<HTMLInputElement>('budget');
  slider.max = String(Math.ceil(field.farthestM + 0.5));
  const route = field.summit.route;
  el('chip-height').textContent = `= height of the highest node · ${metres(field.summit.heightM)}`;
  const chipRoute = el<HTMLButtonElement>('chip-route');
  chipRoute.textContent = route ? `= route to it · ${metres(route.length)}` : 'no route to the highest node';
  chipRoute.disabled = !route;
  // open on the trap the overlay is there to show: a budget equal to the height of the top
  showBudget(resetBudget || !Number.isFinite(state.budgetM) ? field.summit.heightM : state.budgetM);
}

function showBudget(budgetM: number): void {
  state.budgetM = Math.max(0, budgetM);
  view = reachView(bower, field, state.budgetM);
  overlay.setBudget(state.budgetM);
  const r = view.report;
  const slider = el<HTMLInputElement>('budget');
  slider.value = String(state.budgetM);
  const wholeTenth = Math.abs(state.budgetM * 10 - Math.round(state.budgetM * 10)) < 1e-6;
  el('budget-out').textContent = metres(state.budgetM, wholeTenth ? 1 : 2);

  const scale = Math.max(field.farthestM, 0.001);
  const at = Math.min(1, state.budgetM / scale);
  el('legend-budget').style.left = `${at * 100}%`;
  el('legend-beyond').style.width = `${(1 - at) * 100}%`;
  const label = el('legend-budget-label');
  label.style.left = `${at * 100}%`;
  label.className = `at${at < 0.14 ? ' left' : at > 0.86 ? ' right' : ''}`;
  label.textContent = `budget ${metres(state.budgetM, 1)}`;
  el('legend-max').textContent = `${metres(scale, 1)} farthest node`;
  const summitMark = el('legend-summit');
  const route = field.summit.route;
  summitMark.hidden = !route;
  if (route) summitMark.style.left = `${Math.min(1, route.length / scale) * 100}%`;

  el('tile-nodes').textContent = String(r.nodesReached);
  el('tile-nodes-of').textContent = `of ${r.nodesTotal}`;
  el('tile-route').textContent = metres(r.routeReachedM, 1);
  el('tile-route-of').textContent = `of ${metres(r.routeTotalM, 1)} in all`;
  el('tile-height').textContent = metres(r.highestReachedM);
  el('tile-height-of').textContent = `highest node ${metres(r.highestNodeM)}`;
  el('tile-summit').textContent = route ? metres(route.length) : 'no route';
  el('tile-summit-of').textContent = !route ? '' : view.summitReached ? 'within the budget' : `${metres(-(view.marginM ?? 0))} beyond the budget`;

  const verdict = el('verdict');
  verdict.classList.toggle('reached', view.summitReached);
  const top = `The highest node is ${metres(field.summit.heightM)} above ground`;
  if (!route) verdict.innerHTML = `<b>No route.</b> ${top}, and nothing leads to it from this station.`;
  else if (view.summitReached) verdict.innerHTML = `<b>Reaches the highest node</b>, with ${metres(Math.max(0, view.marginM ?? 0))} of route to spare. ${top} and ${metres(route.length)} away by route.`;
  else verdict.innerHTML = `<b>${metres(-(view.marginM ?? 0))} of route short of the highest node.</b> ${top} but ${metres(route.length)} away by route. This budget gets ${metres(r.highestReachedM)} up.`;
  overlay.setSummitText(route ? `highest node · ${metres(field.summit.heightM)} up · ${metres(route.length)} of route` : `highest node · ${metres(field.summit.heightM)} up · no route`, view.summitReached);
  showRoute();
  invalidate();
}

function kindLabel(kind: SupportEdge['kind']): string {
  return kind === 'timber' ? 'timber' : kind === 'cable' ? 'steel cable' : 'tie point';
}

function showRoute(): void {
  const box = el('route-info');
  const id = state.selected ?? state.hovered;
  const edge = id ? bower.graph.edges.get(id) : undefined;
  if (!edge) {
    box.innerHTML = '<p class="note">Hover over a route, or click one to keep it.</p>';
    return;
  }
  const info = routeInfo(field, edge);
  const where =
    info.nearM === null || info.farM === null
      ? 'cannot be reached from this station'
      : info.farM <= state.budgetM
        ? 'within the budget'
        : info.nearM >= state.budgetM
          ? 'beyond the budget'
          : `the budget runs out ${metres(state.budgetM - info.nearM)} along it`;
  const rows: [string, string][] = [
    ['Route', info.id],
    ['Kind', kindLabel(info.kind)],
    ['Lies on', info.hostId],
    ['Grasp diameter', `${info.gripDiameterMm.toFixed(0)} mm${info.kind === 'timber' ? ' (round bar of equal girth)' : ''}`],
    ['Length', metres(info.lengthM)],
    ['From the station', info.nearM === null || info.farM === null ? 'no route' : `${metres(info.nearM)} to ${metres(info.farM)}`],
    ['At this budget', where],
  ];
  const table = document.createElement('table');
  table.className = 'kv';
  for (const [k, v] of rows) {
    const tr = table.insertRow();
    const th = document.createElement('th');
    th.textContent = k;
    tr.append(th);
    tr.insertCell().textContent = v;
  }
  box.replaceChildren(table);
  if (state.selected) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'Kept. Click it again, or empty space, to let go.';
    box.append(p);
  }
}

function showOverlay(on: boolean): void {
  state.overlay = on;
  overlay.setVisible(on);
  el('overlay-panel').hidden = !on;
  el<HTMLInputElement>('overlay-toggle').checked = on;
  if (!on) el('tip').hidden = true;
  invalidate();
}

// ---- plants --------------------------------------------------------------------
/** A day worth opening on: the middle of flowering in the last year that has flowers, else late in the run. */
function openingDay(data: RenderData): number {
  const lastYear = data.flowers.reduce((y, f) => Math.max(y, f.year), -Infinity);
  const days = data.flowers
    .filter((f) => f.year === lastYear && f.spentDay >= 0)
    .map((f) => f.openDay + 0.45 * (f.spentDay - f.openDay))
    .sort((a, b) => a - b);
  const median = days[Math.floor(days.length / 2)];
  return Math.round(median ?? Math.max(0, data.lastDay - 150));
}

function showPlants(source: PlantSource, keepDay = false): void {
  if (plant) {
    stage.scene.remove(plant.group);
    plant.dispose();
    plant = null;
  }
  state.plants = source;
  state.playing = false;
  el<HTMLSelectElement>('plants').value = source;
  document.body.classList.toggle('plants', source !== 'none');
  el('plant-bar').hidden = source === 'none';
  el('log').hidden = true;
  el('report').hidden = true;
  const asked = ++reportAsked;
  stage.invalidateShadows();
  invalidate();
  // a scenario is drawn on the Bower it was grown on; anything else on the default one
  const scenario = SCENARIOS[source];
  const design = state.bowerKey === 'design' ? desk.current : null;
  const run = !scenario
    ? null
    : state.bowerKey === 'design'
      ? design?.plan
        ? growDesign({ bower: design.bower, plan: design.plan, viewpoints: design.viewpoints }, scenario.care, state.years)
        : null
      : growScenario(scenario.planting, state.bowerKey, scenario.care);
  const on = run?.bower ?? bowerOf(state.bowerKey);
  if (signature(on) !== signature(bower)) showStructure(on, 'keep', true);
  if (source === 'none') return;

  let data: RenderData;
  let fruit: FruitSite[] = [];
  if (run) data = run.data;
  else ({ data, fruit } = makeTestPlant(bower));
  plantMaterials ??= makePlantMaterials({ bark: makeBarkTextures(), leafTex: makeLeafTexture() });
  plant = new PlantView(data, plantMaterials, { fruit });
  stage.scene.add(plant.group);

  const slider = el<HTMLInputElement>('plant-day');
  slider.min = String(plant.timeline.firstDay);
  slider.max = String(plant.timeline.lastDay);
  const taxa = data.plants.map((p) => p.label).filter((l, i, all) => all.indexOf(l) === i);
  // a long palette is counted rather than listed: the calendar beside it names every plant
  const labels = taxa.length > 4 ? [`${data.plants.length} plants of ${taxa.length} taxa`] : taxa;
  const missing = plant.provisionalLooks.filter((l, i, all) => all.indexOf(l) === i);
  const flowerless = plant.withoutFlowers.filter((l, i, all) => all.indexOf(l) === i);
  const stemsOnly =
    (missing.length ? ` Provisional look (a plain stand-in leaf, no flowers), for want of models of its own: ${missing.join(', ')}.` : '') +
    (flowerless.length ? ` Shown without its flowers, for want of a flower model: ${flowerless.join(', ')}.` : '');
  // how many of the numbers behind the run have each evidence status; "measured" is always said, even when none is
  const counted = Object.entries(data.assumptions).filter(([status, n]) => n > 0 || status === 'measured');
  const behind = counted.some(([, n]) => n > 0) ? ` Numbers behind this run: ${counted.map(([status, n]) => `${n} ${status.replaceAll('_', ' ')}`).join(', ')}.` : '';
  el('plant-statement').textContent = `${labels.join(', ')} · ${data.scenario}. ${data.statement}${behind}${stemsOnly}`;
  showLog();
  clearTimeline();
  showDay(keepDay && Number.isFinite(state.day) ? state.day : openingDay(data));

  // the design report takes about as long as the run: read it once the picture is up
  if (run) {
    const box = el('report');
    box.hidden = false;
    box.replaceChildren(Object.assign(document.createElement('p'), { className: 'note', textContent: 'Reading the run for its design report...' }));
    setTimeout(() => {
      if (asked !== reportAsked || !plant) return;
      const timeline = plant.timeline;
      renderReport(box, run.report(), {
        goTo: (iso) => {
          state.playing = false;
          showDay(timeline.calendar.dayOf(iso));
        },
        standAt,
      });
      invalidate();
    }, 60);
  }
}

/** Keep the side columns clear of the timeline, whose height follows the length of its statement. */
function clearTimeline(): void {
  document.body.style.setProperty('--bar-clear', `${el('plant-bar').offsetHeight + 30}px`);
}

/** Counts requests for a report, so that one that arrives after the plants have changed is dropped. */
let reportAsked = 0;

/** Stand where one of a report's viewpoints stands, looking where it looks, with its field of view. */
function standAt(viewpoint: Viewpoint): void {
  stage.controls.maxPolarAngle = Math.PI * 0.98; // a visitor inside looks up
  stage.controls.minDistance = 0.05;
  stage.camera.fov = viewpoint.fovDeg;
  stage.camera.updateProjectionMatrix();
  stage.camera.position.set(viewpoint.eye.x, viewpoint.eye.z, -viewpoint.eye.y);
  stage.controls.target.set(viewpoint.target.x, viewpoint.target.z, -viewpoint.target.y);
  stage.controls.update();
  invalidate();
}

// ---- the gardener's log, beside the picture -----------------------------------------
/** Fill the log with every entry of the run; an entry takes the timeline to its day. */
function showLog(): void {
  const list = el('log-list');
  const events = plant?.timeline.events ?? [];
  el('log').hidden = events.length === 0;
  logMarked = -1;
  list.replaceChildren(
    ...events.map((e) => {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const when = document.createElement('time');
      when.dateTime = e.date;
      when.textContent = `${e.date} · ${e.plantId}`;
      button.append(when, e.outcome);
      button.addEventListener('click', () => {
        state.playing = false;
        showDay(e.day);
      });
      li.append(button);
      return li;
    }),
  );
}

/** Entries not yet made are dimmed; the latest one made is marked and kept in view. */
let logMarked = -1;
function markLog(): void {
  if (!plant) return;
  const made = plant.timeline.eventsBy(state.day);
  if (made === logMarked) return;
  logMarked = made;
  const items = el('log-list').children;
  for (let i = 0; i < items.length; i++) {
    items[i]!.classList.toggle('future', i >= made);
    items[i]!.classList.toggle('latest', i === made - 1);
  }
  const list = el('log-list');
  const latest = items[Math.max(0, made - 1)] as HTMLElement | undefined;
  // keep the latest entry in view without moving the page
  if (latest) list.scrollTop = Math.max(0, latest.offsetTop - list.offsetTop - list.clientHeight / 2 + latest.offsetHeight / 2);
}

let lastPlantUpdate = 0;
function showDay(day: number): void {
  if (!plant) return;
  const t = plant.timeline;
  state.day = Math.min(t.lastDay, Math.max(t.firstDay, day));
  plant.update(stage.camera, state.day, PLANT_DETAIL);
  lastPlantUpdate = performance.now();
  el<HTMLInputElement>('plant-day').value = String(Math.round(state.day));
  el('plant-date').textContent = t.dateLabel(state.day);
  const stats = plant.stats();
  // "in flower" is what the core counts as open, so it agrees with the calendar beside it; buds are said apart
  el('plant-caption').textContent =
    `${stats.stems.toLocaleString()} stems · ${stats.leaves.toLocaleString()} leaves · ${stats.flowers.toLocaleString()} in flower` +
    `${stats.buds ? ` · ${stats.buds.toLocaleString()} in bud` : ''}${stats.fruit ? ` · ${stats.fruit} fruit` : ''}`;
  markLog();
  el('play').innerHTML = state.playing ? '&#10073;&#10073;' : '&#9654;';
  stage.invalidateShadows();
  invalidate();
}

el<HTMLSelectElement>('plants').addEventListener('change', (e) => showPlants((e.target as HTMLSelectElement).value as PlantSource));
el<HTMLInputElement>('plant-day').addEventListener('input', (e) => {
  state.playing = false;
  showDay(Number((e.target as HTMLInputElement).value));
});
el('play').addEventListener('click', () => {
  if (!plant) return;
  // from the end, play again from planting day
  if (!state.playing && state.day >= plant.timeline.lastDay - 1) state.day = plant.timeline.firstDay;
  state.playing = !state.playing;
  showDay(state.day);
});
{
  const wind = el<HTMLInputElement>('wind');
  wind.value = String(state.wind);
  el('wind-out').textContent = state.wind.toFixed(2);
  wind.addEventListener('input', () => {
    state.wind = Number(wind.value);
    el('wind-out').textContent = state.wind.toFixed(2);
  });
}

// ---- controls ------------------------------------------------------------------
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-bower]')) {
  b.addEventListener('click', () => {
    const key = b.dataset['bower'] as BowerKey;
    // "A design..." opens the place to choose one; it shows a design only once one has been read
    designAsked = key === 'design';
    if (key !== state.bowerKey) showBower(key);
    showDesign();
  });
}
el<HTMLInputElement>('overlay-toggle').addEventListener('change', (e) => showOverlay((e.target as HTMLInputElement).checked));
el<HTMLSelectElement>('station').addEventListener('change', (e) => showStation((e.target as HTMLSelectElement).value));
overlay.whenStationPicked((id) => showStation(id));
el<HTMLInputElement>('budget').addEventListener('input', (e) => showBudget(Number((e.target as HTMLInputElement).value)));
el('chip-height').addEventListener('click', () => showBudget(field.summit.heightM));
el('chip-route').addEventListener('click', () => {
  if (field.summit.route) showBudget(field.summit.route.length);
});

function bindSun(): void {
  const elevation = el<HTMLInputElement>('sun-elevation');
  const azimuth = el<HTMLInputElement>('sun-azimuth');
  const show = () => {
    el('sun-elevation-out').textContent = `${state.sun.elevation}°`;
    el('sun-azimuth-out').textContent = `${state.sun.azimuth}°`;
  };
  elevation.value = String(state.sun.elevation);
  azimuth.value = String(state.sun.azimuth);
  show();
  const apply = () => {
    state.sun = { elevation: Number(elevation.value), azimuth: Number(azimuth.value) };
    stage.setSun(state.sun);
    show();
    invalidate();
  };
  elevation.addEventListener('input', apply);
  azimuth.addEventListener('input', apply);
}
bindSun();
el<HTMLInputElement>('orbit').addEventListener('change', (e) => {
  state.orbit = (e.target as HTMLInputElement).checked;
  stage.controls.autoRotate = state.orbit;
});
el('reset-view').addEventListener('click', () => {
  stage.controls.maxPolarAngle = Math.PI * 0.53;
  stage.controls.minDistance = 0.3;
  stage.camera.fov = FIELD_OF_VIEW;
  stage.camera.updateProjectionMatrix();
  if (structure) stage.frame(structure.bounds, defaultView(state.bowerKey, structure.bounds));
  invalidate();
});
el('save-image').addEventListener('click', () => {
  render();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${bower.id}${state.overlay ? '-overlay' : ''}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

/** Whether the keyboard is being used to write something: only then are the letter keys left alone. */
function writing(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'file', 'color'].includes(target.type);
}
let focusBeforeBare: HTMLElement | null = null;
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || writing(e.target)) return;
  // H and O work wherever the focus is. On a list they would otherwise jump to an entry beginning with that letter.
  if (e.code === 'KeyH') {
    e.preventDefault();
    // a hidden control cannot hold the focus: remember where it was, and give it back with the interface
    const hiding = !document.body.classList.contains('bare');
    if (hiding) focusBeforeBare = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    document.body.classList.toggle('bare');
    if (!hiding) focusBeforeBare?.focus({ preventScroll: true });
    invalidate();
  } else if (e.code === 'KeyO') {
    e.preventDefault();
    showOverlay(!state.overlay);
  } else if (e.code === 'Space' && plant && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement)) {
    // the space bar keeps its own meaning on a button, a list or a slider
    e.preventDefault();
    el('play').click();
  }
});

// ---- hover and click on routes ---------------------------------------------------
const tip = el('tip');
let pressAt: { x: number; y: number } | null = null;
function hoverAt(x: number, y: number): void {
  const edge = state.overlay ? overlay.pick(stage.camera, x, y, window.innerWidth, window.innerHeight) : null;
  const id = edge?.id ?? null;
  if (id !== state.hovered) {
    state.hovered = id;
    overlay.setHover(id);
    showRoute();
    invalidate();
  }
  canvas.style.cursor = edge ? 'pointer' : '';
  tip.hidden = !edge;
  if (edge) {
    tip.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = edge.id;
    tip.append(b, `${kindLabel(edge.kind)} · grasp ${edge.gripDiameterMm.toFixed(0)} mm · ${metres(edge.curve.length)}`);
    const w = tip.offsetWidth;
    tip.style.transform = `translate(${Math.min(x + 16, window.innerWidth - w - 8)}px, ${Math.max(8, y - 44)}px)`;
  }
}
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons === 0) hoverAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => {
  tip.hidden = true;
  if (state.hovered) {
    state.hovered = null;
    overlay.setHover(null);
    showRoute();
    invalidate();
  }
});
canvas.addEventListener('pointerdown', (e) => {
  pressAt = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  const moved = pressAt ? Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) : Infinity;
  pressAt = null;
  if (!state.overlay || moved > 4) return;
  const edge = overlay.pick(stage.camera, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
  state.selected = edge && edge.id !== state.selected ? edge.id : null;
  overlay.setSelected(state.selected);
  showRoute();
  invalidate();
});

// ---- loop ------------------------------------------------------------------------
stage.controls.addEventListener('change', invalidate);

/** Shift the picture so the subject sits in the part of the window the overlay panel leaves free. */
function applyViewOffset(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const right = el('right');
  const shown = state.overlay || !el('report').hidden;
  const covered = shown && !document.body.classList.contains('bare') && w > 760 ? right.offsetWidth + 20 : 0;
  if (covered > 0) stage.camera.setViewOffset(w, h, covered / 2, 0, w, h);
  else stage.camera.clearViewOffset();
}

let lastRender = 0;
function render(): void {
  applyViewOffset();
  overlay.update(stage.camera, window.innerWidth, window.innerHeight, stage.renderer.getPixelRatio());
  stage.render();
  lastRender = performance.now();
}

// ?bower=arbour opens the example design, planted unless the address says otherwise
if (url.get('bower') === 'arbour' && desk.open(ARBOUR_EXAMPLE)) {
  state.bowerKey = 'design';
  if (!url.has('plants')) state.plants = 'trained';
}
showBower(state.bowerKey, viewFromUrl(), Number.isFinite(state.budgetM), true);
showOverlay(state.overlay);
if (url.get('ui') === '0') document.body.classList.add('bare');

const timer = new THREE.Timer();
const sunView = new THREE.Vector3();
let frameNo = 0;
stage.renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  frameNo++;
  stage.controls.update();
  if (stage.syncSize()) {
    dirty = true;
    if (plant) clearTimeline();
  }

  if (plant) {
    // living things move: wind, and the time-lapse while it plays
    shared.uTime.value += dt;
    shared.uWind.value += (state.wind - shared.uWind.value) * Math.min(1, dt * 3);
    shared.uSunColor.value.copy(stage.sun.color).multiplyScalar(stage.sun.intensity * 0.32);
    shared.uSunDirView.value.copy(sunView.copy(stage.sunDir).transformDirection(stage.camera.matrixWorldInverse));
    if (state.playing) {
      const next = state.day + dt * DAYS_PER_SECOND;
      if (next >= plant.timeline.lastDay) state.playing = false;
      showDay(next);
    } else if (performance.now() - lastPlantUpdate > 180) {
      // level of detail follows the camera
      plant.update(stage.camera, state.day, PLANT_DETAIL);
      lastPlantUpdate = performance.now();
    }
    if (frameNo % 2 === 0 && shared.uWind.value > 0.001) stage.invalidateShadows();
    dirty = true;
  }

  // nothing moves in a bare structure, so it is drawn on demand, with a slow
  // heartbeat so that screen capture always finds a fresh frame
  if (!dirty && performance.now() - lastRender < 500) return;
  dirty = false;
  render();
});

// handy for debugging and screenshots
Object.assign(window, {
  __bower: {
    THREE,
    stage,
    overlay,
    state,
    showBower,
    showStation,
    showBudget,
    showOverlay,
    showPlants,
    showDay,
    openFiles,
    desk,
    invalidate,
    get plant() {
      return plant;
    },
    get bower() {
      return bower;
    },
    get structure() {
      return structure;
    },
    get field() {
      return field;
    },
    get view() {
      return view;
    },
  },
});
