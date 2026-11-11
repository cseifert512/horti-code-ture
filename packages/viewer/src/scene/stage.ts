// The stage every Bower is shown on: renderer, camera and orbit controls, sky,
// sun with soft shadows, image-based ambient light, haze and the ground. The
// sun is put where a direction says it is: the core works that out from the
// site, the date and the hour (`sunAt`), and the sliders remain as an
// override. How a frame is turned into a picture is in `pipeline.ts`.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { makeGround } from './ground.ts';
import { Pipeline, type PipelineSettings } from './pipeline.ts';

export interface SunSettings {
  /** Degrees above the horizon. */
  elevation: number;
  /** Degrees, three.js spherical azimuth as in the prototype. */
  azimuth: number;
}

export interface ViewPreset {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Design overlays: drawn over the finished picture in their own exact colours, hidden where the scene is in front. */
  overlayScene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  pipeline: Pipeline;
  sun: THREE.DirectionalLight;
  /** Unit vector towards the sun, world frame. */
  sunDir: THREE.Vector3;
  /** Put the sun by hand. */
  setSun(settings: SunSettings): void;
  /** Put the sun where a unit vector in the three.js frame says it is. It may be below the horizon. */
  setSunDirection(direction: THREE.Vector3): void;
  /** Degrees the sun stands above the horizon now; negative at night. */
  sunElevation(): number;
  /**
   * Fit the shadow frustum, haze and orbit limits to a subject, and optionally move the camera.
   * `shadowBoxM` is the least half-width of the box the shadows are drawn in: smaller for a small
   * subject seen close, where the default would leave its shadows coarse.
   */
  frame(bounds: THREE.Box3, view?: ViewPreset, shadowBoxM?: number): void;
  /** Mark the shadow map stale (the subject or the sun changed). */
  invalidateShadows(): void;
  /**
   * Draw a frame. The quick way by default: the scene straight to the window, tone-mapped as it is drawn, as the
   * viewer always did. `careful`: through the pipeline, with its shading of corners, for a picture that will be
   * looked at (a scene at rest, a specimen, ?quality=high).
   */
  render(careful?: boolean): void;
  /** Draw the present view into a target of any size, for a still. The camera's aspect is the caller's to set. */
  renderTo(target: THREE.WebGLRenderTarget, width: number, height: number): void;
  /**
   * Match the drawing buffer to the window. Called every frame rather than on
   * the resize event, which an embedding pane does not always send. Returns
   * true when the size changed.
   */
  syncSize(): boolean;
}

export const DEFAULT_SUN: SunSettings = { elevation: 40, azimuth: -62 };

/**
 * The sky dome of three.js, with the response curve it had in the release the
 * prototype was built on (0.170). Later releases output linear radiance, which
 * gives a harder, more saturated sky and a very different ambient light; the
 * prototype's look depends on the older curve, so it is put back here.
 */
function makeSky(): Sky {
  const sky = new Sky();
  const m = sky.material;
  const linear = 'gl_FragColor = vec4( texColor, 1.0 );';
  if (m.fragmentShader.includes(linear) && m.vertexShader.includes('varying float vSunfade;')) {
    m.fragmentShader = m.fragmentShader
      .replace(linear, 'gl_FragColor = vec4( pow( texColor, vec3( 1.0 / ( 1.2 + ( 1.2 * vSunfade ) ) ) ), 1.0 );')
      .replace('varying vec3 vSunDirection;', 'varying vec3 vSunDirection; varying float vSunfade;');
  }
  sky.scale.setScalar(450);
  return sky;
}

export function createStage(canvas: HTMLCanvasElement, quality: Partial<PipelineSettings> = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  // Drawn straight to the window, a material tone-maps itself with this curve and exposure. Drawn into the pipeline's
  // target, three.js leaves the light linear and the pipeline applies the same curve and exposure at the end: the two
  // ways give the same picture, but for the shading of corners and the finer edges of the careful one.
  renderer.toneMapping = THREE.NeutralToneMapping;
  const pipeline = new Pipeline(renderer, quality);
  const baseExposure = pipeline.settings.exposure;

  const scene = new THREE.Scene();
  const overlayScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 900);
  const size = { width: 0, height: 0, pixelRatio: 0 };
  function syncSize(): boolean {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === size.width && height === size.height && pixelRatio === size.pixelRatio) return false;
    Object.assign(size, { width, height, pixelRatio });
    renderer.setPixelRatio(pixelRatio);
    // the stylesheet sizes the canvas; only the drawing buffer is set here
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return true;
  }
  syncSize();
  camera.position.set(5.6, 1.9, 7.6);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.9, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 0.3;
  controls.maxDistance = 26;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.autoRotateSpeed = 0.5;
  controls.update();

  // ---- sky, sun, image-based ambient ------------------------------------------
  const sky = makeSky();
  scene.add(sky);
  const su = sky.material.uniforms;
  su['turbidity']!.value = 4.2;
  su['rayleigh']!.value = 1.5;
  su['mieCoefficient']!.value = 0.004;
  su['mieDirectionalG']!.value = 0.82;
  // fair-weather cloud, high and thin: enough that the sky is a sky
  if (su['cloudCoverage']) su['cloudCoverage'].value = 0.34;
  if (su['cloudDensity']) su['cloudDensity'].value = 0.32;
  if (su['cloudElevation']) su['cloudElevation'].value = 0.42;
  if (su['time']) su['time'].value = 40;

  const sun = new THREE.DirectionalLight(0xfff0dc, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 2.5;
  sun.target.position.set(0, 1.4, 0);
  scene.add(sun, sun.target);
  const skyLight = new THREE.HemisphereLight(0xcfe0ff, 0x8a9a6a, 0.35);
  scene.add(skyLight);
  const fog = new THREE.Fog(0xcfdbe4, 16, 160);
  scene.fog = fog;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = makeSky();
  envSky.material.uniforms = sky.material.uniforms;
  envScene.add(envSky);
  let envRT: THREE.WebGLRenderTarget | null = null;
  /** Where the sun was when the sky's light on the scene was last worked out. */
  const envSun = new THREE.Vector3(0, -2, 0);
  const sunDir = new THREE.Vector3();
  let sunDistance = 20;
  let elevationNow = DEFAULT_SUN.elevation;
  let shadowsStale = true;

  function setSunDirection(direction: THREE.Vector3): void {
    sunDir.copy(direction).normalize();
    elevationNow = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1)));
    su['sunPosition']!.value.copy(sunDir);
    sun.position.copy(sunDir).multiplyScalar(sunDistance).add(sun.target.position);
    // warm and weak near the horizon; gone a little below it, when only the sky is left to light the scene
    const low = THREE.MathUtils.smoothstep(elevationNow, 2, 30);
    const up = THREE.MathUtils.smoothstep(elevationNow, -3, 3);
    sun.color.setRGB(1, 0.72 + 0.22 * low, 0.5 + 0.36 * low);
    sun.intensity = (0.6 + 2.8 * low) * up;
    sun.castShadow = up > 0.02;
    const dusk = THREE.MathUtils.smoothstep(elevationNow, -12, 4);
    skyLight.intensity = 0.06 + 0.29 * dusk;
    // the colour of the sky at the horizon, in the scene's own units of light: it is exposed with everything else
    fog.color.setRGB(1.02, 1.17, 1.32).multiplyScalar((0.1 + 0.9 * dusk) * (0.7 + 0.3 * low));
    // a low sun gives less light; the picture is opened up a little for it, as an eye or a camera would
    pipeline.settings.exposure = baseExposure * (1.3 - 0.3 * low) * (1 + 0.5 * (1 - dusk));
    renderer.toneMappingExposure = pipeline.settings.exposure;
    // the sky's light on the scene follows the sun, but not every small step of it: that is dear
    if (envSun.angleTo(sunDir) > THREE.MathUtils.degToRad(2.5) || !envRT) {
      envSun.copy(sunDir);
      envRT?.dispose();
      envRT = pmrem.fromScene(envScene, 0.02);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.9;
    }
    shadowsStale = true;
  }

  function setSun(settings: SunSettings): void {
    const phi = THREE.MathUtils.degToRad(90 - settings.elevation);
    const theta = THREE.MathUtils.degToRad(settings.azimuth);
    setSunDirection(new THREE.Vector3().setFromSphericalCoords(1, phi, theta));
  }

  // ---- the ground, and the edge of the world ---------------------------------------
  const ground = makeGround();
  scene.add(ground.group);

  function frame(bounds: THREE.Box3, view?: ViewPreset, shadowBoxM = 6.5): void {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 1);
    // shadows: an orthographic box round the subject, looking down the sun
    const half = Math.max(shadowBoxM, r * 1.25);
    const cam = sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    sunDistance = Math.max(20, r * 3.2);
    cam.near = 1;
    cam.far = sunDistance + half * 2.2;
    cam.updateProjectionMatrix();
    sun.target.position.set(sphere.center.x, Math.min(1.4, sphere.center.y), sphere.center.z);
    sun.target.updateMatrixWorld();
    // keep the soft edge of a shadow about the same width in metres as the box grows
    sun.shadow.radius = THREE.MathUtils.clamp(3.2 * (6.5 / half), 1.4, 3.2);
    fog.near = Math.max(30, r * 6);
    fog.far = Math.max(520, r * 70);
    controls.maxDistance = Math.max(26, r * 5.5);
    ground.fit(r);
    if (view) {
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.update();
    }
    setSunDirection(sunDir.clone());
  }

  setSun(DEFAULT_SUN);

  const freshShadows = () => {
    if (!shadowsStale) return;
    renderer.shadowMap.needsUpdate = true;
    shadowsStale = false;
  };

  return {
    renderer,
    scene,
    overlayScene,
    camera,
    controls,
    pipeline,
    sun,
    sunDir,
    setSun,
    setSunDirection,
    sunElevation: () => elevationNow,
    frame,
    invalidateShadows() {
      shadowsStale = true;
    },
    render(careful = false) {
      freshShadows();
      const overlay = overlayScene.children.some((c) => c.visible) ? overlayScene : null;
      if (careful) {
        const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
        pipeline.render(scene, overlay, camera, buffer.x, buffer.y, null);
        return;
      }
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      if (overlay) {
        // over the picture, with its depth: an overlay is hidden where timber is in front of it
        renderer.autoClear = false;
        renderer.render(overlay, camera);
        renderer.autoClear = true;
      }
    },
    renderTo(target, width, height) {
      freshShadows();
      pipeline.render(scene, overlayScene.children.some((c) => c.visible) ? overlayScene : null, camera, width, height, target);
    },
    syncSize,
  };
}
