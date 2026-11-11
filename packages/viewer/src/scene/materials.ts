// Materials for the manufactured structure and the ground, as in the prototype
// (Wisteria/src/main.js): pale glulam with glue lines, slightly greyer larch
// for the lattice, stainless cable, stone pads.
import * as THREE from 'three';
import { makeGlulamTextures, makeGravelTexture, makeSoilTexture } from '../textures.ts';
import type { StructureMaterials } from '../structure/build.ts';
import type { SiteMaterials } from './site.ts';

export function makeStructureMaterials(): StructureMaterials {
  const gl = makeGlulamTextures();
  return {
    glulam: new THREE.MeshStandardMaterial({ map: gl.map, bumpMap: gl.bump, bumpScale: 0.6, roughness: 0.62 }),
    larch: new THREE.MeshStandardMaterial({ map: gl.map, bumpMap: gl.bump, bumpScale: 0.6, roughness: 0.75, color: 0xe6d6c0 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.95 }),
  };
}

export function makeSiteMaterials(): SiteMaterials {
  return {
    gravel: new THREE.MeshStandardMaterial({ map: makeGravelTexture(), roughness: 1 }),
    soil: new THREE.MeshStandardMaterial({ map: makeSoilTexture(), roughness: 1 }),
    mulch: new THREE.MeshStandardMaterial({ color: 0x3a2c21, roughness: 1 }),
  };
}
