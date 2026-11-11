import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Shader patches. The plant's whole life is evaluated on the GPU:
//
//   uGrow     growing seasons elapsed (advances only spring -> early autumn)
//   uYear     calendar years since 1 January of the planting year
//   uDay      fraction of the current year (0 = 1 Jan), drives phenology
//   uGrowing  1 while extension growth is under way, 0 when dormant
//
// Each organ type gets a small vertex "program" spliced into three.js'
// standard material, so lighting, shadows and tone mapping stay stock.
// ---------------------------------------------------------------------------
export const shared = {
  uTime: { value: 0 },
  uWind: { value: 0.6 },
  uWindDir: { value: new THREE.Vector2(0.92, 0.39) },
  uGrow: { value: 12 },
  uGrowEnd: { value: 12 },
  uYear: { value: 11.35 },
  uDay: { value: 0.35 },
  uGrowing: { value: 1 },
  uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
};

const COMMON = /* glsl */ `
uniform float uTime, uWind, uGrow, uGrowEnd, uYear, uDay, uGrowing;
uniform vec2 uWindDir;

vec2 swayVec(float ph, vec2 xz) {
  float gust = 0.55 + 0.45 * sin(uTime * 0.37 - dot(xz, uWindDir) * 0.7);
  float a = sin(uTime * 1.55 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.9) * 0.22 + 0.3;
  float b = sin(uTime * 1.15 + ph * 1.3) * 0.5 + sin(uTime * 3.3 + ph * 0.7) * 0.18;
  return (uWindDir * a + vec2(-uWindDir.y, uWindDir.x) * b * 0.7) * gust * uWind;
}

// Motion a stem imparts to whatever grows on it: young wood bends in the
// wind, and the newest few centimetres circumnutate (sweep in a slow
// counter-clockwise circle, searching for a support).
vec3 hostOffset(vec3 c, vec3 anchor, float ph, float age) {
  float flex = 1.0 - smoothstep(0.15, 1.6, age);
  float w = distance(c, anchor) * flex * 0.035;
  vec2 s = swayVec(ph * 6.0, anchor.xz);
  float tip = (1.0 - smoothstep(0.0, 0.09, age)) * uGrowing;
  float a = uTime * 0.8 + ph * 6.2832;
  return vec3(s.x * w, 0.0, s.y * w) + tip * tip * 0.06 * vec3(cos(a), 0.3, -sin(a));
}

// Radius of a stem of final radius Rf born at 'birth'. Mirrors stemRadius()
// in skeleton.js exactly; the interference audit relies on that.
float stemRadius(float birth, float Rf) {
  float age = uGrow - birth;
  float rp = min(Rf, 0.0036);
  float span = max(uGrowEnd - birth, 1.0);
  return rp * (0.3 + 0.7 * smoothstep(0.0, 0.25, age)) * smoothstep(0.0, 0.03, age)
       + (Rf - rp) * pow(clamp(age / span, 0.0, 1.0), 1.35);
}

// How far a stem is carried over an older stem it crosses: follows that
// older stem's own thickening. over = (its birth, its final radius, final lift)
float liftNow(vec3 over) {
  return over.z * stemRadius(over.x, over.y) / max(over.y, 1e-5);
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

const PROGRAMS = {
  // ---- stems: radius is a function of age ---------------------------------
  wood: {
    head: /* glsl */ `
      attribute vec4 aGrow;
      attribute vec3 aSup;
      attribute vec3 aOver;
      attribute vec4 aAnchor;
      varying float vAge;
    `,
    // position is where the stem TOUCHES its support. The centre stands one
    // radius (plus any lift over an older stem) out from there, so the stem
    // thickens away from the structure, never into it.
    begin: /* glsl */ `
      float age = uGrow - aGrow.x;
      float alive = step(0.0, age) * step(uYear, aGrow.y);
      float r = stemRadius(aGrow.x, aGrow.z) * step(0.0, age);
      vec3 centre = position + aSup * (liftNow(aOver) + r);
      // bark furrows deepen with age and only ever cut inwards
      float skin = r * (1.0 - aGrow.w * smoothstep(0.8, 5.0, age));
      vec3 transformed = centre + normal * (skin * alive);
      vAge = age;
    `,
    world: /* glsl */ `
      vec3 wOff = offSupport(hostOffset(position, aAnchor.xyz, aAnchor.w, uGrow - aGrow.x), aSup);
    `,
    fragHead: /* glsl */ `varying float vAge;`,
    // green shoot -> smooth brown -> grey fissured bark
    fragColor: /* glsl */ `
      {
        vec3 tex = diffuseColor.rgb;
        float yng = 1.0 - smoothstep(0.3, 1.2, vAge);
        float mid = 1.0 - smoothstep(1.5, 5.5, vAge);
        vec3 green = vec3(0.21, 0.30, 0.085) * (0.75 + 0.6 * tex.g);
        vec3 brown = vec3(0.30, 0.20, 0.115) * (0.5 + 1.1 * tex.g);
        vec3 grey = tex * vec3(0.80, 0.76, 0.71);
        diffuseColor.rgb = mix(mix(grey, brown, mid), green, yng);
      }
    `,
  },

  // ---- compound leaves ------------------------------------------------------
  leaf: {
    head: /* glsl */ `
      attribute vec4 aPart;
      attribute vec4 aLife;   // birth (seasons), death (calendar), random, -
      attribute vec4 aHost;   // base of the bearing shoot, shoot phase
      attribute vec4 aNodeA;  // the node it stands on: away-from-support, final radius
      attribute vec4 aNodeB;  // node birth, then (birth, radius, lift) of the stem beneath
      varying vec3 vLeaf;     // young, autumn, variation
    `,
    begin: /* glsl */ `
      float gAge = uGrow - aLife.x;
      float jit = aLife.z;
      float flush = smoothstep(0.275 + jit * 0.03, 0.395 + jit * 0.03, uDay);
      float grown = min(smoothstep(0.0, 0.08, gAge), flush);
      float fall = smoothstep(0.85 + jit * 0.05, 0.895 + jit * 0.05, uDay + (aPart.w - 0.5) * 0.02);
      float lifeS = grown * (1.0 - fall) * step(0.0, gAge) * step(uYear, aLife.y);
      vec3 transformed = position;
      // unfolding: leaflets start clasped along the rachis and droop
      float isBlade = step(0.0, aPart.w);
      float open = smoothstep(0.1, 0.9, grown);
      vec3 rel = transformed - aPart.xyz;
      rel.x *= mix(0.25, 1.0, mix(1.0, open, isBlade));
      rel.y -= isBlade * (1.0 - open) * length(rel.xz) * 0.9;
      transformed = (aPart.xyz + rel) * lifeS;
      vLeaf = vec3(1.0 - grown, smoothstep(0.775 + jit * 0.05, 0.85 + jit * 0.05, uDay), aPart.w);
    `,
    world: /* glsl */ `
      vec3 org = instanceMatrix[3].xyz;
      // stay seated on the stem's surface as it thickens and is lifted
      float rN = stemRadius(aNodeB.x, aNodeA.w);
      vec3 seat = aNodeA.xyz * (2.0 * (rN - aNodeA.w) + liftNow(aNodeB.yzw) - aNodeB.w);
      vec3 wOff = seat + offSupport(hostOffset(org, aHost.xyz, aHost.w, uGrow - aLife.x), aNodeA.xyz)
                + pendulum(wp, org, 0.07);
      wOff.y -= fall * fall * 0.35;
    `,
    fragHead: /* glsl */ `varying vec3 vLeaf;`,
    fragColor: /* glsl */ `
      {
        float lum = diffuseColor.g;
        float v = clamp(vLeaf.z, 0.0, 1.0);
        vec3 green = mix(vec3(0.145, 0.30, 0.050), vec3(0.19, 0.36, 0.065), v);
        vec3 bronze = vec3(0.40, 0.27, 0.085);
        vec3 yellow = mix(vec3(0.80, 0.56, 0.05), vec3(0.62, 0.36, 0.06), v * v);
        vec3 c = mix(green, bronze, vLeaf.x * 0.85);
        c = mix(c, yellow, vLeaf.y);
        diffuseColor.rgb = c * lum * 1.45;
      }
    `,
  },

  // ---- racemes --------------------------------------------------------------
  raceme: {
    head: /* glsl */ `
      attribute vec4 aPart;   // flower base, t along the raceme (<0: rachis)
      attribute vec4 aInst;   // phase (-1..1), random, swing room (0..1), -
      varying float vOpen;
    `,
    begin: /* glsl */ `
      float ph = aInst.x * 0.012;
      float isR = step(aPart.w, -0.5);
      float ft = mix(aPart.w, -aPart.w - 1.0, isR);
      float el = smoothstep(0.250 + ph, 0.318 + ph, uDay);
      float open = smoothstep(0.296 + ph + ft * 0.014, 0.326 + ph + ft * 0.014, uDay);
      float fallT = 0.380 + ph + ft * 0.02 + aInst.y * 0.012;
      float fall = smoothstep(fallT, fallT + 0.025, uDay);
      float gone = smoothstep(0.43 + ph, 0.47 + ph, uDay);
      float fs = mix(0.3, 1.0, open) * (1.0 - fall) * smoothstep(0.0, 0.45, el + 0.25 - ft * 0.25);
      float rs = (0.4 + 0.6 * el) * (1.0 - gone);
      vec3 base = aPart.xyz;
      vec3 rel = position - base;
      base.y *= mix(0.2, 1.0, el);
      base.xz *= mix(0.5, 1.0, el);
      vec3 transformed = base + rel * mix(fs, rs, isR);
      vOpen = mix(open, 1.0, isR);
    `,
    world: /* glsl */ `
      vec3 wOff = pendulum(wp, instanceMatrix[3].xyz, 0.13 * aInst.z);
    `,
    fragHead: /* glsl */ `varying float vOpen;`,
    fragColor: /* glsl */ `
      diffuseColor.rgb *= mix(vec3(0.62, 0.55, 0.86), vec3(1.0), vOpen);
    `,
  },

  // ---- pods -----------------------------------------------------------------
  pod: {
    head: /* glsl */ `varying float vRipe;`,
    begin: /* glsl */ `
      float swell = smoothstep(0.44, 0.66, uDay);
      float hung = 1.0 - smoothstep(0.10, 0.15, uDay);
      vec3 transformed = position * max(swell, hung);
      vRipe = uDay > 0.4 ? smoothstep(0.72, 0.86, uDay) : 1.0;
    `,
    world: /* glsl */ `
      vec3 wOff = pendulum(wp, instanceMatrix[3].xyz, 0.08);
    `,
    fragHead: /* glsl */ `varying float vRipe;`,
    fragColor: /* glsl */ `
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.145, 0.085) * (0.6 + diffuseColor.g * 2.0), vRipe);
    `,
  },

  // ---- ground litter (petals in May, leaves in November) ---------------------
  litter: {
    head: /* glsl */ `attribute vec4 aInst;  // threshold, first year, kind, -`,
    begin: /* glsl */ `
      float r = aInst.x;
      float petal = smoothstep(0.345 + r * 0.06, 0.36 + r * 0.06, uDay) * (1.0 - smoothstep(0.50, 0.60, uDay + r * 0.05));
      float leaf = max(smoothstep(0.855 + r * 0.07, 0.87 + r * 0.07, uDay), 1.0 - smoothstep(0.08, 0.24, uDay + r * 0.1));
      float s = mix(petal, leaf, aInst.z) * step(aInst.y, uYear);
      vec3 transformed = position * s;
    `,
    world: /* glsl */ `vec3 wOff = vec3(0.0);`,
  },
};

const PROJECT = (world) => /* glsl */ `
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

/**
 * Splice an organ program into a built-in material.
 *  translucency - back-lit glow of thin tissue
 *  sheen        - soft rim light (velvety petals, leaf bloom)
 */
export function patch(material, kind, { translucency = 0, sheen = 0 } = {}) {
  const prog = PROGRAMS[kind];
  material.onBeforeCompile = (shader) => {
    for (const k of ['uTime', 'uWind', 'uWindDir', 'uGrow', 'uGrowEnd', 'uYear', 'uDay', 'uGrowing']) {
      shader.uniforms[k] = shared[k];
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + COMMON + prog.head)
      .replace('#include <begin_vertex>', prog.begin)
      .replace('#include <project_vertex>', PROJECT(prog.world))
      .replace('#include <worldpos_vertex>', WORLDPOS);
    if (material.isMeshDepthMaterial) return;
    let fs = shader.fragmentShader;
    let head = prog.fragHead ?? '';
    if (prog.fragColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + prog.fragColor);
    if (translucency > 0 || sheen > 0) {
      shader.uniforms.uSunDirView = shared.uSunDirView;
      shader.uniforms.uSunColor = shared.uSunColor;
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
        }`
      );
    }
    shader.fragmentShader = fs.replace('#include <common>', '#include <common>\n' + head);
  };
  material.customProgramCacheKey = () => `wis-${kind}-${translucency}-${sheen}`;
  return material;
}

export function depthMaterial(kind) {
  return patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), kind);
}
