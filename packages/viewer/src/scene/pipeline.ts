// The careful way of making a picture: for stills, for a specimen's portrait,
// for a scene that has come to rest with nothing moving in it, and for
// ?quality=high. (The quick way, for everything that moves, is in stage.ts: the
// scene drawn straight to the window, as the viewer always did.)
//
// The scene is drawn once, in linear light with room above white, into a
// multisampled target with its depth kept. From that depth the shading of
// corners and crevices is worked out (ambient occlusion: where a rib meets a
// ring, under a leaf, at a foot on its pad), blurred along surfaces and not
// across edges, and laid over the picture. Exposure, tone mapping and the
// display's colour encoding are applied once, at the end, to everything alike.
// Design overlays are then drawn over the result in their own exact colours,
// with the scene's depth to hide them where timber is in front.
//
// None of this knows anything about plants or timber: it is how light is
// turned into a picture.
import * as THREE from 'three';

const FULLSCREEN_VERTEX = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

// Scalable ambient obscurance (McGuire, Mara and Luebke 2012): for each pixel,
// how much of the half-space above its surface is taken up by nearby geometry,
// within a radius given in metres so that a joint reads the same on a 4 m vault
// as on a 15 m dome. Normals are rebuilt from depth, so nothing has to be drawn
// twice.
const AO_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform highp sampler2D tDepth;
  uniform mat4 uProjection;
  uniform mat4 uProjectionInverse;
  uniform vec2 uTexel;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uFade;
  in vec2 vUv;
  out vec4 outColor;

  vec3 viewPosition(vec2 uv) {
    float d = textureLod(tDepth, uv, 0.0).r;
    vec4 p = uProjectionInverse * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }

  // interleaved gradient noise: a different turn of the sample pattern at each pixel
  float turn(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  const int SAMPLES = 12;
  const float TURNS = 7.0;

  void main() {
    float depth = texture(tDepth, vUv).r;
    if (depth >= 1.0) {
      outColor = vec4(1.0);
      return;
    }
    vec3 P = viewPosition(vUv);
    // the surface normal from the nearer neighbour on each axis, so that an edge does not bend it
    vec3 Pr = viewPosition(vUv + vec2(uTexel.x, 0.0));
    vec3 Pl = viewPosition(vUv - vec2(uTexel.x, 0.0));
    vec3 Pu = viewPosition(vUv + vec2(0.0, uTexel.y));
    vec3 Pd = viewPosition(vUv - vec2(0.0, uTexel.y));
    vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
    vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
    vec3 N = normalize(cross(dx, dy));

    float aspect = uTexel.y / uTexel.x;
    // The reach is given in metres, so that a joint reads the same on a 4 m vault as on a 15 m dome. Seen close, that
    // reach would cover half the picture and smother it: there it is drawn in to what a twelfth of the picture's
    // height stands for at that depth, and the shading becomes that of small things touching.
    float perMetre = 0.5 * uProjection[1][1] / max(0.05, -P.z);
    float reach = min(uRadius, 0.085 / perMetre);
    float screenRadius = perMetre * reach;
    float phase = turn(gl_FragCoord.xy) * 6.2831853;
    float radius2 = reach * reach;
    float bias = 0.06 * reach + 0.0008 * -P.z;
    float sum = 0.0;
    for (int i = 0; i < SAMPLES; i++) {
      float t = (float(i) + 0.5) / float(SAMPLES);
      float angle = phase + t * TURNS * 6.2831853;
      vec2 offset = vec2(cos(angle) / aspect, sin(angle)) * screenRadius * t;
      vec3 v = viewPosition(vUv + offset) - P;
      float vv = dot(v, v);
      float vn = dot(v, N);
      float f = max(radius2 - vv, 0.0);
      sum += f * f * f * max((vn - bias) / (vv + 0.0025 * radius2), 0.0);
    }
    float ao = max(0.0, 1.0 - sum * uIntensity * 5.0 / (float(SAMPLES) * radius2 * radius2 * radius2));
    // Seen close, the reach is centimetres or less, and what it finds is the relief of a leaf between its veins and
    // the leaf next to it: thin things that light passes through and round, which this shading knows nothing of. It
    // showed there as rows of dark patches on every large leaf. So the shading is held back as its reach draws in:
    // whole at a reach of 0.22 m and more, three tenths of itself where the reach is 2 cm.
    ao = mix( 1.0, ao, 0.3 + 0.7 * smoothstep( 0.02, 0.22, reach ) );
    // far away a pixel is wider than the radius, and there is nothing to find
    ao = mix(ao, 1.0, smoothstep(0.5 * uFade, uFade, -P.z));
    outColor = vec4(ao, 0.0, 0.0, 1.0);
  }`;

// A blur that runs along a surface and stops at an edge: neighbours count for
// less the more their depth differs.
const BLUR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tAo;
  uniform highp sampler2D tDepth;
  uniform vec2 uStep;
  uniform float uNear;
  uniform float uFar;
  in vec2 vUv;
  out vec4 outColor;

  float metres(float d) {
    float z = d * 2.0 - 1.0;
    return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
  }

  void main() {
    float d0 = texture(tDepth, vUv).r;
    if (d0 >= 1.0) {
      outColor = vec4(1.0);
      return;
    }
    float z0 = metres(d0);
    float sum = texture(tAo, vUv).r * 0.2270270;
    float weight = 0.2270270;
    float gauss[3] = float[3](0.1945946, 0.1216216, 0.0540541);
    for (int i = 1; i <= 3; i++) {
      for (int s = -1; s <= 1; s += 2) {
        vec2 uv = vUv + uStep * float(i * s);
        float z = metres(textureLod(tDepth, uv, 0.0).r);
        float w = gauss[i - 1] * max(0.0, 1.0 - abs(z - z0) / (0.02 + 0.03 * z0));
        sum += textureLod(tAo, uv, 0.0).r * w;
        weight += w;
      }
    }
    outColor = vec4(sum / weight, 0.0, 0.0, 1.0);
  }`;

// The last step: shading laid over the picture, exposure, the Khronos PBR
// Neutral tone curve (which keeps the colour of a material as it is until it
// nears white, so timber stays the colour of timber), the sRGB encoding a
// display expects, and a grain of noise finer than one step of an 8-bit
// channel so that the sky does not band.
const COMPOSITE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tColor;
  uniform sampler2D tAo;
  uniform highp sampler2D tDepth;
  uniform float uExposure;
  uniform float uAo;
  in vec2 vUv;
  out vec4 outColor;

  vec3 neutral(vec3 color) {
    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;
    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;
    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;
    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;
    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }

  vec3 encode(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
  }

  float grain(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  void main() {
    vec3 color = max(texture(tColor, vUv).rgb, vec3(0.0));
    float depth = texture(tDepth, vUv).r;
    if (uAo > 0.0 && depth < 1.0) {
      float ao = texture(tAo, vUv).r;
      // what is lit hard by the sun is shaded less: occlusion belongs to the light of the sky
      float lit = smoothstep(0.6, 2.4, max(color.r, max(color.g, color.b)) * uExposure);
      color *= mix(1.0, ao, uAo * (1.0 - 0.45 * lit));
    }
    color = neutral(color * uExposure);
    color = encode(clamp(color, 0.0, 1.0));
    color += (grain(gl_FragCoord.xy) - 0.5) / 255.0;
    outColor = vec4(color, 1.0);
    gl_FragDepth = depth;
  }`;

export interface PipelineSettings {
  /** Samples per pixel when the scene is drawn. 4 smooths cables and leaf edges; 0 turns it off. */
  samples: number;
  /** Shading of corners and crevices, 0 (off) to 1. */
  ambientOcclusion: number;
  /** Reach of that shading, metres. */
  occlusionRadiusM: number;
  exposure: number;
}

export const DEFAULT_PIPELINE: PipelineSettings = { samples: 4, ambientOcclusion: 0.85, occlusionRadiusM: 0.4, exposure: 0.62 };

export class Pipeline {
  readonly settings: PipelineSettings;
  private readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.WebGLRenderTarget | null = null;
  /** The scene's target at each sample count used so far: the count changes between a moving picture and one at rest. */
  private readonly scenes = new Map<number, THREE.WebGLRenderTarget>();
  private ao: THREE.WebGLRenderTarget | null = null;
  private aoBlur: THREE.WebGLRenderTarget | null = null;
  private width = 0;
  private height = 0;
  private readonly quad: THREE.Mesh;
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly aoMaterial: THREE.ShaderMaterial;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer, settings: Partial<PipelineSettings> = {}) {
    this.renderer = renderer;
    this.settings = { ...DEFAULT_PIPELINE, ...settings };
    const pass = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, depth = false) =>
      new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, depthTest: depth, depthWrite: depth, depthFunc: THREE.AlwaysDepth, toneMapped: false, fog: false });
    this.aoMaterial = pass(AO_FRAGMENT, {
      tDepth: { value: null },
      uProjection: { value: new THREE.Matrix4() },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: this.settings.occlusionRadiusM },
      uIntensity: { value: 1 },
      uFade: { value: 70 },
    });
    this.blurMaterial = pass(BLUR_FRAGMENT, { tAo: { value: null }, tDepth: { value: null }, uStep: { value: new THREE.Vector2() }, uNear: { value: 0.05 }, uFar: { value: 900 } });
    this.compositeMaterial = pass(COMPOSITE_FRAGMENT, { tColor: { value: null }, tAo: { value: null }, tDepth: { value: null }, uExposure: { value: 1 }, uAo: { value: 1 } }, true);
    // one triangle that covers the screen
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geometry, this.aoMaterial);
    this.quad.frustumCulled = false;
  }

  /** Make the targets fit a picture of this many pixels, at the sample count now asked for. */
  private fit(width: number, height: number): void {
    if (width !== this.width || height !== this.height) {
      this.release();
      this.width = width;
      this.height = height;
      const half = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
      this.ao = new THREE.WebGLRenderTarget(width, height, half);
      this.aoBlur = new THREE.WebGLRenderTarget(width, height, half);
    }
    const samples = Math.max(0, Math.min(this.settings.samples, this.renderer.capabilities.maxSamples));
    let target = this.scenes.get(samples);
    if (!target) {
      const depthTexture = new THREE.DepthTexture(width, height);
      depthTexture.type = THREE.UnsignedIntType;
      depthTexture.minFilter = depthTexture.magFilter = THREE.NearestFilter;
      target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples, depthTexture, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.scenes.set(samples, target);
    }
    this.scene = target;
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.quadCamera);
  }

  /**
   * Draw one frame of `width` by `height` pixels into `output`, or on to the
   * screen when it is null. `overlay` is drawn last, over the finished picture.
   */
  render(scene: THREE.Scene, overlay: THREE.Scene | null, camera: THREE.PerspectiveCamera, width: number, height: number, output: THREE.WebGLRenderTarget | null = null): void {
    const renderer = this.renderer;
    this.fit(width, height);
    const target = this.scene!;
    const wasAutoClear = renderer.autoClear;
    renderer.autoClear = true;

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);

    const useAo = this.settings.ambientOcclusion > 0;
    if (useAo) {
      const u = this.aoMaterial.uniforms;
      u['tDepth']!.value = target.depthTexture;
      (u['uProjection']!.value as THREE.Matrix4).copy(camera.projectionMatrix);
      (u['uProjectionInverse']!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      (u['uTexel']!.value as THREE.Vector2).set(1 / width, 1 / height);
      u['uRadius']!.value = this.settings.occlusionRadiusM;
      this.draw(this.aoMaterial, this.ao);
      const b = this.blurMaterial.uniforms;
      b['tDepth']!.value = target.depthTexture;
      b['uNear']!.value = camera.near;
      b['uFar']!.value = camera.far;
      b['tAo']!.value = this.ao!.texture;
      (b['uStep']!.value as THREE.Vector2).set(1.5 / width, 0);
      this.draw(this.blurMaterial, this.aoBlur);
      b['tAo']!.value = this.aoBlur!.texture;
      (b['uStep']!.value as THREE.Vector2).set(0, 1.5 / height);
      this.draw(this.blurMaterial, this.ao);
    }

    const c = this.compositeMaterial.uniforms;
    c['tColor']!.value = target.texture;
    c['tDepth']!.value = target.depthTexture;
    c['tAo']!.value = this.ao!.texture;
    c['uAo']!.value = useAo ? this.settings.ambientOcclusion : 0;
    c['uExposure']!.value = this.settings.exposure;
    this.draw(this.compositeMaterial, output);

    if (overlay) {
      renderer.autoClear = false;
      renderer.setRenderTarget(output);
      renderer.render(overlay, camera);
    }
    renderer.autoClear = wasAutoClear;
    renderer.setRenderTarget(null);
  }

  private release(): void {
    for (const target of this.scenes.values()) {
      target.depthTexture?.dispose();
      target.dispose();
    }
    this.scenes.clear();
    this.ao?.dispose();
    this.aoBlur?.dispose();
    this.scene = this.ao = this.aoBlur = null;
  }

  dispose(): void {
    this.release();
    this.aoMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
