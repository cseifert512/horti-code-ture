// Bower viewer: renders a Bower from @horti/core, a design overlay that
// answers reach and material questions from the core, and (as a renderer test)
// a hand-made plant. The viewer holds no growth logic: it reads core data and
// calls core functions.
import * as THREE from 'three';
import { type Bower, type SupportEdge, makeHemisphereBower, makeVaultBower } from '@horti/core';
import { type ReachView, type StationField, materials, reachView, routeInfo, stationField } from './overlay/model.ts';
import { ReachOverlay } from './overlay/view.ts';
import { makeSiteMaterials, makeStructureMaterials } from './scene/materials.ts';
import { type BuiltSite, buildSite } from './scene/site.ts';
import { DEFAULT_SUN, type ViewPreset, createStage } from './scene/stage.ts';
import { type BuiltStructure, buildStructure } from './structure/build.ts';

type BowerKey = 'vault' | 'hemisphere';
const BOWERS: Record<BowerKey, () => Bower> = {
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
stage.scene.add(overlay.group);

const state = {
  bowerKey: (url.get('bower') === 'hemisphere' ? 'hemisphere' : 'vault') as BowerKey,
  overlay: url.get('overlay') === '1',
  stationId: url.get('station') ?? '',
  budgetM: url.has('budget') ? Number(url.get('budget')) : NaN,
  sun: { ...DEFAULT_SUN },
  orbit: false,
  selected: null as string | null,
  hovered: null as string | null,
};

let bower: Bower;
let structure: BuiltStructure | null = null;
let site: BuiltSite | null = null;
let field: StationField;
let view: ReachView;
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
function showBower(key: BowerKey, opening: ViewPreset | null = null, keepBudget = false): void {
  if (structure) {
    stage.scene.remove(structure.group);
    structure.dispose();
  }
  if (site) {
    stage.scene.remove(site.group);
    site.dispose();
  }
  state.bowerKey = key;
  bower = BOWERS[key]();
  structure = buildStructure(bower, structureMaterials);
  site = buildSite(bower, structure.feet, siteMaterials);
  stage.scene.add(structure.group, site.group);
  stage.frame(structure.bounds, opening ?? defaultView(key, structure.bounds));

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-bower]')) b.setAttribute('aria-pressed', String(b.dataset['bower'] === key));
  el('bower-name').textContent = bower.name;
  const primary = bower.members.filter((m) => m.tier === 'primary').length;
  const cables = bower.supports.filter((s) => s.kind === 'cable').length;
  el('stats').textContent = `${primary} glulam members · ${bower.members.length - primary} lattice members · ${cables} steel cables · ${bower.graph.edges.size} plant routes`;

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

// ---- controls ------------------------------------------------------------------
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-bower]')) {
  b.addEventListener('click', () => {
    const key = b.dataset['bower'] as BowerKey;
    if (key !== state.bowerKey) showBower(key);
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

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'KeyO') showOverlay(!state.overlay);
  else if (e.code === 'KeyH') {
    document.body.classList.toggle('bare');
    invalidate();
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
  const panel = el('overlay-panel');
  const covered = state.overlay && !document.body.classList.contains('bare') && w > 760 ? panel.offsetWidth + 20 : 0;
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

showBower(state.bowerKey, viewFromUrl(), Number.isFinite(state.budgetM));
showOverlay(state.overlay);
if (url.get('ui') === '0') document.body.classList.add('bare');

stage.renderer.setAnimationLoop(() => {
  stage.controls.update();
  if (stage.syncSize()) dirty = true;
  // nothing moves in a still scene, so it is drawn on demand, with a slow
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
    invalidate,
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
