// Materials for the manufactured structure and the ground: glulam with its
// laminations, glue lines and end grain, slightly greyer larch for the lattice,
// stainless cable, stone pads, and the plain massing of whatever a site
// declares stands beside the Bower.
import * as THREE from 'three';
import { makeEndGrainTextures, makeGlulamTextures, makeGravelTexture, makeSoilTexture } from '../textures.ts';
import type { StructureMaterials } from '../structure/build.ts';
import type { SiteMaterials } from './site.ts';

/**
 * Timber out of doors, kept modest: a few seasons in, not a ruin. Faces open
 * to the sky have begun to silver, the foot of a member is a little darker
 * where rain splashes back off the ground, and no two metres are quite the
 * same tone. A look, with no claim about how fast this timber weathers.
 */
function weathered<M extends THREE.MeshStandardMaterial>(material: M, amount = 1): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms['uWeather'] = { value: amount };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTimberWorld;\nvarying vec3 vTimberNormal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTimberWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTimberNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uWeather;
        varying vec3 vTimberWorld;
        varying vec3 vTimberNormal;
        float timberHash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float timberNoise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(timberHash(i), timberHash(i + vec3(1, 0, 0)), f.x), mix(timberHash(i + vec3(0, 1, 0)), timberHash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(timberHash(i + vec3(0, 0, 1)), timberHash(i + vec3(1, 0, 1)), f.x), mix(timberHash(i + vec3(0, 1, 1)), timberHash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          float drift = timberNoise(vTimberWorld * 1.3) * 0.6 + timberNoise(vTimberWorld * 5.1) * 0.4;
          // the sky-facing faces silver first
          float skyward = smoothstep(0.15, 0.9, normalize(vTimberNormal).y);
          float grey = uWeather * (0.1 + 0.3 * skyward) * (0.55 + 0.9 * drift);
          float luma = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(luma) * vec3(0.94, 0.95, 0.96), clamp(grey, 0.0, 0.6));
          // splash-back at the foot
          float splash = uWeather * (1.0 - smoothstep(0.02, 0.5, vTimberWorld.y)) * (0.5 + 0.5 * drift);
          diffuseColor.rgb *= 1.0 - 0.3 * splash;
          diffuseColor.rgb *= 0.93 + 0.14 * drift;
        }`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + 0.12 * uWeather * smoothstep(0.15, 0.9, normalize(vTimberNormal).y), 0.0, 1.0);');
  };
  return material;
}

export function makeStructureMaterials(): StructureMaterials {
  const gl = makeGlulamTextures();
  const end = makeEndGrainTextures();
  return {
    glulam: weathered(new THREE.MeshStandardMaterial({ map: gl.map, bumpMap: gl.bump, bumpScale: 0.9, roughness: 0.6 })),
    larch: weathered(new THREE.MeshStandardMaterial({ map: gl.map, bumpMap: gl.bump, bumpScale: 0.9, roughness: 0.74, color: 0xe2d2bc }), 1.5),
    glulamEnd: weathered(new THREE.MeshStandardMaterial({ map: end.map, bumpMap: end.bump, bumpScale: 1.2, roughness: 0.8 })),
    larchEnd: weathered(new THREE.MeshStandardMaterial({ map: end.map, bumpMap: end.bump, bumpScale: 1.2, roughness: 0.85, color: 0xe2d2bc }), 1.5),
    steel: new THREE.MeshStandardMaterial({ color: 0xa4a9ae, roughness: 0.38, metalness: 1 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.95 }),
  };
}

export function makeSiteMaterials(): SiteMaterials {
  return {
    gravel: new THREE.MeshStandardMaterial({ map: makeGravelTexture(), roughness: 1 }),
    soil: new THREE.MeshStandardMaterial({ map: makeSoilTexture(), roughness: 1 }),
    mulch: new THREE.MeshStandardMaterial({ color: 0x3a2c21, roughness: 1 }),
    edging: new THREE.MeshStandardMaterial({ color: 0x8d8777, roughness: 0.9 }),
    // what a site declares is shown as plain massing: it is there for its shade, not as a portrait
    massing: new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.95 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 1 }),
    crown: new THREE.MeshStandardMaterial({ color: 0x55703f, roughness: 1, transparent: true }),
  };
}
