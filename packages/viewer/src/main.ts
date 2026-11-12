// Bower viewer: renders a Bower from @horti/core, a design overlay that
// answers reach and material questions from the core, the plants the engine
// grows on it, and (as a renderer test) a hand-made plant. It can also show one
// plant of one taxon closely, on a small standard frame (?specimen=<taxonId>).
// The viewer holds no growth logic: it reads core data and calls core functions.
import * as THREE from 'three';
import { type Bower, Calendar, DEFAULT_SITE, type DesignReport, type ExposureField, HEMISPHERE_VIEWPOINTS, type RenderData, type Site, type SupportEdge, VAULT_VIEWPOINTS, type Viewpoint, compassWords, exposureField, foliageFromRenderData, makeHemisphereBower, makeVaultBower, sunAt } from '@horti/core';
import yardBower from '../../../examples/arbour-in-a-yard.bower.json?raw';
import arbourPlanting from '../../../examples/arbour.planting.json?raw';
import specimenFrame from '../../../examples/specimen-frame.bower.json?raw';
import { ARBOUR_EXAMPLE, DesignDesk, type DesignFile, type OpenedDesign } from './design/open.ts';
import { MAX_YEARS, MIN_YEARS, type PickerChoice, encodePicks, pickerShell, planFromPicks, plantingFileName, plantingFileText, readPickerAddress, stationsOf, structureFileName, structureFileText, taxaOffered, writePickerAddress } from './design/picker.ts';
import { type ReachView, type StationField, materials, reachView, routeInfo, stationField } from './overlay/model.ts';
import { ExposureOverlay, type LightMeasure, type LightMonth, type LightScale } from './overlay/exposure.ts';
import { ReachOverlay } from './overlay/view.ts';
import { makeTestPlant } from './plant/fixture.ts';
import { loadLooks, lookFault, lookFor } from './plant/registry.ts';
import { type Care, type Planting, SPECIES_IDS, type ScenarioRun, canGrow, growDesign, growFault, growScenario, growable } from './plant/scenario.ts';
import { shared } from './plant/shaders.ts';
import { PlantView, makePlantMaterials } from './plant/view.ts';
import { renderReport } from './report/panel.ts';
import { makeSiteMaterials, makeStructureMaterials } from './scene/materials.ts';
import { type BuiltSite, buildSite } from './scene/site.ts';
import { DEFAULT_SUN, type ViewPreset, createStage } from './scene/stage.ts';
import { renderStill, saveBlob } from './scene/still.ts';
import { frameSubject, frameWhole } from './specimen/framing.ts';
import { SPECIMEN_VIEWS, SPECIMEN_YEARS, type SpecimenView, type Subject, describeSubject, findSubject, specimenPlan } from './specimen/specimen.ts';
import { type BuiltStructure, buildStructure } from './structure/build.ts';
import { toThree } from './structure/frames.ts';
import { makeBarkTextures, makeLeafTexture } from './textures.ts';

/** The two reference shells, or a design read from files. */
type BowerKey = 'vault' | 'hemisphere' | 'design';
/** Where the plants shown come from: nowhere, the growth engine, the plant picker, or the hand-made render test. */
type PlantSource = 'none' | 'trained' | 'untended' | 'mixed-trained' | 'mixed-untended' | 'palette-trained' | 'palette-untended' | 'palette-ivy' | 'custom' | 'fixture';
const PLANT_SOURCES: readonly PlantSource[] = ['none', 'trained', 'untended', 'mixed-trained', 'mixed-untended', 'palette-trained', 'palette-untended', 'palette-ivy', 'custom', 'fixture'];
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
/** Detail of the organ pools, 0 to 1 (see PlantView.update). A specimen, seen close, is drawn at full detail. */
let plantDetail = 0.75;
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

/** What ?specimen=<taxonId> asks for: one plant of that taxon on the specimen frame, on a date, seen whole or close on one organ. */
interface SpecimenRequest {
  taxonId: string;
  years: number;
  care: Care;
  /** ISO date, or null for the day the viewer would open on. */
  date: string | null;
  view: SpecimenView;
  /** Hide the interface, for a clean picture. */
  bare: boolean;
  /** Draw the final frame and stop: for a screenshot taken by a script. */
  still: boolean;
}
const specimen: SpecimenRequest | null = url.has('specimen')
  ? {
      taxonId: url.get('specimen') ?? '',
      years: Math.min(30, Math.max(1, Math.round(Number(url.get('years')) || SPECIMEN_YEARS))),
      care: url.get('care') === 'untended' ? 'untended' : 'trained',
      date: url.get('date'),
      view: SPECIMEN_VIEWS.find((v) => v === url.get('view')) ?? 'whole',
      bare: url.get('bare') === '1',
      still: url.get('still') === '1',
    }
  : null;

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
const lightOverlay = new ExposureOverlay();
stage.overlayScene.add(lightOverlay.group);

const state = {
  bowerKey: (url.get('bower') === 'hemisphere' ? 'hemisphere' : 'vault') as BowerKey,
  /** Years a design's planting plan is grown for. */
  years: Math.min(30, Math.max(1, Math.round(Number(url.get('years')) || 10))),
  overlay: url.get('overlay') === '1',
  stationId: url.get('station') ?? '',
  budgetM: url.has('budget') ? Number(url.get('budget')) : NaN,
  sun: { ...DEFAULT_SUN },
  /** 'real': the sun is where the site, the date and the hour put it. 'hand': the two sliders. */
  sunMode: (url.get('sun') === 'hand' ? 'hand' : 'real') as 'real' | 'hand',
  /** Hour of the day shown, UTC (Greenwich Mean Time). */
  hour: url.has('hour') ? Number(url.get('hour')) : 15,
  /** The date the sun is placed for while no plants are shown; with plants it is the timeline's. */
  sunDate: url.get('date') ?? '2027-06-21',
  /** The light overlay: on or off, what it shows, and for when. */
  light: url.get('light') === '1',
  lightMeasure: (url.get('measure') === 'share' ? 'share' : 'hours') as LightMeasure,
  lightMonth: 'date' as 'date' | LightMonth,
  lightStretch: url.get('stretch') === '1',
  orbit: false,
  selected: null as string | null,
  hovered: null as string | null,
  plants: (PLANT_SOURCES.find((p) => p === url.get('plants')) ?? 'none') as PlantSource,
  day: url.has('day') ? Number(url.get('day')) : NaN,
  playing: false,
  // a specimen is a still study: no wind unless it is asked for
  wind: url.has('wind') ? Math.max(0, Number(url.get('wind')) || 0) : specimen || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.6,
};
// a wind given in the address is there from the first frame, so that a still taken by a script is the same every time
if (url.has('wind') || specimen) shared.uWind.value = state.wind;

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
  // from the south-east, unless something the site declares stands in the way: then from the first corner that is clear
  const corners = [new THREE.Vector3(0.74, 0.26, 0.62), new THREE.Vector3(-0.74, 0.26, 0.62), new THREE.Vector3(0.74, 0.26, -0.62), new THREE.Vector3(-0.74, 0.26, -0.62)];
  const walls: [number, number, number, number][] = [];
  for (const o of bower?.site?.obstructions ?? []) {
    // on the ground plan of the three.js frame: x east, z = -north
    if (o.kind === 'wall') walls.push([o.from[0], -o.from[1], o.to[0], -o.to[1]]);
    else if (o.kind === 'building') o.footprint.forEach((p, i) => walls.push([p[0], -p[1], o.footprint[(i + 1) % o.footprint.length]![0], -o.footprint[(i + 1) % o.footprint.length]![1]]));
  }
  const crosses = (ax: number, az: number, bx: number, bz: number, w: [number, number, number, number]) => {
    const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => Math.sign((qx - px) * (rz - pz) - (qz - pz) * (rx - px));
    return side(ax, az, bx, bz, w[0], w[1]) !== side(ax, az, bx, bz, w[2], w[3]) && side(w[0], w[1], w[2], w[3], ax, az) !== side(w[0], w[1], w[2], w[3], bx, bz);
  };
  const clear = (dir: THREE.Vector3) => {
    const at = target.clone().addScaledVector(dir.clone().normalize(), distance);
    return !walls.some((w) => crosses(at.x, at.z, target.x, target.z, w));
  };
  const dir = (corners.find(clear) ?? corners[0]!).normalize();
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
  site = buildSite(bower, structure.feet, siteMaterials, siteNow());
  lightField = null;
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
  if (state.light) showLight(true);
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
  // the picker has its own years: the plan the design came with is not on show
  el('design-years-field').hidden = !(shown && d?.plan && state.plants !== 'custom');
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

// ---- the plant picker: one taxon per root station, chosen here -------------------------
// The choices become a planting plan (design/picker.ts), which the core checks and
// grows by the same path as a plan read from a file (growDesign). Nothing about
// plants is decided here.

/** What has been chosen on one structure, and the run last grown from it. */
interface PickerDesk {
  picks: Map<string, string>;
  care: Care;
  years: number;
  /** The design the picks belong to; null on a built-in shell. A new design starts afresh. */
  design: OpenedDesign | null;
  grown: { run: ScenarioRun; address: string } | null;
  /** Why the latest attempt was not grown, in words. */
  error: string | null;
}
const pickers = new Map<BowerKey, PickerDesk>();
/** The built-in shells as the picker plants them, built once so that the same stations are drawn and grown on. */
const pickerShells = new Map<'vault' | 'hemisphere', Bower>();

/** The picker's choices for the structure on show. */
function pickerNow(): PickerDesk {
  const key = state.bowerKey;
  const design = key === 'design' ? desk.current : null;
  let p = pickers.get(key);
  if (!p || p.design !== design) {
    p = { picks: new Map(), care: 'trained', years: state.years, design, grown: null, error: null };
    pickers.set(key, p);
  }
  return p;
}

/** The structure the picker plants: every rib foot of the vault, every meridian of the hemisphere, or the design's own stations. */
function pickerBower(): Bower {
  const key = state.bowerKey;
  if (key === 'design') return desk.current!.bower;
  let shell = pickerShells.get(key);
  if (!shell) pickerShells.set(key, (shell = pickerShell(key)));
  return shell;
}

const pickerViewpoints = (): readonly Viewpoint[] => (state.bowerKey === 'design' ? (desk.current?.viewpoints ?? []) : state.bowerKey === 'vault' ? VAULT_VIEWPOINTS : HEMISPHERE_VIEWPOINTS);
const choiceAddress = (p: PickerDesk): string => `${encodePicks(p.picks)}|${p.care}|${p.years}`;

/** The taxa offered, by label; each marked where its look in this viewer is still the stand-in. */
function offered() {
  return taxaOffered(growable(), (id) => {
    try {
      return lookFor(id).provisional;
    } catch {
      return true;
    }
  });
}

/** Fill the picker panel for the structure on show, or hide it when the picker is not the planting chosen. */
function showPicker(): void {
  const box = el('picker');
  const open = state.plants === 'custom' && !specimen;
  box.hidden = !open;
  document.body.classList.toggle('picking', open);
  if (!open) {
    markStation(null);
    return;
  }
  const p = pickerNow();
  const taxa = offered();
  const list = el('picker-stations');
  list.replaceChildren(
    ...stationsOf(pickerBower()).map((s) => {
      const li = document.createElement('li');
      li.dataset['station'] = s.id;
      const label = document.createElement('label');
      label.className = 'field';
      const name = document.createElement('span');
      name.append(Object.assign(document.createElement('b'), { textContent: s.id }), s.note ?? '');
      const select = document.createElement('select');
      select.append(new Option('Nothing here', ''));
      for (const t of taxa) select.append(new Option(t.provisional ? `${t.label} (stand-in look)` : t.label, t.id));
      select.value = p.picks.get(s.id) ?? '';
      // the whole name, where the list is too narrow to show it
      const titled = () => {
        li.classList.toggle('chosen', select.value !== '');
        select.title = select.selectedOptions[0]?.textContent ?? '';
      };
      titled();
      select.addEventListener('change', () => {
        if (select.value) p.picks.set(s.id, select.value);
        else p.picks.delete(s.id);
        titled();
        showPickerStatus();
      });
      // which station this is, in the picture
      select.addEventListener('focus', () => markStation(s.id));
      li.addEventListener('pointerdown', () => markStation(s.id));
      label.append(name, select);
      li.append(label);
      return li;
    }),
  );
  el<HTMLSelectElement>('picker-care').value = p.care;
  el<HTMLInputElement>('picker-years').value = String(p.years);
  el('picker-save-structure').hidden = state.bowerKey === 'design';
  el('picker-intro').textContent = `${stationsOf(pickerBower()).length} stations. Choose, then Grow.`;
  markStation(marked && pickerBower().rootStations.some((s) => s.id === marked) ? marked : null);
  showPickerStatus();
  showDesign();
}

/** Say where the choice stands against what is on show, and why the latest attempt was refused, if it was. */
function showPickerStatus(): void {
  const p = pickerNow();
  const status = el('picker-status');
  const changed = p.grown !== null && p.grown.address !== choiceAddress(p);
  const n = p.picks.size;
  const chosen = `${n} ${n === 1 ? 'station' : 'stations'} chosen`;
  status.textContent = !p.grown ? `${chosen}. Nothing grown yet.` : changed ? `${chosen}. Changed since it was grown: press Grow to see it.` : `On show: ${p.grown.run.data.plants.length} plants, ${p.care === 'trained' ? 'kept by the gardener (trained)' : 'with nobody gardening (untended)'}, ${p.years} ${p.years === 1 ? 'year' : 'years'}.`;
  el<HTMLButtonElement>('picker-save').disabled = n === 0;
  el<HTMLButtonElement>('picker-grow').disabled = n === 0;
  const error = el('picker-error');
  error.hidden = !p.error;
  if (p.error) error.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'Not grown. The picture is as it was.' }), p.error);
}

/** Grow what is chosen. Anything the core refuses is shown in its words, and what is on show stays. */
function growPicked(keepDay = false): void {
  const p = pickerNow();
  const bowerNow = pickerBower();
  const result = planFromPicks(p.picks, bowerNow, growable());
  if (!result.ok) {
    p.error = result.error;
    showPickerStatus();
    return;
  }
  let run: ScenarioRun;
  try {
    run = growDesign({ bower: bowerNow, plan: result.plan, viewpoints: pickerViewpoints() }, p.care, p.years);
  } catch (e) {
    p.error = e instanceof Error ? e.message : String(e);
    showPickerStatus();
    return;
  }
  p.error = null;
  p.grown = { run, address: choiceAddress(p) };
  // the mark is for choosing: it does not stand in the picture of what was grown, nor in a still of it
  marked = null;
  showPlants('custom', keepDay);
  writeAddress(p);
}

/** Put the choice in the address, so that the planting on show can be linked to. Nothing is reloaded. */
function writeAddress(p: PickerDesk): void {
  const choice: PickerChoice = { picks: p.picks, care: p.care, years: p.years };
  const params = writePickerAddress(new URLSearchParams(location.search), choice);
  // the structure: an address can name a design only by the example it opens; a design read from files cannot be linked to
  const example = state.bowerKey !== 'design' ? state.bowerKey : desk.current?.files.bower === 'arbour.bower.json' ? 'arbour' : desk.current?.files.bower === 'arbour-in-a-yard.bower.json' ? 'yard' : null;
  if (!example) return;
  params.set('bower', example);
  history.replaceState(null, '', `${location.pathname}?${params.toString().replaceAll('%3A', ':').replaceAll('%2C', ',')}${location.hash}`);
}

el<HTMLSelectElement>('picker-care').addEventListener('change', (e) => {
  pickerNow().care = (e.target as HTMLSelectElement).value === 'untended' ? 'untended' : 'trained';
  showPickerStatus();
});
el<HTMLInputElement>('picker-years').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const p = pickerNow();
  const years = Math.round(Number(input.value));
  p.years = Math.min(MAX_YEARS, Math.max(MIN_YEARS, Number.isFinite(years) ? years : p.years));
  input.value = String(p.years);
  showPickerStatus();
});
el('picker-grow').addEventListener('click', () => {
  const button = el<HTMLButtonElement>('picker-grow');
  button.disabled = true;
  el('picker-status').textContent = 'Growing...';
  // let the words be drawn before the run, which takes a few seconds
  setTimeout(() => {
    try {
      growPicked();
    } finally {
      button.disabled = false;
    }
  }, 30);
});
el('picker-save').addEventListener('click', () => {
  const p = pickerNow();
  const result = planFromPicks(p.picks, pickerBower(), growable());
  if (!result.ok) {
    p.error = result.error;
    showPickerStatus();
    return;
  }
  saveBlob(new Blob([plantingFileText(result.plan)], { type: 'application/json' }), plantingFileName(pickerBower()));
});
el('picker-save-structure').addEventListener('click', () => {
  if (state.bowerKey === 'design') return;
  saveBlob(new Blob([structureFileText(pickerBower(), pickerViewpoints())], { type: 'application/json' }), structureFileName(pickerBower()));
});

// ---- which station a row of the picker is, in the picture ---------------------------------
/** A ring on the ground at the station and a post standing from it, drawn over everything in the overlay's own colour. */
const stationMark = (() => {
  const material = new THREE.MeshBasicMaterial({ color: '#ffd3ea', toneMapped: false, fog: false, depthTest: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 48), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 8), material);
  post.position.y = 1.1;
  const group = new THREE.Group();
  group.add(ring, post);
  group.renderOrder = 10;
  for (const m of [ring, post]) m.renderOrder = 10;
  group.visible = false;
  return group;
})();
stage.overlayScene.add(stationMark);
/** The station marked in the picture, if one is. */
let marked: string | null = null;

/** Mark a station in the picture, or none. The station also becomes the design overlay's, so that its reach is there when the overlay is shown. */
function markStation(stationId: string | null): void {
  for (const li of el('picker-stations').children) (li as HTMLElement).classList.toggle('marked', (li as HTMLElement).dataset['station'] === stationId);
  const station = stationId ? bower.rootStations.find((s) => s.id === stationId) : undefined;
  marked = station ? station.id : null;
  stationMark.visible = !!station;
  if (station) {
    const p = toThree(station.position);
    stationMark.position.set(p.x, 0, p.z);
    // as big as the structure asks: a 15 m dome is seen from farther off than a 4 m arbour
    const size = structure ? structure.bounds.getSize(new THREE.Vector3()) : new THREE.Vector3(4, 4, 4);
    stationMark.scale.setScalar(Math.min(2.5, Math.max(0.6, Math.max(size.x, size.z) / 6)));
    if (station.id !== state.stationId) showStation(station.id);
  }
  invalidate();
}

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
  lightField = null;
  lastReport = null;
  el<HTMLButtonElement>('save-viewpoints').disabled = true;
  el<HTMLSelectElement>('plants').value = source;
  el('log').hidden = true;
  el('report').hidden = true;
  const asked = ++reportAsked;
  stage.invalidateShadows();
  invalidate();
  // a scenario is drawn on the Bower it was grown on; anything else on the default one
  const scenario = SCENARIOS[source];
  const design = state.bowerKey === 'design' ? desk.current : null;
  // the picker's planting is grown when "Grow" is pressed, before anything on show is taken down
  const run =
    source === 'custom'
      ? (pickerNow().grown?.run ?? null)
      : !scenario
        ? null
        : state.bowerKey === 'design'
          ? design?.plan
            ? growDesign({ bower: design.bower, plan: design.plan, viewpoints: design.viewpoints }, scenario.care, state.years)
            : null
          : growScenario(scenario.planting, state.bowerKey, scenario.care);
  // the picker with nothing grown yet shows the structure with every station it offers
  const planted = source !== 'none' && !(source === 'custom' && !run);
  document.body.classList.toggle('plants', planted);
  el('plant-bar').hidden = !planted;
  const on = run?.bower ?? (source === 'custom' ? pickerBower() : bowerOf(state.bowerKey));
  if (signature(on) !== signature(bower)) showStructure(on, 'keep', true);
  showPicker();
  if (!planted) {
    placeSun();
    return;
  }

  const data: RenderData = run ? run.data : makeTestPlant(bower).data;
  plantMaterials ??= makePlantMaterials({ bark: (grain) => makeBarkTextures(grain), leafTex: makeLeafTexture() });
  plant = new PlantView(data, plantMaterials);
  stage.scene.add(plant.group);

  const slider = el<HTMLInputElement>('plant-day');
  slider.min = String(plant.timeline.firstDay);
  slider.max = String(plant.timeline.lastDay);
  const taxa = data.plants.map((p) => p.label).filter((l, i, all) => all.indexOf(l) === i);
  // a long palette is counted rather than listed: the calendar beside it names every plant
  const labels = taxa.length > 4 ? [`${data.plants.length} plants of ${taxa.length} taxa`] : taxa;
  const once = (list: readonly string[]) => list.filter((l, i, all) => all.indexOf(l) === i);
  const missing = once(plant.provisionalLooks);
  const flowerless = once(plant.withoutFlowers);
  const fruitless = once(plant.withoutFruit);
  const holdless = once(plant.withoutAppendages);
  // a look that could not be loaded is a fault to be put right, not a look that is wanting: say which and why
  const faulty = once(data.plants.map((p) => p.taxonId)).flatMap((id) => (lookFault(id) ? [`${id} (${lookFault(id)})`] : []));
  const stemsOnly =
    (missing.length ? ` Provisional look (a plain stand-in leaf, no flowers), for want of models of its own: ${missing.join(', ')}.` : '') +
    (flowerless.length ? ` Shown without its flowers, for want of a flower model: ${flowerless.join(', ')}.` : '') +
    (fruitless.length ? ` Shown without its fruit, for want of a fruit model: ${fruitless.join(', ')}.` : '') +
    (holdless.length ? ` Shown without what it holds on with, for want of a model: ${holdless.join(', ')}.` : '') +
    (plant.unknownForms.length ? ` Drawn in its ordinary form, for want of a model of the form the run names: ${plant.unknownForms.join('; ')}.` : '') +
    (faulty.length ? ` The look could not be loaded, and the stand-in is drawn instead: ${faulty.join('; ')}.` : '');
  // how many of the numbers behind the run have each evidence status; "measured" is always said, even when none is
  const counted = Object.entries(data.assumptions).filter(([status, n]) => n > 0 || status === 'measured');
  const behind = counted.some(([, n]) => n > 0) ? ` Numbers behind this run: ${counted.map(([status, n]) => `${n} ${status.replaceAll('_', ' ')}`).join(', ')}.` : '';
  el('plant-statement').textContent = `${labels.join(', ')} · ${data.scenario}. ${data.statement}${behind}${stemsOnly}`;
  showLog();
  clearTimeline();
  showDay(keepDay && Number.isFinite(state.day) ? state.day : openingDay(data));

  // the design report takes about as long as the run: read it once the picture is up. A bare specimen is a picture only.
  if (run && !specimen?.bare) {
    const box = el('report');
    box.hidden = false;
    box.replaceChildren(Object.assign(document.createElement('p'), { className: 'note', textContent: 'Reading the run for its design report...' }));
    setTimeout(() => {
      if (asked !== reportAsked || !plant) return;
      const timeline = plant.timeline;
      lastReport = run.report();
      el<HTMLButtonElement>('save-viewpoints').disabled = lastReport.viewpoints.length === 0;
      if (state.light) showLightPanel();
      renderReport(box, lastReport, {
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
  if (Math.abs(day - state.day) > 0.01) lastMoved = performance.now();
  state.day = Math.min(t.lastDay, Math.max(t.firstDay, day));
  plant.update(stage.camera, state.day, plantDetail);
  lastPlantUpdate = performance.now();
  el<HTMLInputElement>('plant-day').value = String(Math.round(state.day));
  el('plant-date').textContent = t.dateLabel(state.day);
  const stats = plant.stats();
  // "in flower" is what the core counts as open, so it agrees with the calendar beside it; buds are said apart
  el('plant-caption').textContent =
    `${stats.stems.toLocaleString()} stems · ${stats.leaves.toLocaleString()} leaves · ${stats.flowers.toLocaleString()} in flower` +
    `${stats.buds ? ` · ${stats.buds.toLocaleString()} in bud` : ''}${stats.fruit ? ` · ${stats.fruit.toLocaleString()} fruit` : ''}${stats.appendages ? ` · ${stats.appendages.toLocaleString()} holds and prickles` : ''}`;
  markLog();
  el('play').innerHTML = state.playing ? '&#10073;&#10073;' : '&#9654;';
  placeSun();
  stage.invalidateShadows();
  invalidate();
}

el<HTMLSelectElement>('plants').addEventListener('change', (e) => {
  const source = (e.target as HTMLSelectElement).value as PlantSource;
  // the address holds a picker's choice only while it is on show
  if (source !== 'custom' && new URLSearchParams(location.search).has('pick')) {
    const params = new URLSearchParams(location.search);
    for (const k of ['plants', 'pick', 'care']) params.delete(k);
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params.toString()}` : ''}${location.hash}`);
  }
  showPlants(source);
});
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

// ---- the sun, from the site, the date and the hour ------------------------------------
/** The place the Bower on show stands: the one its description declares, or the assumed baseline. */
function siteNow(): Site {
  return bower.site ?? DEFAULT_SITE;
}

/** The date the picture shows: the timeline's day where there are plants, else the date set in the scene controls. */
function dateNow() {
  if (plant) return plant.timeline.calendar.dateOf(Math.round(state.day));
  try {
    return new Calendar(state.sunDate).dateOf(0);
  } catch {
    return new Calendar('2027-06-21').dateOf(0);
  }
}

/** Where the core says the sun is, for the site, the date shown and the hour. */
function sunNow() {
  const date = dateNow();
  const s = sunAt(siteNow(), Math.min(365, date.dayOfYear), state.hour);
  return { date: date.iso, hour: state.hour, elevationDeg: s.elevationDeg, azimuthDeg: s.azimuthDeg, direction: s.direction };
}

const sunVector = new THREE.Vector3();
let monthShown = 0;
/** Put the sun, and anything else that follows the date, where the date and hour shown say. */
function placeSun(): void {
  const date = dateNow();
  if (site?.setMonth(date.month)) stage.invalidateShadows();
  if (state.sunMode === 'real') {
    const s = sunNow();
    // core (x east, y north, z up) to three.js (x, z, -y)
    stage.setSunDirection(sunVector.set(s.direction.x, s.direction.z, -s.direction.y));
  }
  // the words about the sun wait while the timeline plays: they are written when it stops
  if (!state.playing) showSunReadout();
  if (state.light && (date.month !== monthShown || (plant && date.year !== lightFieldYear))) showLight(true);
  monthShown = date.month;
  invalidate();
}

function showSunReadout(): void {
  const date = dateNow();
  const input = el<HTMLInputElement>('sun-date');
  if (document.activeElement !== input) input.value = date.iso;
  const h = Math.floor(state.hour);
  const m = Math.round((state.hour - h) * 60);
  el('sun-hour-out').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} GMT`;
  const s = sunNow();
  const site = siteNow();
  const where = `${site.name}, ${Math.abs(site.latitudeDeg).toFixed(1)}° ${site.latitudeDeg >= 0 ? 'N' : 'S'}`;
  el('sun-readout').textContent =
    state.sunMode === 'hand'
      ? 'The sun is set by hand: it is not where this date and hour would put it.'
      : s.elevationDeg > 0
        ? `Sun ${s.elevationDeg.toFixed(0)}° above the horizon, in the ${compassWords(s.azimuthDeg)} (bearing ${s.azimuthDeg.toFixed(0)}°). ${where}.`
        : `The sun is ${(-s.elevationDeg).toFixed(0)}° below the horizon. ${where}.`;
}

function setHour(hour: number): void {
  state.hour = Math.min(24, Math.max(0, hour));
  el<HTMLInputElement>('sun-hour').value = String(state.hour);
  placeSun();
}

// ---- light on the structure -------------------------------------------------------------
let lightField: ExposureField | null = null;
let lightFieldYear = NaN;
let lightScale: LightScale | null = null;
let lastReport: DesignReport | null = null;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Show or hide the light overlay. The light itself is the core's: `exposureField`, with the leaf of the year shown. */
function showLight(on: boolean): void {
  state.light = on;
  el<HTMLInputElement>('light-toggle').checked = on;
  el('light-panel').hidden = !on;
  lightOverlay.setVisible(on);
  if (on) {
    const date = dateNow();
    if (!lightField || (plant && date.year !== lightFieldYear)) {
      lightFieldYear = plant ? date.year : NaN;
      lightField = exposureField(bower, siteNow(), plant ? foliageFromRenderData(plant.timeline.data, date.year) : undefined);
      lightOverlay.setField(bower, lightField);
    }
    lightScale = lightOverlay.show(state.lightMeasure, lightMonthNow(), state.lightStretch);
    showLightPanel();
  }
  invalidate();
}

const lightMonthNow = (): LightMonth => (state.lightMonth === 'date' ? dateNow().month - 1 : state.lightMonth);

function showLightPanel(): void {
  const field = lightField;
  if (!field) return;
  const site = field.site;
  const month = lightMonthNow();
  const when = month === 'year' ? 'the year round' : `in ${MONTHS[month]}`;
  const hours = state.lightMeasure === 'hours';
  const fmt = (x: number) => (hours ? `${x.toFixed(1)} h` : `${Math.round(100 * x)}%`);
  el('light-site').textContent = `${site.name}, ${Math.abs(site.latitudeDeg).toFixed(1)}° ${site.latitudeDeg >= 0 ? 'N' : 'S'}${site.obstructions.length ? `, with ${site.obstructions.length} thing${site.obstructions.length === 1 ? '' : 's'} declared that cast${site.obstructions.length === 1 ? 's' : ''} shade` : ', an open site'}${site.assumed ? '. No site was given: this one is assumed.' : '.'} ${plant ? `With the leaf of ${lightFieldYear} on the structure.` : 'The bare structure.'}`;
  if (lightScale) {
    el('light-low').textContent = fmt(lightScale.low);
    el('light-high').textContent = fmt(lightScale.high);
    el('light-range').textContent = `On this structure ${when}: ${fmt(lightScale.least)} to ${fmt(lightScale.most)}${hours ? ', counting a half-shaded minute as half' : ''}.`;
  }
  // side by side, as the report's light section gives it
  const sides = new Map<string, { m: number; v: number }>();
  for (const p of field.points) {
    if (p.kind !== 'route') continue;
    const list = hours ? p.hours : p.share;
    const v = month === 'year' ? list.reduce((a, x) => a + x, 0) / 12 : list[month]!;
    const s = sides.get(p.facing) ?? { m: 0, v: 0 };
    s.m += p.routeM;
    s.v += p.routeM * v;
    sides.set(p.facing, s);
  }
  const table = el<HTMLTableElement>('light-sides');
  table.replaceChildren();
  for (const facing of ['north', 'east', 'south', 'west', 'up']) {
    const s = sides.get(facing);
    if (!s) continue;
    const tr = table.insertRow();
    tr.append(Object.assign(document.createElement('th'), { textContent: facing === 'up' ? 'The top' : `Facing ${facing}` }));
    tr.insertCell().textContent = `${s.m.toFixed(0)} m of route`;
    tr.insertCell().textContent = fmt(s.v / s.m);
  }
  // each plant against its profile, from the run's own report
  const box = el('light-plants');
  box.replaceChildren();
  const light = lastReport?.light;
  if (light && plant) {
    const t = document.createElement('table');
    t.createCaption().textContent = `Each plant in ${lastReport!.year}, against what its profile accepts${light.acts ? '' : ' (light was told not to act in this run)'}`;
    const head = t.insertRow();
    for (const h of ['Plant', 'Side', 'Midsummer sun', 'Light', 'Growth']) head.append(Object.assign(document.createElement('th'), { textContent: h }));
    for (const p of light.plants) {
      const tr = t.insertRow();
      tr.insertCell().textContent = p.plantId;
      tr.insertCell().textContent = p.side;
      tr.insertCell().textContent = `${p.midsummerHours.toFixed(1)} h`;
      tr.insertCell().textContent = `${Math.round(100 * p.seasonShare)}%`;
      tr.insertCell().textContent = `${Math.round(100 * p.growthFactor)}%${p.reading.floweringNeedsSun ? `, flowers ${Math.round(100 * p.floweringFactor)}%` : ''}`;
      const flags = [p.light === 'more_sun' ? 'more sun than its profile asks for' : p.light === 'less_sun' ? 'less sun than its profile asks for' : '', p.aspect === 'not_as_asked' ? `its profile names ${p.reading.aspects.join(' or ')}` : ''].filter(Boolean);
      if (flags.length) {
        const flag = t.insertRow().insertCell();
        flag.colSpan = 5;
        flag.className = 'flag';
        flag.textContent = `↳ ${flags.join('; ')}: "${p.reading.words}"`;
      }
    }
    box.append(t);
  }
  el('light-notes').textContent = light ? light.notes.join(' ') : 'Hours are direct sun on a clear day, as the geometry allows: not sunshine records. Warmth, shelter and wind are not light and are not modelled.';
}

// ---- stills ----------------------------------------------------------------------------------
/** True while a still is being drawn: the ordinary frames stand aside. */
let exporting = false;
async function exportStill(options: { width: number; height: number; supersample?: number }): Promise<Blob> {
  exporting = true;
  try {
    if (plant) plant.update(stage.camera, state.day, 1);
    stage.camera.clearViewOffset();
    // a still is drawn with everything: the sky has its cloud, whatever the picture on screen is drawn with
    const cloud = stage.setClouds(true);
    try {
      return await renderStill(stage, options);
    } finally {
      stage.setClouds(cloud);
    }
  } finally {
    exporting = false;
    invalidate();
  }
}

function stillSize(): { width: number; height: number } {
  const value = el<HTMLSelectElement>('still-size').value;
  if (value === 'window') {
    const b = stage.renderer.getDrawingBufferSize(new THREE.Vector2());
    return { width: b.x, height: b.y };
  }
  const [width, height] = value.split('x').map(Number);
  return { width: width!, height: height! };
}
const stillName = (view: string) => `${bower.id}-${view}-${dateNow().iso}${state.overlay || state.light ? '-overlay' : ''}.png`;

async function saveStills(viewpoints: readonly Viewpoint[] | null): Promise<void> {
  const note = el('still-note');
  const buttons = [el<HTMLButtonElement>('save-image'), el<HTMLButtonElement>('save-viewpoints')];
  const disabled = buttons.map((b) => b.disabled);
  for (const b of buttons) b.disabled = true;
  note.hidden = false;
  const was = { position: stage.camera.position.clone(), target: stage.controls.target.clone(), fov: stage.camera.fov, polar: stage.controls.maxPolarAngle, near: stage.controls.minDistance };
  const size = stillSize();
  try {
    if (!viewpoints) {
      note.textContent = `Drawing ${size.width} x ${size.height}...`;
      await new Promise((r) => setTimeout(r, 30));
      saveBlob(await exportStill(size), stillName('view'));
    } else {
      for (const [i, vp] of viewpoints.entries()) {
        note.textContent = `Drawing ${i + 1} of ${viewpoints.length}: ${vp.label}...`;
        standAt(vp);
        await new Promise((r) => setTimeout(r, 30));
        saveBlob(await exportStill(size), stillName(vp.id));
      }
      stage.controls.maxPolarAngle = was.polar;
      stage.controls.minDistance = was.near;
      stage.camera.fov = was.fov;
      stage.camera.updateProjectionMatrix();
      stage.camera.position.copy(was.position);
      stage.controls.target.copy(was.target);
      stage.controls.update();
    }
    note.textContent = `Saved ${viewpoints ? `${viewpoints.length} stills` : 'a still'} of ${size.width} x ${size.height} for ${dateNow().iso}.`;
  } catch (e) {
    note.textContent = `The still could not be drawn: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    buttons.forEach((b, i) => (b.disabled = disabled[i]!));
    invalidate();
  }
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
  const mode = el<HTMLSelectElement>('sun-mode');
  const hour = el<HTMLInputElement>('sun-hour');
  const date = el<HTMLInputElement>('sun-date');
  const elevation = el<HTMLInputElement>('sun-elevation');
  const azimuth = el<HTMLInputElement>('sun-azimuth');
  const show = () => {
    el('sun-elevation-out').textContent = `${state.sun.elevation}°`;
    el('sun-azimuth-out').textContent = `${state.sun.azimuth}°`;
  };
  elevation.value = String(state.sun.elevation);
  azimuth.value = String(state.sun.azimuth);
  hour.value = String(state.hour);
  mode.value = state.sunMode;
  show();
  /** Show the controls that go with the way the sun is being placed, and place it. */
  const sync = () => {
    const real = state.sunMode === 'real';
    for (const input of [elevation, azimuth]) input.closest('label')!.hidden = real;
    for (const input of [hour, date]) input.closest('label')!.hidden = !real;
    if (!real) stage.setSun(state.sun);
    placeSun();
  };
  mode.addEventListener('change', () => {
    state.sunMode = mode.value === 'hand' ? 'hand' : 'real';
    sync();
  });
  hour.addEventListener('input', () => setHour(Number(hour.value)));
  date.addEventListener('change', () => {
    if (!date.value) return;
    if (plant) {
      // with plants on show the date is the timeline's: go there
      state.playing = false;
      try {
        showDay(plant.timeline.calendar.dayOf(date.value));
      } catch {
        showSunReadout();
      }
    } else {
      state.sunDate = date.value;
      placeSun();
    }
  });
  const byHand = () => {
    state.sun = { elevation: Number(elevation.value), azimuth: Number(azimuth.value) };
    stage.setSun(state.sun);
    show();
    invalidate();
  };
  elevation.addEventListener('input', byHand);
  azimuth.addEventListener('input', byHand);
  sync();
}
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
el('save-image').addEventListener('click', () => void saveStills(null));
el('save-viewpoints').addEventListener('click', () => void saveStills(lastReport?.viewpoints ?? []));
el<HTMLInputElement>('light-toggle').addEventListener('change', (e) => showLight((e.target as HTMLInputElement).checked));
el<HTMLSelectElement>('light-measure').value = state.lightMeasure;
el<HTMLInputElement>('light-stretch').checked = state.lightStretch;
el<HTMLSelectElement>('light-measure').addEventListener('change', (e) => {
  state.lightMeasure = (e.target as HTMLSelectElement).value === 'share' ? 'share' : 'hours';
  showLight(state.light);
});
el<HTMLSelectElement>('light-month').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  state.lightMonth = v === 'date' || v === 'year' ? v : Number(v);
  showLight(state.light);
});
el<HTMLInputElement>('light-stretch').addEventListener('change', (e) => {
  state.lightStretch = (e.target as HTMLInputElement).checked;
  showLight(state.light);
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
  } else if (e.code === 'KeyL') {
    e.preventDefault();
    showLight(!state.light);
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
  // a hand on the picture lets go of the picker's station mark
  if (marked) markStation(null);
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
stage.controls.addEventListener('change', () => {
  lastMoved = performance.now();
  invalidate();
});

/** Shift the picture so the subject sits in the part of the window the overlay panel leaves free. */
function applyViewOffset(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const right = el('right');
  const shown = state.overlay || state.light || !el('report').hidden;
  const covered = shown && !document.body.classList.contains('bare') && w > 760 ? right.offsetWidth + 20 : 0;
  if (covered > 0) stage.camera.setViewOffset(w, h, covered / 2, 0, w, h);
  else stage.camera.clearViewOffset();
}

let lastRender = 0;
/** When the picture last changed by someone's hand: the timeline, the camera. A moving picture is drawn the quicker way. */
let lastMoved = 0;
/**
 * How the picture is drawn. By default the quick way while anything in it moves (the timeline, the camera, leaves in
 * the wind) and the careful way, with its shading of corners, once it is at rest with nothing moving.
 * ?quality=high: always the careful way. ?quality=draft: never, for a slow machine.
 */
const QUALITY: 'draft' | 'default' | 'high' = url.get('quality') === 'draft' ? 'draft' : url.get('quality') === 'high' || url.get('quality') === 'full' ? 'high' : 'default';
/** Whether the frame now due should be drawn the careful way. */
function careful(): boolean {
  // a specimen's picture is a study: until it is final, and for good where it is a still
  if (specimenShown !== null && (!specimenShown.ready || specimen?.still === true)) return true;
  if (QUALITY !== 'default') return QUALITY === 'high';
  const moving = state.playing || performance.now() - lastMoved < 280;
  const swaying = plant !== null && shared.uWind.value > 0.001;
  return !moving && !swaying;
}
let drawnCareful = false;
// the sky's cloud is dear to draw: it is there where the picture is always drawn the careful way
stage.setClouds(QUALITY === 'high' || specimen !== null);
function render(): void {
  applyViewOffset();
  overlay.update(stage.camera, window.innerWidth, window.innerHeight, stage.renderer.getPixelRatio());
  drawnCareful = careful();
  stage.render(drawnCareful);
  lastRender = performance.now();
}

/** The arbour again, on a site that declares what shades it: a wall, a house and a tree. */
const YARD_EXAMPLE: readonly DesignFile[] = [
  { name: 'arbour-in-a-yard.bower.json', text: yardBower },
  { name: 'arbour.planting.json', text: arbourPlanting },
];

// ---- a specimen: one plant on the small standard frame, seen whole or close ---------------
/** The specimen on show, and whether its picture is final yet (the frames drawn since it was set up are counted). */
let specimenShown: { subject: Subject; frames: number; ready: boolean } | null = null;

/** Tell a script that waits on the page how it stands: true once the frame shown is final, 'error' if there will be none. */
function markReady(value: true | 'error'): void {
  (window as unknown as { __ready: boolean | string }).__ready = value;
  document.body.dataset['ready'] = String(value);
}

/** How the page's own script (index.html) begins what it copies on to the curtain from the development server's error panel. */
const SERVER_SAYS = 'The development server says:';

/** There will be no picture: say why where the picture would be, in words a screenshot carries. */
function refuseSpecimen(why: string): void {
  const curtain = el('curtain');
  // the development server may already have written on the curtain why a module did not compile (index.html): keep that
  const told = curtain.textContent ?? '';
  const said = told.includes(SERVER_SAYS) ? told.slice(told.indexOf(SERVER_SAYS)) : '';
  curtain.textContent = said ? `${why}\n\n${said}` : why;
  curtain.classList.add('refused');
  document.documentElement.classList.add('curtained');
  markReady('error');
}

function openSpecimen(request: SpecimenRequest): void {
  document.body.classList.toggle('bare', request.bare);
  const id = request.taxonId;
  if (!SPECIES_IDS.includes(id)) return refuseSpecimen(`There is no taxon "${id}" under species/.\n\nThe taxa are:\n${SPECIES_IDS.join('\n')}`);
  if (lookFault(id)) return refuseSpecimen(`The look of ${id} could not be loaded.\n\npackages/viewer/src/plant/taxa/${id}.ts:\n${lookFault(id)}`);
  const files = [
    { name: 'specimen-frame.bower.json', text: specimenFrame },
    { name: `${id}.planting.json`, text: JSON.stringify(specimenPlan(id)) },
  ];
  if (!desk.open(files)) return refuseSpecimen(`${id} cannot be grown on the specimen frame.\n\n${growFault(id) ?? desk.error ?? ''}`);
  state.bowerKey = 'design';
  state.plants = request.care;
  state.years = request.years;
  plantDetail = 1;
  showBower('design');
  if (!plant || !structure) return refuseSpecimen(`${id} was not grown.`);
  const t = plant.timeline;
  let day = state.day;
  if (request.date !== null) {
    const wanted = /^\d{4}-\d{2}-\d{2}$/.test(request.date) ? t.calendar.dayOf(request.date) : NaN;
    if (!Number.isFinite(wanted) || wanted < 0 || wanted > t.lastDay) {
      return refuseSpecimen(`"${request.date}" is not a day of this run, which goes from ${t.calendar.dateOf(0).iso} to ${t.calendar.dateOf(t.lastDay).iso}. Give date=YYYY-MM-DD.`);
    }
    day = wanted;
  }

  // what to look at: a real organ of the run that is there on that day, or the reason there is none
  const subject = findSubject(t.data, request.view, day);
  const close = viewFromUrl() ?? frameSubject(t.data, subject, day, lookFor(id), FIELD_OF_VIEW);
  stage.controls.minDistance = 0.03;
  stage.camera.fov = FIELD_OF_VIEW;
  stage.camera.updateProjectionMatrix();
  // shadows drawn in a box that fits this small frame, so that they are sharp enough to be seen close
  stage.frame(structure.bounds, close ?? frameWhole(t.data, FIELD_OF_VIEW, stage.camera.aspect), 2.4);
  // the level of detail follows the camera: show the day once the camera stands where it will
  showDay(day);

  const label = t.data.plants[0]?.label ?? id;
  const about = `${label} on the specimen frame, ${request.care}, in year ${t.yearOf(day) - t.yearOf(0) + 1} of ${request.years} · ${t.dateLabel(day)}`;
  el('specimen-caption').hidden = false;
  el('specimen-caption').textContent = subject.kind === 'none' ? `${about} · the whole plant` : `${about} · ${describeSubject(t.data, subject, day)}`;
  const note = el('specimen-note');
  note.hidden = subject.kind !== 'none';
  if (subject.kind === 'none') note.textContent = `${subject.why} The whole plant is shown instead.`;
  clearTimeline();
  specimenShown = { subject, frames: 0, ready: false };
}

// The looks are loaded before anything is drawn; one that fails costs only its own plant its look. A specimen loads
// its own taxon's and no other, so that work in progress on another taxon cannot reach its picture.
await loadLooks(specimen ? [specimen.taxonId] : undefined);

if (specimen) {
  try {
    openSpecimen(specimen);
  } catch (e) {
    refuseSpecimen(`The specimen could not be shown.\n\n${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  }
  // with the interface on show another planting can be chosen from it: have the other looks ready for that
  if (!specimen.bare) void loadLooks();
} else {
  // ?bower=arbour opens the example design, ?bower=yard the same arbour in a walled yard, planted unless the address says otherwise
  if ((url.get('bower') === 'arbour' && desk.open(ARBOUR_EXAMPLE)) || (url.get('bower') === 'yard' && desk.open(YARD_EXAMPLE))) {
    state.bowerKey = 'design';
    if (!url.has('plants')) state.plants = 'trained';
  }
  showBower(state.bowerKey, viewFromUrl(), Number.isFinite(state.budgetM), true);
  // ?plants=custom&pick=<stationId>:<taxonId>,...&care=&years=: the picker filled in from the address, and grown if all of it fits
  if (state.plants === 'custom') {
    const p = pickerNow();
    const read = readPickerAddress(url, pickerBower(), growable());
    p.picks = new Map(read.picks);
    p.care = read.care;
    p.years = read.years;
    if (read.faults.length) p.error = `The address asks for what cannot be grown here:\n${read.faults.map((f) => `- ${f}`).join('\n')}`;
    else if (p.picks.size) growPicked(true);
    showPicker();
  }
  showOverlay(state.overlay);
  if (url.get('ui') === '0') document.body.classList.add('bare');
}
if (structure) {
  bindSun();
  showLight(state.light);
}

const timer = new THREE.Timer();
const sunView = new THREE.Vector3();
let frameNo = 0;
stage.renderer.setAnimationLoop(() => {
  // a still is being drawn, tile by tile: leave the camera and the targets to it
  if (exporting) return;
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
    shared.uSunDirWorld.value.copy(stage.sunDir);
    if (state.playing) {
      const next = state.day + dt * DAYS_PER_SECOND;
      if (next >= plant.timeline.lastDay) state.playing = false;
      showDay(next);
    } else if (performance.now() - lastPlantUpdate > 180) {
      // level of detail follows the camera
      plant.update(stage.camera, state.day, plantDetail);
      lastPlantUpdate = performance.now();
    }
    if (frameNo % 2 === 0 && shared.uWind.value > 0.001) stage.invalidateShadows();
    dirty = true;
  }

  // nothing moves in a bare structure, so it is drawn on demand, with a slow
  // heartbeat so that screen capture always finds a fresh frame
  // once the picture has come to rest, it is drawn once more the careful way
  if (!drawnCareful && careful()) dirty = true;
  if (!dirty && performance.now() - lastRender < 500) return;
  dirty = false;
  render();

  // a specimen's picture is final once a few frames have been drawn with nothing left to change:
  // the curtain is lifted and a waiting script is told. A still then stops, so that nothing after it can differ.
  if (specimenShown && !specimenShown.ready && ++specimenShown.frames >= 4) {
    specimenShown.ready = true;
    document.documentElement.classList.remove('curtained');
    markReady(true);
    if (specimen?.still) stage.renderer.setAnimationLoop(null);
  }
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
    showLight,
    setHour,
    sunNow,
    exportStill,
    openFiles,
    desk,
    invalidate,
    get specimen() {
      return specimenShown;
    },
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
