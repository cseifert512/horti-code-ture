// Shader patches, ported from the Wisteria prototype (Wisteria/src/shaders.js).
//
// Each organ type gets a small vertex "program" spliced into three.js'
// standard material, so lighting, shadows and tone mapping stay stock.
//
// What changed in the port: the prototype's programs worked out the season
// themselves from a clock, with the dates of leaf flush, flowering and leaf
// fall written in as constants. These programs know no dates.
//   wood     asks the adapter's clock whether a point exists yet and how
//            thick it is (CLOCK_GLSL, from adapter.ts)
//   organs   are handed explicit states per instance (aState), which the
//            adapter computes from the engine's dates
// Also left out: the circumnutation of shoot tips. Its direction is a trait
// of one twiner and must not be applied to every stem.
import * as THREE from 'three';
import { CLOCK_GLSL, clock } from './adapter.ts';

/**
 * How Wisteria sinensis wood LOOKS as it ages: the ages, in days, over which
 * the bark material blends from green shoot to smooth brown to grey fissured
 * bark, over which furrows deepen, and over which a stem stops swaying.
 * Carried over from the prototype's wood shader (0.3 to 1.2, 1.5 to 5.5, 0.8
 * to 5 and 0.15 to 1.6 growing seasons). These colour a material; nothing in
 * the simulation reads them.
 */
export const WISTERIA_WOOD_LOOK = {
  greenDays: [110, 440],
  brownDays: [550, 2000],
  furrowDays: [290, 1825],
  swayDays: [55, 585],
} as const;

export const shared = {
  uTime: { value: 0 },
  uWind: { value: 0.6 },
  uWindDir: { value: new THREE.Vector2(0.92, 0.39) },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uGreenDays: { value: new THREE.Vector2(...WISTERIA_WOOD_LOOK.greenDays) },
  uBrownDays: { value: new THREE.Vector2(...WISTERIA_WOOD_LOOK.brownDays) },
  uFurrowDays: { value: new THREE.Vector2(...WISTERIA_WOOD_LOOK.furrowDays) },
  uSwayDays: { value: new THREE.Vector2(...WISTERIA_WOOD_LOOK.swayDays) },
};

const COMMON = /* glsl */ `
uniform float uTime, uWind;
uniform vec2 uWindDir;
uniform vec2 uGreenDays, uBrownDays, uFurrowDays, uSwayDays;
${CLOCK_GLSL}

vec2 swayVec(float ph, vec2 xz) {
  float gust = 0.55 + 0.45 * sin(uTime * 0.37 - dot(xz, uWindDir) * 0.7);
  float a = sin(uTime * 1.55 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.9) * 0.22 + 0.3;
  float b = sin(uTime * 1.15 + ph * 1.3) * 0.5 + sin(uTime * 3.3 + ph * 0.7) * 0.18;
  return (uWindDir * a + vec2(-uWindDir.y, uWindDir.x) * b * 0.7) * gust * uWind;
}

// Motion a stem imparts to whatever grows on it: young wood bends in the
// wind. flex is 1 for a new shoot and 0 for old wood.
vec3 hostOffset(vec3 c, vec3 anchor, float ph, float flex) {
  float w = distance(c, anchor) * flex * 0.035;
  vec2 s = swayVec(ph * 6.0, anchor.xz);
  return vec3(s.x * w, 0.0, s.y * w);
}

// Nothing may be pushed INTO its support: drop the inward part of a motion.
vec3 offSupport(vec3 off, vec3 sup) {
  float l = length(sup);
  if (l < 0.01) return off;
  vec3 d = sup / l;
  return off - d * min(0.0, dot(off, d));
}

vec3 pendulum(vec3 p, vec3 pivot, float amp) {
  float d = distance(p, pivot);
  vec2 s = swayVec(dot(pivot, vec3(1.7, 0.9, 2.3)), pivot.xz) * amp;
  return vec3(s.x * d, dot(s, s) * d * 0.5, s.y * d);
}
`;

interface Program {
  head: string;
  begin: string;
  world: string;
  fragHead?: string;
  fragColor?: string;
}

export type ProgramKind = 'wood' | 'leaf' | 'raceme' | 'pod' | 'litter';

const PROGRAMS: Record<ProgramKind, Program> = {
  // ---- stems: there or not, and how thick, by the adapter's clock -------------
  wood: {
    head: /* glsl */ `
      attribute vec4 aLife;    // day born, day removed, radius at the end of the run (m), furrow depth
      attribute vec4 aSup;     // direction away from the support (zero if unsupported), radius scale
      attribute vec4 aAnchor;  // base of the stem, phase
      varying float vAge;
    `,
    // position is where the stem TOUCHES its support. The centre stands one
    // radius out from there, so the stem thickens away from the structure,
    // never into it.
    begin: /* glsl */ `
      float age = uDay - aLife.x;
      float alive = stemPresent( aLife.x, aLife.y );
      float r = stemRadius( aLife.x, aLife.z );
      vec3 centre = position + aSup.xyz * r;
      // bark furrows deepen with age and only ever cut inwards
      float skin = r * aSup.w * ( 1.0 - aLife.w * smoothstep( uFurrowDays.x, uFurrowDays.y, age ) );
      vec3 transformed = centre + normal * ( skin * alive );
      vAge = age;
    `,
    world: /* glsl */ `
      float flex = 1.0 - smoothstep( uSwayDays.x, uSwayDays.y, uDay - aLife.x );
      vec3 wOff = offSupport( hostOffset( position, aAnchor.xyz, aAnchor.w, flex ), aSup.xyz );
    `,
    fragHead: /* glsl */ `varying float vAge; uniform vec2 uGreenDays, uBrownDays;`,
    // green shoot -> smooth brown -> grey fissured bark
    fragColor: /* glsl */ `
      {
        vec3 tex = diffuseColor.rgb;
        float yng = 1.0 - smoothstep( uGreenDays.x, uGreenDays.y, vAge );
        float mid = 1.0 - smoothstep( uBrownDays.x, uBrownDays.y, vAge );
        vec3 green = vec3( 0.21, 0.30, 0.085 ) * ( 0.75 + 0.6 * tex.g );
        vec3 brown = vec3( 0.30, 0.20, 0.115 ) * ( 0.5 + 1.1 * tex.g );
        vec3 grey = tex * vec3( 0.80, 0.76, 0.71 );
        diffuseColor.rgb = mix( mix( grey, brown, mid ), green, yng );
      }
    `,
  },

  // ---- compound leaves ----------------------------------------------------------
  leaf: {
    head: /* glsl */ `
      attribute vec4 aPart;
      attribute vec4 aState;  // expansion, autumn colour, fall, -
      attribute vec4 aHost;   // base of the bearing stem, stem phase
      attribute vec4 aSup;    // the stem's direction away from its support, how freely it sways
      attribute vec4 aSeat;   // from the stem's contact line out to its surface, where the leaf stands
      varying vec3 vLeaf;     // young, autumn, variation
    `,
    begin: /* glsl */ `
      float grown = aState.x;
      // leaflets do not all let go together
      float fall = clamp( aState.z * 1.25 - max( aPart.w, 0.0 ) * 0.25, 0.0, 1.0 );
      float lifeS = grown * ( 1.0 - fall );
      vec3 transformed = position;
      // unfolding: leaflets start clasped along the rachis and droop
      float isBlade = step( 0.0, aPart.w );
      float open = smoothstep( 0.1, 0.9, grown );
      vec3 rel = transformed - aPart.xyz;
      rel.x *= mix( 0.25, 1.0, mix( 1.0, open, isBlade ) );
      rel.y -= isBlade * ( 1.0 - open ) * length( rel.xz ) * 0.9;
      transformed = ( aPart.xyz + rel ) * lifeS;
      vLeaf = vec3( 1.0 - grown, aState.y, aPart.w );
    `,
    world: /* glsl */ `
      vec3 org = instanceMatrix[3].xyz;
      vec3 wOff = aSeat.xyz + offSupport( hostOffset( org, aHost.xyz, aHost.w, aSup.w ), aSup.xyz )
                + pendulum( wp, org, 0.07 );
      wOff.y -= fall * fall * 0.35;
    `,
    fragHead: /* glsl */ `varying vec3 vLeaf;`,
    fragColor: /* glsl */ `
      {
        float lum = diffuseColor.g;
        float v = clamp( vLeaf.z, 0.0, 1.0 );
        vec3 green = mix( vec3( 0.145, 0.30, 0.050 ), vec3( 0.19, 0.36, 0.065 ), v );
        vec3 bronze = vec3( 0.40, 0.27, 0.085 );
        vec3 yellow = mix( vec3( 0.80, 0.56, 0.05 ), vec3( 0.62, 0.36, 0.06 ), v * v );
        vec3 c = mix( green, bronze, vLeaf.x * 0.85 );
        c = mix( c, yellow, vLeaf.y );
        diffuseColor.rgb = c * lum * 1.45;
      }
    `,
  },

  // ---- racemes --------------------------------------------------------------------
  raceme: {
    head: /* glsl */ `
      attribute vec4 aPart;   // flower base, t along the raceme (<0: rachis)
      attribute vec4 aState;  // elongation, share opened, share shed, stalk
      attribute vec4 aInst;   // swing room (0..1), random, -, -
      varying float vOpen;
    `,
    begin: /* glsl */ `
      float isR = step( aPart.w, -0.5 );
      float ft = mix( aPart.w, -aPart.w - 1.0, isR );
      float el = aState.x;
      // opening, then petal fall, each run up the raceme from its base
      float open = smoothstep( ft - 0.12, ft + 0.12, aState.y * 1.24 - 0.12 );
      float fall = smoothstep( ft - 0.12, ft + 0.12, aState.z * 1.24 - 0.12 );
      float fs = mix( 0.3, 1.0, open ) * ( 1.0 - fall ) * smoothstep( 0.0, 0.45, el + 0.25 - ft * 0.25 );
      float rs = ( 0.4 + 0.6 * el ) * aState.w;
      vec3 base = aPart.xyz;
      vec3 rel = position - base;
      base.y *= mix( 0.2, 1.0, el );
      base.xz *= mix( 0.5, 1.0, el );
      vec3 transformed = base + rel * mix( fs, rs, isR );
      vOpen = mix( open, 1.0, isR );
    `,
    world: /* glsl */ `
      vec3 wOff = pendulum( wp, instanceMatrix[3].xyz, 0.13 * aInst.x );
    `,
    fragHead: /* glsl */ `varying float vOpen;`,
    fragColor: /* glsl */ `
      diffuseColor.rgb *= mix( vec3( 0.62, 0.55, 0.86 ), vec3( 1.0 ), vOpen );
    `,
  },

  // ---- pods -------------------------------------------------------------------------
  pod: {
    head: /* glsl */ `
      attribute vec4 aState;  // size, ripeness, -, -
      varying float vRipe;
    `,
    begin: /* glsl */ `
      vec3 transformed = position * aState.x;
      vRipe = aState.y;
    `,
    world: /* glsl */ `
      vec3 wOff = pendulum( wp, instanceMatrix[3].xyz, 0.08 );
    `,
    fragHead: /* glsl */ `varying float vRipe;`,
    fragColor: /* glsl */ `
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.20, 0.145, 0.085 ) * ( 0.6 + diffuseColor.g * 2.0 ), vRipe );
    `,
  },

  // ---- ground litter: each scrap shows once the amount lying passes its threshold ----
  litter: {
    head: /* glsl */ `
      attribute vec4 aInst;   // threshold (0..1), kind (0 petal, 1 leaf), -, -
      uniform vec2 uLitter;   // how much lies on the ground: petals, leaves (0..1)
    `,
    begin: /* glsl */ `
      float lying = mix( uLitter.x, uLitter.y, aInst.y );
      vec3 transformed = position * smoothstep( aInst.x, aInst.x + 0.04, lying );
    `,
    world: /* glsl */ `vec3 wOff = vec3( 0.0 );`,
  },
};

const PROJECT = (world: string) => /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec3 wp = mvPosition.xyz;
${world}
mvPosition.xyz += wOff;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

const WORLDPOS = /* glsl */ `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vec4 worldPosition = vec4( wp + wOff, 1.0 );
  worldPosition = modelMatrix * worldPosition;
#endif
`;

export interface PatchOptions {
  /** Back-lit glow of thin tissue. */
  translucency?: number;
  /** Soft rim light (velvety petals, leaf bloom). */
  sheen?: number;
}

/** How much litter lies on the ground, shared by every litter material. */
export const litter = { uLitter: { value: new THREE.Vector2(0, 0) } };

/** Splice an organ program into a built-in material. */
export function patch<M extends THREE.Material>(material: M, kind: ProgramKind, { translucency = 0, sheen = 0 }: PatchOptions = {}): M {
  const prog = PROGRAMS[kind];
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: shared.uTime,
      uWind: shared.uWind,
      uWindDir: shared.uWindDir,
      uGreenDays: shared.uGreenDays,
      uBrownDays: shared.uBrownDays,
      uFurrowDays: shared.uFurrowDays,
      uSwayDays: shared.uSwayDays,
      ...clock,
    });
    if (kind === 'litter') shader.uniforms['uLitter'] = litter.uLitter;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON + prog.head)
      .replace('#include <begin_vertex>', prog.begin)
      .replace('#include <project_vertex>', PROJECT(prog.world))
      .replace('#include <worldpos_vertex>', WORLDPOS);
    if ((material as THREE.Material & { isMeshDepthMaterial?: boolean }).isMeshDepthMaterial) return;
    let fs = shader.fragmentShader;
    let head = prog.fragHead ?? '';
    if (prog.fragColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + prog.fragColor);
    if (translucency > 0 || sheen > 0) {
      shader.uniforms['uSunDirView'] = shared.uSunDirView;
      shader.uniforms['uSunColor'] = shared.uSunColor;
      head += '\nuniform vec3 uSunDirView;\nuniform vec3 uSunColor;';
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          // light coming through from behind, warmed by the tissue
          float back = max( 0.0, dot( -normal, uSunDirView ) );
          vec3 through = diffuseColor.rgb * mix( vec3( 1.0 ), vec3( 1.25, 1.2, 0.7 ), ${sheen > 0 ? '0.0' : '1.0'} );
          totalEmissiveRadiance += through * uSunColor * ${translucency.toFixed(3)} * back;
          // grazing-angle sheen
          float rim = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 3.0 );
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * ${sheen.toFixed(3)} * rim;
        }`,
      );
    }
    shader.fragmentShader = fs.replace('#include <common>', '#include <common>\n' + head);
  };
  material.customProgramCacheKey = () => `horti-${kind}-${translucency}-${sheen}`;
  return material;
}

export function depthMaterial(kind: ProgramKind): THREE.MeshDepthMaterial {
  return patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), kind);
}
