// Where the camera stands for a view of a specimen: back far enough to take in
// the whole plant, or close on one organ that findSubject (specimen.ts) chose
// from the render data. The camera always stands to the south of the frame,
// which is the side the sun is on and the side the rails are fixed to.
import * as THREE from 'three';
import { type RenderData, stemRadiusM } from '@horti/core';
import { type Poise, type TaxonLook, formOf } from '../plant/look.ts';
import type { ViewPreset } from '../scene/stage.ts';
import type { Subject } from './specimen.ts';

type Triple = readonly [number, number, number];
/** Core frame (x east, y north, z up) to three.js. */
const three = (t: Triple): THREE.Vector3 => new THREE.Vector3(t[0], t[2], -t[1]);

/** How much of the height of the picture a close subject takes. */
const FILL = 0.6;
/** How far above the middle of the picture the subject sits, as a share of its height: the caption lies along the bottom. */
const RAISED = 0.06;

/** Half the height of what is seen at one metre, for a field of view. */
const halfHeight = (fovDeg: number): number => Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);

/** The camera at `distance` from `centre`, in the direction `from` (core frame: from the subject towards the camera). */
function stand(centre: THREE.Vector3, from: Triple, distance: number, fovDeg: number): ViewPreset {
  // camera and aim are lowered together, so that the subject sits a little above the middle
  const lower = new THREE.Vector3(0, -RAISED * 2 * distance * halfHeight(fovDeg), 0);
  const target = centre.clone().add(lower);
  return { position: target.clone().addScaledVector(three(from).normalize(), distance), target };
}

/** How far back a thing `size` metres across is seen at FILL of the picture's height. */
const closeUp = (size: number, fovDeg: number): number => size / 2 / halfHeight(fovDeg) / FILL;

/**
 * The whole plant: everything it grew in the run, so that the camera stands
 * in the same place on every date of that run and its seasons can be laid
 * side by side.
 */
export function frameWhole(data: RenderData, fovDeg: number, aspect: number): ViewPreset {
  const box = new THREE.Box3();
  for (const stem of data.stems) for (let i = 0; i < stem.bornDay.length; i++) box.expandByPoint(three([stem.contact[3 * i]!, stem.contact[3 * i + 1]!, stem.contact[3 * i + 2]!]));
  for (const leaf of data.leaves) box.expandByPoint(three(leaf.position));
  for (const flower of data.flowers) box.expandByPoint(three(flower.position));
  if (box.isEmpty()) box.expandByPoint(new THREE.Vector3(0, 0.5, 0));
  // a plant that has hardly grown is still shown with some of the frame round it
  box.expandByScalar(0.3);
  const size = box.getSize(new THREE.Vector3());
  const tall = Math.max(size.y, 1.2);
  const wide = Math.max(Math.hypot(size.x, size.z), 1.2);
  // far enough back for its height and for its width, with a margin
  const distance = Math.max(tall / (2 * halfHeight(fovDeg)), wide / (2 * halfHeight(fovDeg) * aspect)) * 1.25;
  return stand(box.getCenter(new THREE.Vector3()), [-0.32, -1, 0.22], distance, fovDeg);
}

/** The way a flower or fruit runs from its attachment (core frame): the data's direction, or plumb as its model is authored. */
const axisOf = (direction: Triple | undefined, poise: Poise): THREE.Vector3 => (direction ? three(direction).normalize() : new THREE.Vector3(0, poise === 'hangs' ? -1 : 1, 0));

/** Close on one organ. Null for the whole plant, or where there is nothing to look at. */
export function frameSubject(data: RenderData, subject: Subject, day: number, look: TaxonLook, fovDeg: number): ViewPreset | null {
  switch (subject.kind) {
    case 'whole':
    case 'none':
      return null;
    case 'leaf': {
      const { leaf } = subject;
      // from above and in front: on to the upper side of the blade
      return stand(three(leaf.position).addScaledVector(three(leaf.direction).normalize(), leaf.lengthM / 2), [-0.3, -0.75, 0.6], closeUp(leaf.lengthM * 1.15, fovDeg), fovDeg);
    }
    case 'flower':
    case 'fruit': {
      const organ = subject.kind === 'flower' ? subject.flower : subject.fruit;
      const forms = subject.kind === 'flower' ? look.flowers : look.fruits;
      const asset = forms ? formOf<{ poise: Poise; centreAlong: number }>(forms, organ.form) : { poise: 'hangs' as const, centreAlong: 0.5 };
      const centre = three(organ.position).addScaledVector(axisOf(organ.direction, asset.poise), organ.lengthM * asset.centreAlong);
      // one that hangs is seen from the level; one held up, from a little above
      return stand(centre, asset.poise === 'hangs' ? [-0.35, -1, 0.12] : [-0.3, -0.85, 0.45], closeUp(organ.lengthM * 1.25, fovDeg), fovDeg);
    }
    case 'stem':
    case 'hold_stem': {
      const { stem, pointIndex: i } = subject;
      const radius = stemRadiusM(data, stem, i, day);
      const centre = three([stem.contact[3 * i]!, stem.contact[3 * i + 1]!, stem.contact[3 * i + 2]!]).addScaledVector(three([stem.away[3 * i]!, stem.away[3 * i + 1]!, stem.away[3 * i + 2]!]), radius);
      // a stretch of stem long enough to show its bark and what it lies on
      const stretch = subject.kind === 'stem' ? Math.min(0.5, Math.max(0.2, radius * 30)) : 0.32;
      return stand(centre, [-0.4, -1, 0.15], closeUp(stretch, fovDeg), fovDeg);
    }
    case 'hold': {
      const { appendage } = subject;
      const centre = three(appendage.position).addScaledVector(three(appendage.direction).normalize(), appendage.lengthM / 2);
      return stand(centre, [-0.4, -1, 0.2], closeUp(Math.max(appendage.lengthM * 2.5, 0.07), fovDeg), fovDeg);
    }
  }
}
