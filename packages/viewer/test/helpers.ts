import * as THREE from 'three';
import type { PlantMaterials } from '../src/plant/view.ts';

/** Stand-ins for the real materials, which need a canvas for their textures. `woods` lists the taxa whose bark was asked for. */
export function materials(): PlantMaterials & { woods: string[] } {
  const leaf = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  const flower = new THREE.MeshBasicMaterial();
  const fruit = new THREE.MeshBasicMaterial();
  const appendage = new THREE.MeshBasicMaterial();
  const woods: string[] = [];
  const bark = new Map<string, { material: THREE.Material; depth: THREE.Material }>();
  return {
    woods,
    wood: (look) => {
      if (!bark.has(look.taxonId)) {
        woods.push(look.taxonId);
        bark.set(look.taxonId, { material: new THREE.MeshBasicMaterial(), depth: new THREE.MeshBasicMaterial() });
      }
      return bark.get(look.taxonId)!;
    },
    leaf: () => leaf,
    flower: () => flower,
    fruit: () => fruit,
    appendage: () => appendage,
  };
}

export function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera();
  c.position.set(6, 2, 8);
  return c;
}
