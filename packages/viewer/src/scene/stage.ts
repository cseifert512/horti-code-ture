// The stage every Bower is shown on: renderer, camera and orbit controls, sky,
// sun with soft shadows, image-based ambient light, fog and the lawn. Settings
// follow the Wisteria prototype (Wisteria/src/main.js) so that a render from
// the new core can be judged against it.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { makeGroundTexture } from '../textures.ts';

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
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  /** Unit vector towards the sun, world frame. */
  sunDir: THREE.Vector3;
  setSun(settings: SunSettings): void;
  /** Fit the shadow frustum, fog and orbit limits to a subject, and optionally move the camera. */
  frame(bounds: THREE.Box3, view?: ViewPreset): void;
  /** Mark the shadow map stale (the subject or the sun changed). */
  invalidateShadows(): void;
  render(): void;
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
  // the prototype's sky is clear
  const clouds = m.uniforms['cloudCoverage'];
  if (clouds) clouds.value = 0;
  return sky;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.62;

  const scene = new THREE.Scene();
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
  su['turbidity']!.value = 5;
  su['rayleigh']!.value = 1.6;
  su['mieCoefficient']!.value = 0.004;
  su['mieDirectionalG']!.value = 0.82;

  const sun = new THREE.DirectionalLight(0xfff0dc, 3.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 2.5;
  sun.target.position.set(0, 1.4, 0);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x8a9a6a, 0.35));
  const fog = new THREE.Fog(0xcfdbe4, 16, 160);
  scene.fog = fog;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = makeSky();
  envSky.material.uniforms = sky.material.uniforms;
  envScene.add(envSky);
  let envRT: THREE.WebGLRenderTarget | null = null;
  const sunDir = new THREE.Vector3();
  let sunDistance = 20;
  let current: SunSettings = { ...DEFAULT_SUN };
  let shadowsStale = true;

  function setSun(settings: SunSettings): void {
    current = { ...settings };
    const phi = THREE.MathUtils.degToRad(90 - settings.elevation);
    const theta = THREE.MathUtils.degToRad(settings.azimuth);
    sunDir.setFromSphericalCoords(1, phi, theta);
    su['sunPosition']!.value.copy(sunDir);
    sun.position.copy(sunDir).multiplyScalar(sunDistance).add(sun.target.position);
    const low = THREE.MathUtils.smoothstep(settings.elevation, 2, 30);
    sun.color.setRGB(1, 0.72 + 0.22 * low, 0.5 + 0.36 * low);
    sun.intensity = 0.6 + 2.8 * low;
    envRT?.dispose();
    const exposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = 0.35;
    envRT = pmrem.fromScene(envScene, 0.02);
    renderer.toneMappingExposure = exposure;
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.9;
    shadowsStale = true;
  }

  // ---- lawn ---------------------------------------------------------------------
  {
    const gt = makeGroundTexture();
    gt.repeat.set(220, 220);
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(300, 64), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
    lawn.name = 'lawn';
    lawn.rotation.x = -Math.PI / 2;
    lawn.receiveShadow = true;
    scene.add(lawn);
  }

  function frame(bounds: THREE.Box3, view?: ViewPreset): void {
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 1);
    // shadows: an orthographic box round the subject, looking down the sun
    const half = Math.max(6.5, r * 1.25);
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
    // keep the soft-shadow width roughly constant in metres as the box grows
    sun.shadow.radius = THREE.MathUtils.clamp(2.5 * (6.5 / half), 1, 2.5);
    fog.near = Math.max(16, r * 4.2);
    fog.far = Math.max(160, r * 34);
    controls.maxDistance = Math.max(26, r * 5.5);
    if (view) {
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.update();
    }
    setSun(current);
  }

  setSun(current);

  return {
    renderer,
    scene,
    camera,
    controls,
    sun,
    sunDir,
    setSun,
    frame,
    invalidateShadows() {
      shadowsStale = true;
    },
    render() {
      if (shadowsStale) {
        renderer.shadowMap.needsUpdate = true;
        shadowsStale = false;
      }
      renderer.render(scene, camera);
    },
    syncSize,
  };
}
