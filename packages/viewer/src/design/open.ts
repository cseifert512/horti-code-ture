// Opening a design: a Bower description and, with it, a planting plan, as two
// JSON files a designer hands over. Everything is read and checked by the core
// (readBower, parsePlantingPlan, plantingOn); this module only sorts out which
// file is which and keeps the last design that was read without fault.
//
// Nothing here touches the scene. A file that is refused changes nothing: the
// viewer shows the reason and goes on showing what it showed before.
import { type Bower, type PlantingPlan, type Viewpoint, parsePlantingPlan, plantingOn, readBower } from '@horti/core';
import arbourBower from '../../../../examples/arbour.bower.json?raw';
import arbourPlanting from '../../../../examples/arbour.planting.json?raw';
import { growable } from '../plant/scenario.ts';

/** A file as it was chosen or dropped: its name and its text. */
export interface DesignFile {
  name: string;
  text: string;
}

export interface OpenedDesign {
  bower: Bower;
  /** Where a visitor stands, from the description; may be empty. */
  viewpoints: Viewpoint[];
  /** Things the core asks a designer to look at. They do not stop a run. */
  warnings: string[];
  /** Null when only the structure was opened. */
  plan: PlantingPlan | null;
  files: { bower: string; planting: string | null };
}

export type OpenResult = { ok: true; design: OpenedDesign } | { ok: false; error: string };

/** The hand-written arbour of the repository's examples, so that there is a design to open with no files to hand. */
export const ARBOUR_EXAMPLE: readonly DesignFile[] = [
  { name: 'arbour.bower.json', text: arbourBower },
  { name: 'arbour.planting.json', text: arbourPlanting },
];

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Read a design from the files given: one Bower description, and at most one
 * planting plan. Which is which is told from what is inside, not from the
 * name. Any fault refuses the whole design, and the error names the file and
 * the reason in the core's own words.
 */
export function openDesign(files: readonly DesignFile[]): OpenResult {
  if (files.length === 0) return { ok: false, error: 'No file was given.' };
  const descriptions: { name: string; json: unknown }[] = [];
  const plans: { name: string; json: unknown }[] = [];
  for (const file of files) {
    let json: unknown;
    try {
      json = JSON.parse(file.text);
    } catch (e) {
      return { ok: false, error: `${file.name} is not JSON: ${message(e)}` };
    }
    const keys = typeof json === 'object' && json !== null ? json : {};
    if ('members' in keys) descriptions.push({ name: file.name, json });
    else if ('plants' in keys) plans.push({ name: file.name, json });
    else return { ok: false, error: `${file.name} is neither a Bower description (it has no "members") nor a planting plan (it has no "plants").` };
  }
  const names = files.map((f) => f.name).join(', ');
  if (descriptions.length === 0) return { ok: false, error: `No Bower description among the files opened (${names}). A planting plan cannot be drawn without the structure it is planted on.` };
  if (descriptions.length > 1) return { ok: false, error: `More than one Bower description was opened (${descriptions.map((d) => d.name).join(', ')}). Open one design at a time.` };
  if (plans.length > 1) return { ok: false, error: `More than one planting plan was opened (${plans.map((d) => d.name).join(', ')}). Open one with its Bower description.` };

  try {
    const description = descriptions[0]!;
    const { bower, viewpoints, warnings } = readBower(description.json, description.name);
    let plan: PlantingPlan | null = null;
    const planFile = plans[0];
    if (planFile) {
      plan = parsePlantingPlan(planFile.json, planFile.name);
      // the plan must fit this structure and name taxa that can be grown: find out now, not when it is grown
      try {
        plantingOn(bower, plan, { taxa: growable(), years: 1 });
      } catch (e) {
        return { ok: false, error: `${planFile.name}: ${message(e)}` };
      }
    }
    return { ok: true, design: { bower, viewpoints, warnings, plan, files: { bower: description.name, planting: planFile?.name ?? null } } };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/** Holds the design last opened without fault, and the reason the latest attempt was refused, if it was. */
export class DesignDesk {
  current: OpenedDesign | null = null;
  error: string | null = null;

  /** True if the files were a design, which is then the current one. False leaves the current one as it was. */
  open(files: readonly DesignFile[]): boolean {
    const result = openDesign(files);
    if (result.ok) {
      this.current = result.design;
      this.error = null;
    } else {
      this.error = result.error;
    }
    return result.ok;
  }
}
