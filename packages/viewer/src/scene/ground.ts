// The ground a Bower stands on and the edge of the world behind it: a lawn
// that is not one flat green to the horizon, and a distant belt of trees so
// that the horizon is a place and not a line. Scene dressing only: nothing
// here is structure, a plant of the scheme, or a claim about a site.
import * as THREE from 'three';
import { makeGroundTexture, makeTreeBeltTexture } from '../textures.ts';

export interface Ground {
  group: THREE.Group;
  /** Fit the distant belt to the size of the subject, so that it stays at the edge of the view. */
  fit(subjectRadiusM: number): void;
}

/**
 * A lawn whose colour drifts over metres and tens of metres, with faint
 * mowing stripes, and whose blade texture gives way to its own average far
 * off, where it would otherwise shimmer and show its repeats.
 */
function makeLawnMaterial(): THREE.MeshStandardMaterial {
  const map = makeGroundTexture();
  map.repeat.set(220, 220);
  const material = new THREE.MeshStandardMaterial({ map, roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec2 vGround;
        float groundHash(vec2 p) {
          p = fract(p * vec2(0.1031, 0.1030));
          p += dot(p, p.yx + 33.33);
          return fract((p.x + p.y) * p.x);
        }
        float groundNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(groundHash(i), groundHash(i + vec2(1.0, 0.0)), f.x), mix(groundHash(i + vec2(0.0, 1.0)), groundHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          float away = length(vViewPosition);
          // the blades' own average, where they are too small to see
          vec3 mean = vec3(0.118, 0.172, 0.062);
          diffuseColor.rgb = mix(diffuseColor.rgb, mean, smoothstep(18.0, 90.0, away));
          // drift: patches a few metres across, and broad sweeps beyond them
          float patchy = groundNoise(vGround * 0.31) * 0.6 + groundNoise(vGround * 1.7) * 0.4;
          float sweep = groundNoise(vGround * 0.045 + 7.3);
          diffuseColor.rgb *= 0.84 + 0.22 * patchy + 0.16 * sweep;
          // drier, yellower ground in places
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.22, 1.08, 0.72), smoothstep(0.55, 0.9, sweep * 0.6 + patchy * 0.4) * 0.5);
          // mowing stripes, seen only close by
          float stripe = smoothstep(0.42, 0.58, abs(fract(vGround.x * 0.62 + 0.35 * groundNoise(vGround * 0.08)) - 0.5) * 2.0);
          diffuseColor.rgb *= 1.0 + (stripe - 0.5) * 0.07 * (1.0 - smoothstep(20.0, 70.0, away));
        }`,
      );
  };
  return material;
}

export function makeGround(): Ground {
  const group = new THREE.Group();
  group.name = 'ground';
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(420, 96), makeLawnMaterial());
  lawn.name = 'lawn';
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  group.add(lawn);

  // a belt of trees far off, as silhouettes that the haze softens
  const texture = makeTreeBeltTexture();
  texture.repeat.set(9, 1);
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 96, 1, true),
    // its haze is painted in, and it takes the colour of the day's light: the scene's own fog would grey it out
    new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.BackSide, fog: false }),
  );
  belt.name = 'distant trees';
  group.add(belt);

  return {
    group,
    fit(subjectRadiusM: number): void {
      const radius = Math.max(150, subjectRadiusM * 17);
      const height = radius * 0.085;
      belt.scale.set(radius, height, radius);
      belt.position.y = height / 2 - 0.4;
    },
  };
}
