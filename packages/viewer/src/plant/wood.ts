// Stem geometry: one tube per stem of the render data. Ported from
// buildWoodGeometry in the prototype (Wisteria/src/skeleton.js). The stems of
// each taxon are built into a mesh of their own, so that each can be drawn in
// its own wood (WoodLook); the geometry itself is the same for every taxon.
//
// Vertices sit ON the contact line; the vertex shader moves each ring out to
// its centre and then to its surface, both by amounts that depend on the day
// being shown (see the wood program in shaders.ts).
//   position = contact point        normal = radial direction of the ring
//   aLife    = (day born, day removed, radius at the end of the run in m, furrow depth)
//   aSup     = (direction away from the support; zero if unsupported, radius scale)
//   aAnchor  = (base of the stem xyz, phase)
import * as THREE from 'three';
import type { RenderStem } from '@horti/core';
import { hash2 } from '../util.ts';
import { removalDay } from './adapter.ts';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;

/** Sides of the tube by its thickest radius in metres: drawing detail only. */
function radialSegments(maxRadiusM: number, role: RenderStem['role']): number {
  if (maxRadiusM > 0.03) return 16;
  if (maxRadiusM > 0.012) return 10;
  if (maxRadiusM > 0.006) return 7;
  return role === 'lateral' ? 5 : 4;
}

export interface WoodGeometry {
  geometry: THREE.BufferGeometry;
  /** Points over all stems. */
  points: number;
}

/**
 * `indexOf` gives each stem's place in the whole render data, where the stems
 * given are only some of it (those of one taxon): a stem's phase in the wind
 * is drawn from that place, and its leaves are given the same one.
 */
export function buildWoodGeometry(stems: readonly RenderStem[], indexOf: (at: number) => number = (at) => at): WoodGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const life: number[] = [];
  const sup: number[] = [];
  const anc: number[] = [];
  const idx: number[] = [];
  let vcount = 0;
  let points = 0;
  const T = new V3();
  const prevT = new V3();
  const N = new V3();
  const B = new V3();
  const q = new THREE.Quaternion();
  const box = new THREE.Box3();

  stems.forEach((stem, at) => {
    const stemIndex = indexOf(at);
    const n = stem.bornDay.length;
    if (n < 2) return;
    points += n;
    // contact line, direction away from the support and the final centre line, in the three.js frame
    const contact: THREE.Vector3[] = [];
    const away: THREE.Vector3[] = [];
    const centre: THREE.Vector3[] = [];
    let rMax = 0;
    for (let i = 0; i < n; i++) {
      const c = new V3(stem.contact[3 * i]!, stem.contact[3 * i + 2]!, -stem.contact[3 * i + 1]!);
      const a = new V3(stem.away[3 * i]!, stem.away[3 * i + 2]!, -stem.away[3 * i + 1]!);
      const r = stem.radiusMm[i]! / 1000;
      rMax = Math.max(rMax, r);
      contact.push(c);
      away.push(a);
      centre.push(c.clone().addScaledVector(a, r));
      box.expandByPoint(c);
    }
    const radial = radialSegments(rMax, stem.role);
    const ring = radial + 1;
    const base = vcount;
    const anchor = centre[0]!;
    const phase = hash2(stemIndex, 17);
    // how strongly the bark furrows: most on the trunk stems
    const flute = stem.role === 'leader' ? 1 : stem.order === 1 ? 0.5 : 0.2;
    let s = 0;
    let v = 0;
    // one ring per point, and a last one drawn shut so the tube has no open end
    for (let k = 0; k <= n; k++) {
      const i = Math.min(k, n - 1);
      const closing = k === n;
      if (!closing) {
        T.subVectors(centre[Math.min(n - 1, i + 1)]!, centre[Math.max(0, i - 1)]!);
        if (T.lengthSq() < 1e-12) T.copy(prevT);
        else T.normalize();
        if (i === 0) {
          N.set(0, 1, 0);
          if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
        } else {
          N.applyQuaternion(q.setFromUnitVectors(prevT, T));
        }
        N.addScaledVector(T, -N.dot(T)).normalize();
        B.crossVectors(T, N);
        prevT.copy(T);
        if (i > 0) {
          const ds = centre[i]!.distanceTo(centre[i - 1]!);
          s += ds;
          v += ds / (TAU * Math.max(stem.radiusMm[i]! / 1000, 0.004));
        }
      }
      const born = stem.bornDay[i]!;
      const removed = removalDay(stem.removedDay[i]!);
      const finalR = stem.radiusMm[i]! / 1000;
      for (let j = 0; j < ring; j++) {
        const th = ((j % radial) / radial) * TAU;
        const cx = Math.cos(th);
        const sx = Math.sin(th);
        pos.push(contact[i]!.x, contact[i]!.y, contact[i]!.z);
        nor.push(N.x * cx + B.x * sx, N.y * cx + B.y * sx, N.z * cx + B.z * sx);
        uv.push(j / radial, v);
        // furrows only ever cut inwards from the envelope
        const ridge = 0.5 + 0.5 * (0.5 * Math.sin(3 * th + 7 * s + phase * 9) + 0.31 * Math.sin(2 * th - 13 * s + phase * 5) + 0.19 * Math.sin(5 * th + 23 * s));
        life.push(born, removed, finalR, flute * 0.22 * ridge);
        sup.push(away[i]!.x, away[i]!.y, away[i]!.z, closing ? 0 : 1);
        anc.push(anchor.x, anchor.y, anchor.z, phase);
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < radial; j++) {
        const p0 = base + i * ring + j;
        idx.push(p0, p0 + 1, p0 + ring, p0 + 1, p0 + ring + 1, p0 + ring);
      }
    }
    vcount += (n + 1) * ring;
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aLife', new THREE.Float32BufferAttribute(life, 4));
  g.setAttribute('aSup', new THREE.Float32BufferAttribute(sup, 4));
  g.setAttribute('aAnchor', new THREE.Float32BufferAttribute(anc, 4));
  g.setIndex(idx);
  if (!box.isEmpty()) {
    g.boundingBox = box.clone().expandByScalar(0.3);
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  }
  return { geometry: g, points };
}
