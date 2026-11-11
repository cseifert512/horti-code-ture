// The design answers of a run, beside the picture: which plant is in flower in
// which month, and how much evergreen a winter visitor sees against the design
// target. Every figure is the core's (sim/report.ts); this module only lays
// them out.
//
// The calendar is a grid of plants by months. A cell is filled when the plant
// had flowers open on the 15th, darker to brighter with how many, in one hue.
// A row for a plant whose flowering is not modelled is hatched, so that "no
// flowers" is not read where the truth is "not known yet".
import type { DesignReport, Viewpoint } from '@horti/core';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** How many steps of brightness a filled cell can take. */
const STEPS = 4;

export interface ReportActions {
  /** Take the timeline to an ISO date. */
  goTo(iso: string): void;
  /** Stand where a viewpoint stands. */
  standAt(viewpoint: Viewpoint): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const percent = (x: number) => `${(100 * x).toFixed(x < 0.1 ? 1 : 0)}%`;
const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

export function renderReport(container: HTMLElement, report: DesignReport, actions: ReportActions): void {
  const notModelled = new Set(report.alerts.filter((a) => a.kind === 'not_modelled' && a.plantId).map((a) => a.plantId));
  const most = Math.max(1, ...report.months.flatMap((m) => Object.values(m.flowers)));
  const step = (n: number) => (n <= 0 ? 0 : Math.max(1, Math.ceil((STEPS * Math.log1p(n)) / Math.log1p(most))));

  // ---- flowering calendar -----------------------------------------------------------
  const calendar = el('table', 'calendar');
  const head = calendar.createTHead().insertRow();
  head.append(el('th'));
  for (const m of report.months) {
    const th = el('th');
    const button = el('button', undefined, MONTHS[m.month - 1]![0]);
    button.type = 'button';
    button.title = `Show ${m.date}`;
    button.setAttribute('aria-label', `Show the plants on ${m.date}`);
    button.addEventListener('click', () => actions.goTo(m.date));
    th.append(button);
    head.append(th);
  }
  const body = calendar.createTBody();
  for (const plant of report.plants) {
    const row = body.insertRow();
    const name = el('th', undefined, plant.plantId);
    name.scope = 'row';
    name.title = plant.label;
    row.append(name);
    const unknown = notModelled.has(plant.plantId);
    for (const m of report.months) {
      const n = m.flowers[plant.plantId] ?? 0;
      const cell = row.insertCell();
      cell.className = unknown ? 'unknown' : `s${step(n)}`;
      cell.title = unknown ? `${plant.label}: flowers are not modelled yet` : `${plant.label}, ${MONTHS[m.month - 1]}: ${n === 0 ? 'none open' : `${n.toLocaleString()} open`} on the 15th`;
    }
  }
  // the bottom line: is anything in flower at all
  const any = calendar.createTFoot().insertRow();
  const anyName = el('th', undefined, 'anything');
  anyName.scope = 'row';
  any.append(anyName);
  for (const m of report.months) {
    const cell = any.insertCell();
    const bare = report.flowerlessMonths.includes(m.month);
    cell.className = bare ? 'bare' : 'some';
    cell.title = `${MONTHS[m.month - 1]}: ${bare ? 'nothing in flower' : 'something in flower'} on the 15th`;
  }

  const key = el('p', 'note key');
  key.append('Flowers open on the 15th: fewer ');
  for (let s = 1; s <= STEPS; s++) key.append(el('i', `s${s}`));
  key.append(' more');
  if (notModelled.size) {
    key.append(' · ', el('i', 'unknown'), ' not modelled yet');
  }

  const gaps = el('p', 'finding');
  if (report.flowerlessMonths.length) {
    gaps.append(el('b', undefined, `Nothing in flower in ${list(report.flowerlessMonths.map((m) => MONTHS[m - 1]!))}.`));
    if (notModelled.size) gaps.append(' Some plants have no flowers modelled yet, so this may overstate the gaps.');
  } else gaps.append(el('b', undefined, 'Something is in flower in every month.'));

  // ---- winter cover -------------------------------------------------------------------
  const winter = el('div', 'winter');
  if (report.winter) {
    const [lo, hi] = report.winter.target.value ?? [0, 0];
    const full = Math.max(0.5, hi * 1.25);
    /** One reading against the target band: a name, a bar and the figure. */
    const meterRow = (name: HTMLElement, value: number, against: 'below' | 'within' | 'above', what: string, aside = ''): HTMLElement => {
      const row = el('div', 'meter-row');
      const meter = el('div', 'meter');
      meter.setAttribute('role', 'img');
      meter.setAttribute('aria-label', `${percent(value)} ${what}, ${against} the target of ${percent(lo)} to ${percent(hi)}`);
      const band = el('i', 'band');
      band.style.left = `${(lo / full) * 100}%`;
      band.style.width = `${((hi - lo) / full) * 100}%`;
      const fill = el('i', `fill ${against}`);
      fill.style.width = `${Math.min(1, value / full) * 100}%`;
      meter.append(band, fill);
      const reading = el('span', 'reading');
      reading.append(el('b', undefined, percent(value)), ` ${against} target${aside}`);
      row.append(name, meter, reading);
      return row;
    };
    // as laid out: where the plants that keep their leaves are, however thin the leaf
    winter.append(meterRow(el('span', 'where', 'As laid out: route held by evergreens'), report.winter.routeHeldByEvergreens, report.winter.layoutAgainst, 'of the route held by evergreens'));
    // as seen: what a visitor standing in each place reads as green
    for (const v of report.winter.views) {
      const viewpoint = report.viewpoints.find((p) => p.id === v.viewpointId);
      const where = el('button', 'where', viewpoint?.label ?? v.viewpointId);
      where.type = 'button';
      where.title = 'Stand here';
      if (viewpoint) where.addEventListener('click', () => actions.standAt(viewpoint));
      winter.append(meterRow(where, v.evergreen, v.against, 'evergreen cover as seen', ` · hides ${percent(v.timberHidden)} of the timber`));
    }
    winter.append(
      el(
        'p',
        'note',
        `Read on ${report.winter.date}, two ways. As laid out: the share of all route held by plants that keep their leaves. As seen from each place: evergreen leaf as a share of the structure's extent in the view, open bays included, and how much of the timber it hides. The band is the design target of ${percent(lo)} to ${percent(hi)} (KEY.md section 6): a target to test, not a finding. Where the first reading meets the target and the second does not, the difference is leaf density, which has not been measured. Select a place to stand there.`,
      ),
    );
  } else {
    winter.append(el('p', 'note', 'The run has no winter to read, or no viewpoints to read it from.'));
  }

  // coverage is read from where a visitor stands: a design that names no viewpoint has none to show
  const coverage = report.viewpoints.length ? [el('h2', undefined, 'Evergreen cover in winter'), winter] : [];
  container.replaceChildren(el('h2', undefined, `In flower, month by month · ${report.year}`), calendar, key, gaps, ...coverage);
}
