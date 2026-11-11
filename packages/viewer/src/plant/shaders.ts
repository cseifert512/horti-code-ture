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
//
// How organs take light is here too, and is the same for every taxon:
//   thin tissue   a leaf or a petal is lit on whichever face the sun is on, and
//                 shows the sun's light through it on the other. Both are the
//                 sun's light, so both are shadowed by what stands in its way
//                 (timber, a stem, another leaf), and neither by the leaf itself
//   gloss         from the roughness the taxon's look gives a surface
//   wood          a stem is shaded where it lies against its support
// How much light comes through is the look's `translucency`; nothing else
// about a taxon is known here.
//
// The programs belong to no taxon. What differs between taxa reaches them as
// uniforms, set per material from the taxon's look (look.ts): a leaf's
// palette, the tint of a bud, the colours and ages of the wood, the colour a
// fruit ripens to.
import * as THREE from 'three';
import { CLOCK_GLSL, clock } from './adapter.ts';
import type { LeafPalette, Triple, WoodLook } from './look.ts';

export const shared = {
  uTime: { value: 0 },
  uWind: { value: 0.6 },
  uWindDir: { value: new THREE.Vector2(0.92, 0.39) },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
  /** Unit vector towards the sun in the world frame: thin organs lean their shadow look-up towards it. */
  uSunDirWorld: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
};

const COMMON = /* glsl */ `
uniform float uTime, uWind;
uniform vec2 uWindDir;
uniform vec3 uSunDirWorld;
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

export type ProgramKind = 'wood' | 'leaf' | 'flower' | 'fruit' | 'appendage' | 'litter';

const PROGRAMS: Record<ProgramKind, Program> = {
  // ---- stems: there or not, and how thick, by the adapter's clock -------------
  wood: {
    head: /* glsl */ `
      attribute vec4 aLife;    // day born, day removed, radius at the end of the run (m), furrow depth
      attribute vec4 aSup;     // direction away from the support (zero if unsupported), radius scale
      attribute vec4 aAnchor;  // base of the stem, phase
      uniform vec2 uFurrowDays, uSwayDays;  // the taxon's: ages over which furrows deepen and a stem stiffens
      uniform float uFurrow;                // the taxon's: how deep its furrows get
      varying float vAge;
      varying float vContact;               // 1 on the side of the stem that lies against its support
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
      float skin = r * aSup.w * max( 0.1, 1.0 - aLife.w * uFurrow * smoothstep( uFurrowDays.x, uFurrowDays.y, age ) );
      vec3 transformed = centre + normal * ( skin * alive );
      vAge = age;
      vContact = max( 0.0, -dot( normal, aSup.xyz ) );
    `,
    world: /* glsl */ `
      float flex = 1.0 - smoothstep( uSwayDays.x, uSwayDays.y, uDay - aLife.x );
      vec3 wOff = offSupport( hostOffset( position, aAnchor.xyz, aAnchor.w, flex ), aSup.xyz );
    `,
    fragHead: /* glsl */ `varying float vAge; varying float vContact; uniform vec2 uGreenDays, uBrownDays; uniform vec3 uWoodYoung, uWoodMature, uWoodOld;`,
    // young shoot -> smooth mature bark -> old bark, in the taxon's colours (WoodLook)
    fragColor: /* glsl */ `
      {
        vec3 tex = diffuseColor.rgb;
        float yng = 1.0 - smoothstep( uGreenDays.x, uGreenDays.y, vAge );
        float mid = 1.0 - smoothstep( uBrownDays.x, uBrownDays.y, vAge );
        vec3 green = uWoodYoung * ( 0.75 + 0.6 * tex.g );
        vec3 brown = uWoodMature * ( 0.5 + 1.1 * tex.g );
        vec3 grey = tex * uWoodOld;
        diffuseColor.rgb = mix( mix( grey, brown, mid ), green, yng );
        // little light reaches the side of a stem that lies against timber or cable
        diffuseColor.rgb *= 1.0 - 0.45 * vContact * vContact * vContact * vContact;
      }
    `,
  },

  // ---- compound leaves ----------------------------------------------------------
  leaf: {
    head: /* glsl */ `
      attribute vec4 aPart;
      attribute vec4 aState;  // expansion, autumn colour, fall (unused: the data gives a leaf's last day, not its falling), -
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
    // the colours are the taxon's (LeafPalette): mature, newly unfolded, autumn
    fragHead: /* glsl */ `varying vec3 vLeaf; uniform vec3 uLeafGreenA, uLeafGreenB, uLeafYoung, uLeafAutumnA, uLeafAutumnB;`,
    fragColor: /* glsl */ `
      {
        float lum = diffuseColor.g;
        float v = clamp( vLeaf.z, 0.0, 1.0 );
        vec3 green = mix( uLeafGreenA, uLeafGreenB, v );
        vec3 autumn = mix( uLeafAutumnA, uLeafAutumnB, v * v );
        vec3 c = mix( green, uLeafYoung, vLeaf.x * 0.85 );
        c = mix( c, autumn, vLeaf.y );
        diffuseColor.rgb = c * lum * 1.45;
      }
    `,
  },

  // ---- flowers and inflorescences (first written for the wisteria raceme) ---------
  flower: {
    head: /* glsl */ `
      attribute vec4 aPart;   // flower base, t along the raceme (<0: rachis)
      attribute vec4 aState;  // elongation, share opened, share shed, stalk present
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
    fragHead: /* glsl */ `varying float vOpen; uniform vec3 uBudTint;`,
    fragColor: /* glsl */ `
      diffuseColor.rgb *= mix( uBudTint, vec3( 1.0 ), vOpen );
    `,
  },

  // ---- fruit (first written for the wisteria pod) --------------------------------------
  fruit: {
    head: /* glsl */ `
      attribute vec4 aState;  // size, ripeness, how freely it swings, -
      varying float vRipe;
    `,
    begin: /* glsl */ `
      vec3 transformed = position * aState.x;
      vRipe = aState.y;
    `,
    world: /* glsl */ `
      vec3 wOff = pendulum( wp, instanceMatrix[3].xyz, 0.13 * aState.z );
    `,
    // the vertex colours are the unripe fruit; it turns to the taxon's ripe colour, still shaded by them
    fragHead: /* glsl */ `varying float vRipe; uniform vec3 uFruitRipe; uniform vec2 uFruitShade;`,
    fragColor: /* glsl */ `
      diffuseColor.rgb = mix( diffuseColor.rgb, uFruitRipe * ( uFruitShade.x + diffuseColor.g * uFruitShade.y ), vRipe );
    `,
  },

  // ---- what a plant holds on with: tendrils, coiled stalks, rootlets, prickles ---------
  appendage: {
    head: /* glsl */ `
      attribute vec4 aState;  // -, how far it has aged (0..1), how freely it moves, random
      attribute vec4 aHost;   // base of the bearing stem, stem phase
      attribute vec4 aSup;    // the stem's direction away from its support, how freely the stem sways
      attribute vec4 aSeat;   // from the stem's contact line out to its surface, where it stands
      varying float vAged;
    `,
    begin: /* glsl */ `
      vec3 transformed = position;
      vAged = aState.y;
    `,
    world: /* glsl */ `
      vec3 org = instanceMatrix[3].xyz;
      vec3 wOff = aSeat.xyz + offSupport( hostOffset( org, aHost.xyz, aHost.w, aSup.w ), aSup.xyz )
                + pendulum( wp, org, 0.07 * aState.z );
    `,
    fragHead: /* glsl */ `varying float vAged; uniform vec3 uAged; uniform float uAges;`,
    fragColor: /* glsl */ `
      diffuseColor.rgb = mix( diffuseColor.rgb, uAged, vAged * uAges );
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
  /** For the leaf program: the taxon's leaf colours. */
  palette?: LeafPalette;
  /** For the flower program: the tint of an unopened flower. */
  budTint?: Triple;
  /** For the wood program: the taxon's wood. */
  wood?: WoodLook;
  /** For the fruit program: what the fruit ripens to (FruitAsset.ripe and ripeShade). */
  ripe?: Triple;
  ripeShade?: readonly [number, number];
  /** For the appendage program: what it turns to with age, or null if it keeps its colours. */
  aged?: Triple | null;
}

/** The colours of the leaf the prototype was built for; used where a material names none. */
const DEFAULT_PALETTE: LeafPalette = { greenA: [0.145, 0.3, 0.05], greenB: [0.19, 0.36, 0.065], young: [0.4, 0.27, 0.085], autumnA: [0.8, 0.56, 0.05], autumnB: [0.62, 0.36, 0.06] };
const DEFAULT_BUD_TINT: Triple = [0.62, 0.55, 0.86];
/** Wood for a material that names none (a test's stand-in material): the ages and colours the prototype's one bark had. */
const DEFAULT_WOOD: WoodLook = { young: [0.21, 0.3, 0.085], mature: [0.3, 0.2, 0.115], old: [0.8, 0.76, 0.71], woodyDays: [110, 440], oldDays: [550, 2000], furrowDays: [290, 1825], furrow: 1, stiffDays: [55, 585], relief: 3, roughness: 0.94 };

/** The organs that are thin and seen from both sides. */
const THIN: readonly ProgramKind[] = ['leaf', 'flower', 'appendage', 'litter'];
/** The lines of three.js's own shaders that the light on thin tissue is hung on. If a release moves them, the old ways are used. */
const SHADOW_VERTEX = THREE.ShaderChunk.shadowmap_vertex;
const SHADOW_NORMAL = 'vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );';
const DIRECT_LIGHT = THREE.ShaderChunk.lights_physical_pars_fragment;
const DIRECT_IRRADIANCE = 'vec3 irradiance = dotNL * directLight.color;';
const inDirectLight = DIRECT_LIGHT.split(DIRECT_IRRADIANCE).length === 2 && DIRECT_LIGHT.includes('material.diffuseContribution');
/** Whether this three.js lets the light through thin tissue take the sun's shadow, and thin tissue be shadowed from the sun's side. */
export const THIN_TISSUE_LIGHT = { shadowed: inDirectLight, fromTheSunSide: SHADOW_VERTEX.includes(SHADOW_NORMAL) };

/** How much litter lies on the ground, shared by every litter material. */
export const litter = { uLitter: { value: new THREE.Vector2(0, 0) } };

/** Splice an organ program into a built-in material. */
export function patch<M extends THREE.Material>(
  material: M,
  kind: ProgramKind,
  { translucency = 0, sheen = 0, palette = DEFAULT_PALETTE, budTint = DEFAULT_BUD_TINT, wood = DEFAULT_WOOD, ripe = [0.2, 0.145, 0.085], ripeShade = [0.6, 2], aged = null }: PatchOptions = {},
): M {
  const prog = PROGRAMS[kind];
  // one compiled program per kind; what is the taxon's is in uniforms, so each material keeps its own
  const own: Record<string, { value: THREE.Vector3 | THREE.Vector2 | number }> =
    kind === 'leaf'
      ? {
          uLeafGreenA: { value: new THREE.Vector3(...palette.greenA) },
          uLeafGreenB: { value: new THREE.Vector3(...palette.greenB) },
          uLeafYoung: { value: new THREE.Vector3(...palette.young) },
          uLeafAutumnA: { value: new THREE.Vector3(...palette.autumnA) },
          uLeafAutumnB: { value: new THREE.Vector3(...palette.autumnB) },
        }
      : kind === 'flower'
        ? { uBudTint: { value: new THREE.Vector3(...budTint) } }
        : kind === 'wood'
          ? {
              uGreenDays: { value: new THREE.Vector2(...wood.woodyDays) },
              uBrownDays: { value: new THREE.Vector2(...wood.oldDays) },
              uFurrowDays: { value: new THREE.Vector2(...wood.furrowDays) },
              uSwayDays: { value: new THREE.Vector2(...wood.stiffDays) },
              uFurrow: { value: wood.furrow },
              uWoodYoung: { value: new THREE.Vector3(...wood.young) },
              uWoodMature: { value: new THREE.Vector3(...wood.mature) },
              uWoodOld: { value: new THREE.Vector3(...wood.old) },
            }
          : kind === 'fruit'
            ? { uFruitRipe: { value: new THREE.Vector3(...ripe) }, uFruitShade: { value: new THREE.Vector2(...ripeShade) } }
            : kind === 'appendage'
              ? { uAged: { value: new THREE.Vector3(...(aged ?? [0, 0, 0])) }, uAges: { value: aged ? 1 : 0 } }
              : {};
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: shared.uTime,
      uWind: shared.uWind,
      uWindDir: shared.uWindDir,
      ...clock,
    });
    if (kind === 'litter') shader.uniforms['uLitter'] = litter.uLitter;
    Object.assign(shader.uniforms, own);
    shader.uniforms['uSunDirWorld'] = shared.uSunDirWorld;
    let vs = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON + prog.head)
      .replace('#include <begin_vertex>', prog.begin)
      .replace('#include <project_vertex>', PROJECT(prog.world))
      .replace('#include <worldpos_vertex>', WORLDPOS);
    // A leaf or a petal is lit from either side. three.js looks its shadow up a little way off the surface along the
    // normal, which for the face turned from the sun is a step into the leaf's own shadow: lean the step towards the sun.
    if (THIN.includes(kind) && SHADOW_VERTEX.includes(SHADOW_NORMAL)) {
      vs = vs.replace('#include <shadowmap_vertex>', SHADOW_VERTEX.replace(SHADOW_NORMAL, SHADOW_NORMAL + '\n\t\tshadowWorldNormal *= dot( shadowWorldNormal, uSunDirWorld ) < 0.0 ? -1.0 : 1.0;'));
    }
    shader.vertexShader = vs;
    if ((material as THREE.Material & { isMeshDepthMaterial?: boolean }).isMeshDepthMaterial) return;
    let fs = shader.fragmentShader;
    let head = prog.fragHead ?? '';
    if (prog.fragColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + prog.fragColor);
    if (translucency > 0) {
      // light through the tissue, warmed by it where it is a leaf: as strong as the old glow where nothing shades it
      const tint = sheen > 0 ? [1, 1, 1] : [1.25, 1.2, 0.7];
      shader.uniforms['uThrough'] = { value: new THREE.Vector3(...tint).multiplyScalar(translucency * 0.32 * Math.PI) };
      head += '\nuniform vec3 uThrough;';
      if (inDirectLight) {
        // added where three.js adds each light's own diffuse light, so that it is the light's colour and takes its shadow
        fs = fs.replace(
          '#include <lights_physical_pars_fragment>',
          DIRECT_LIGHT.replace(DIRECT_IRRADIANCE, DIRECT_IRRADIANCE + '\n\treflectedLight.directDiffuse += uThrough * saturate( dot( -geometryNormal, directLight.direction ) ) * directLight.color * BRDF_Lambert( material.diffuseContribution );'),
        );
      } else {
        // a three.js whose lighting code is laid out otherwise: the glow as it was, unshadowed
        shader.uniforms['uSunDirView'] = shared.uSunDirView;
        shader.uniforms['uSunColor'] = shared.uSunColor;
        head += '\nuniform vec3 uSunDirView;\nuniform vec3 uSunColor;';
        fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uThrough / 3.14159 * uSunColor / 0.32 * max( 0.0, dot( -normal, uSunDirView ) );');
      }
    }
    if (sheen > 0) {
      shader.uniforms['uSunColor'] = shared.uSunColor;
      if (!head.includes('uniform vec3 uSunColor;')) head += '\nuniform vec3 uSunColor;';
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          // grazing-angle sheen: velvety petals
          float rim = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 3.0 );
          totalEmissiveRadiance += diffuseColor.rgb * uSunColor * ${sheen.toFixed(3)} * rim;
        }`,
      );
    }
    shader.fragmentShader = fs.replace('#include <common>', '#include <common>\n' + head);
  };
  material.customProgramCacheKey = () => `horti-${kind}-${translucency > 0 ? 'through' : 'opaque'}-${sheen}`;
  return material;
}

/** The material an organ's shadow is cast with. Wood needs the taxon's look here too: its furrows and its sway shape the shadow. */
export function depthMaterial(kind: ProgramKind, options: PatchOptions = {}): THREE.MeshDepthMaterial {
  return patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), kind, options);
}
