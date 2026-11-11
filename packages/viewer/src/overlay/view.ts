// The design overlay in the scene: every plant route of the support graph as a
// tube of constant width on screen, coloured by route length from the chosen
// root station and greyed out beyond the budget; the nodes; the shortest route
// to the highest node; the stations. All of it can be hidden for a clean render.
//
// Colour is a single-hue ramp, light to dark with distance. The budget is
// applied per fragment, so it can run out part of the way along a route.
import * as THREE from 'three';
import type { Bower, SupportEdge } from '@horti/core';
import { toThree } from '../structure/frames.ts';
import { type StationField, edgeDistances } from './model.ts';

const V3 = THREE.Vector3;

/** Route length standing in for "cannot be reached": finite, so the shaders stay free of infinities. */
const UNREACHED = 1e6;
const RADIAL = 6;

export const OVERLAY_COLOURS = {
  /** Route length ramp, near to far. One hue, lightness falling. */
  ramp: ['#ff9ad0', '#d6218c', '#5b0d52'] as const,
  beyond: '#aab0b9',
  casing: '#26091f',
  summit: '#ffffff',
} as const;

/** Sizes on screen, CSS pixels. */
const PX = { route: 2.6, beyond: 1.1, casing: 1.3, summitCasing: 2.6, hover: 1.7 } as const;

const TUBE_VERTEX = /* glsl */ `
uniform float uBudget;
uniform float uPixelScale;
uniform float uMode;      // 0 fill, 1 casing, 2 x-ray
uniform float uHover;
uniform float uSelected;
attribute vec3 aDir;
attribute vec2 aD;
attribute float aEdge;
attribute float aSummit;
varying vec2 vD;
varying vec3 vN;
varying float vEdge;
varying float vSummit;

void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  float within = step( min( aD.x, aD.y ), uBudget );
  float picked = max( step( abs( aEdge - uHover ), 0.5 ), step( abs( aEdge - uSelected ), 0.5 ) );
  float px = mix( ${PX.beyond.toFixed(2)}, ${PX.route.toFixed(2)}, within ) * mix( 1.0, ${PX.hover.toFixed(2)}, picked );
  if ( uMode > 0.5 && uMode < 1.5 ) {
    // the casing only goes round what is within the budget, the route to the highest node, and the picked route
    float cased = max( max( within, aSummit ), picked );
    px = cased * ( px + mix( ${PX.casing.toFixed(2)}, ${PX.summitCasing.toFixed(2)}, max( aSummit, picked ) ) );
  }
  vec3 n = normalize( mat3( modelViewMatrix ) * aDir );
  mv.xyz += n * px * uPixelScale * -mv.z;
  gl_Position = projectionMatrix * mv;
  vD = aD;
  vN = n;
  vEdge = aEdge;
  vSummit = aSummit;
}
`;

const TUBE_FRAGMENT = /* glsl */ `
uniform float uBudget;
uniform float uScaleMax;
uniform float uMode;
uniform float uHover;
uniform float uSelected;
uniform float uOpacity;
uniform vec3 uRamp0;
uniform vec3 uRamp1;
uniform vec3 uRamp2;
uniform vec3 uBeyond;
uniform vec3 uCasing;
uniform vec3 uSummit;
varying vec2 vD;
varying vec3 vN;
varying float vEdge;
varying float vSummit;

void main() {
  float d = min( vD.x, vD.y );
  float t = clamp( d / uScaleMax, 0.0, 1.0 );
  vec3 ramp = t < 0.5 ? mix( uRamp0, uRamp1, t * 2.0 ) : mix( uRamp1, uRamp2, t * 2.0 - 1.0 );
  float within = step( d, uBudget );
  float picked = max( step( abs( vEdge - uHover ), 0.5 ), step( abs( vEdge - uSelected ), 0.5 ) );
  vec3 col;
  if ( uMode > 0.5 && uMode < 1.5 ) {
    col = mix( uCasing, uSummit, max( vSummit, picked ) );
  } else {
    float shade = 0.78 + 0.22 * max( 0.0, normalize( vN ).z );
    col = mix( uBeyond, ramp, within ) * shade;
    col = mix( col, vec3( 1.0 ), picked * 0.45 );
  }
  // seen through the timber, what is within the budget stays the stronger
  float alpha = uMode > 1.5 ? uOpacity * mix( 0.4, 1.0, within ) : uOpacity;
  gl_FragColor = vec4( col, alpha );
  #include <colorspace_fragment>
}
`;

const NODE_VERTEX = /* glsl */ `
uniform float uBudget;
uniform float uPixelRatio;
attribute float aD;
attribute float aKind;   // 0 node, 1 highest node, 2 entry node of the station
varying float vWithin;
varying float vKind;
varying float vD;

void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  // stand a little towards the eye, clear of the timber the node sits on
  mv.xyz *= 1.0 - 0.04 / max( 0.5, length( mv.xyz ) );
  gl_Position = projectionMatrix * mv;
  vWithin = step( aD, uBudget );
  vKind = aKind;
  vD = aD;
  float size = mix( 4.5, 8.0, vWithin );
  if ( aKind > 0.5 ) size = 15.0;
  gl_PointSize = size * uPixelRatio;
}
`;

const NODE_FRAGMENT = /* glsl */ `
uniform float uScaleMax;
uniform vec3 uRamp0;
uniform vec3 uRamp1;
uniform vec3 uRamp2;
uniform vec3 uBeyond;
uniform vec3 uCasing;
varying float vWithin;
varying float vKind;
varying float vD;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length( p );
  if ( r > 1.0 ) discard;
  float t = clamp( vD / uScaleMax, 0.0, 1.0 );
  vec3 ramp = t < 0.5 ? mix( uRamp0, uRamp1, t * 2.0 ) : mix( uRamp1, uRamp2, t * 2.0 - 1.0 );
  vec3 col;
  if ( vKind > 0.5 ) {
    // a ringed target: white ring, dark gap, centre in the colour of its route length (grey if out of reach)
    vec3 centre = mix( uBeyond, ramp, vWithin );
    col = r > 0.72 ? vec3( 1.0 ) : ( r > 0.5 ? uCasing : centre );
  } else if ( vWithin > 0.5 ) {
    col = r > 0.62 ? uCasing : vec3( 1.0 );
  } else {
    col = r > 0.7 ? vec3( 0.32, 0.34, 0.38 ) : uBeyond;
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}
`;

interface EdgeGeometry {
  edge: SupportEdge | null;
  /** For the lead from a root station to its entry node: that station's id. */
  leadOf: string | null;
  /** Polyline in the three.js frame. */
  points: THREE.Vector3[];
  /** Distance along the polyline to each point. */
  s: Float32Array;
  length: number;
  /** First vertex of this edge's tube. */
  vertexStart: number;
}

export interface OverlayLabel {
  id: string;
  kind: 'station' | 'summit';
  element: HTMLElement;
  position: THREE.Vector3;
}

export class ReachOverlay {
  readonly group = new THREE.Group();
  private readonly uniforms = {
    uBudget: { value: 0 },
    uScaleMax: { value: 1 },
    uPixelScale: { value: 0.001 },
    uPixelRatio: { value: 1 },
    uHover: { value: -10 },
    uSelected: { value: -10 },
    uRamp0: { value: new THREE.Color(OVERLAY_COLOURS.ramp[0]) },
    uRamp1: { value: new THREE.Color(OVERLAY_COLOURS.ramp[1]) },
    uRamp2: { value: new THREE.Color(OVERLAY_COLOURS.ramp[2]) },
    uBeyond: { value: new THREE.Color(OVERLAY_COLOURS.beyond) },
    uCasing: { value: new THREE.Color(OVERLAY_COLOURS.casing) },
    uSummit: { value: new THREE.Color(OVERLAY_COLOURS.summit) },
  };
  private readonly materials: THREE.ShaderMaterial[] = [];
  private bower: Bower | null = null;
  private edges: EdgeGeometry[] = [];
  private readonly edgeIndex = new Map<string, number>();
  private tube: THREE.BufferGeometry | null = null;
  private nodes: THREE.BufferGeometry | null = null;
  private nodeIds: string[] = [];
  private readonly stationRings = new Map<string, THREE.Mesh>();
  private disposables: { dispose(): void }[] = [];
  readonly labels: OverlayLabel[] = [];
  private readonly labelLayer: HTMLElement;
  private onStationPicked: (stationId: string) => void = () => {};

  constructor(labelLayer: HTMLElement) {
    this.labelLayer = labelLayer;
    this.group.name = 'design overlay';
    this.group.visible = false;
  }

  /** Called when a station's label is clicked. */
  whenStationPicked(listener: (stationId: string) => void): void {
    this.onStationPicked = listener;
  }

  private tubeMaterial(mode: 0 | 1 | 2): THREE.ShaderMaterial {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uMode: { value: mode }, uOpacity: { value: mode === 2 ? 0.5 : 1 } },
      vertexShader: TUBE_VERTEX,
      fragmentShader: TUBE_FRAGMENT,
      side: mode === 1 ? THREE.BackSide : THREE.FrontSide,
      transparent: mode === 2,
      depthTest: mode !== 2,
      depthWrite: mode !== 2,
      toneMapped: false,
      fog: false,
    });
    this.materials.push(m);
    return m;
  }

  setBower(bower: Bower): void {
    this.clear();
    this.bower = bower;

    // ---- the routes as tubes --------------------------------------------------
    const pos: number[] = [];
    const dir: number[] = [];
    const edgeAttr: number[] = [];
    const idx: number[] = [];
    let vcount = 0;
    const T = new V3();
    const prevT = new V3();
    const N = new V3();
    const B = new V3();
    const q = new THREE.Quaternion();
    const addTube = (points: THREE.Vector3[], edge: SupportEdge | null, leadOf: string | null = null) => {
      const n = points.length;
      const s = new Float32Array(n);
      for (let i = 1; i < n; i++) s[i] = s[i - 1]! + points[i]!.distanceTo(points[i - 1]!);
      const index = this.edges.length;
      this.edges.push({ edge, leadOf, points, s, length: s[n - 1]!, vertexStart: vcount });
      if (edge) this.edgeIndex.set(edge.id, index);
      for (let i = 0; i < n; i++) {
        T.subVectors(points[Math.min(n - 1, i + 1)]!, points[Math.max(0, i - 1)]!);
        if (T.lengthSq() < 1e-12) T.copy(prevT);
        else T.normalize();
        if (i === 0) {
          N.set(0, 1, 0);
          if (Math.abs(T.y) > 0.9) N.set(1, 0, 0);
        } else {
          N.applyQuaternion(q.setFromUnitVectors(prevT, T));
        }
        N.addScaledVector(T, -N.dot(T)).normalize();
        B.crossVectors(T, N);
        prevT.copy(T);
        for (let j = 0; j < RADIAL; j++) {
          const th = (j / RADIAL) * Math.PI * 2;
          const c = Math.cos(th);
          const sn = Math.sin(th);
          pos.push(points[i]!.x, points[i]!.y, points[i]!.z);
          dir.push(N.x * c + B.x * sn, N.y * c + B.y * sn, N.z * c + B.z * sn);
          edgeAttr.push(edge ? index : -1);
        }
      }
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < RADIAL; j++) {
          const a = vcount + i * RADIAL + j;
          const b = vcount + i * RADIAL + ((j + 1) % RADIAL);
          idx.push(a, b, a + RADIAL, b, b + RADIAL, a + RADIAL);
        }
      }
      vcount += n * RADIAL;
    };
    for (const e of bower.graph.edges.values()) addTube(e.curve.points.map((p) => toThree(p)), e);
    // the lead from each root station to the node where its plant joins the structure
    for (const st of bower.rootStations) {
      for (const id of st.entryNodeIds) {
        const node = bower.graph.nodes.get(id);
        if (node) addTube([toThree(st.position).setY(0.02), toThree(node.position).setY(Math.max(0.02, node.position.z))], null, st.id);
      }
    }
    const tube = new THREE.BufferGeometry();
    tube.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tube.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
    tube.setAttribute('aEdge', new THREE.Float32BufferAttribute(edgeAttr, 1));
    tube.setAttribute('aD', new THREE.Float32BufferAttribute(new Float32Array(vcount * 2).fill(UNREACHED), 2));
    tube.setAttribute('aSummit', new THREE.Float32BufferAttribute(new Float32Array(vcount), 1));
    tube.setIndex(idx);
    this.tube = tube;
    this.disposables.push(tube);
    const xray = new THREE.Mesh(tube, this.tubeMaterial(2));
    const casing = new THREE.Mesh(tube, this.tubeMaterial(1));
    const fill = new THREE.Mesh(tube, this.tubeMaterial(0));
    xray.renderOrder = 3;
    for (const m of [xray, casing, fill]) {
      m.frustumCulled = false;
      this.group.add(m);
    }

    // ---- the nodes ------------------------------------------------------------
    const np: number[] = [];
    this.nodeIds = [];
    for (const node of bower.graph.nodes.values()) {
      const p = toThree(node.position);
      np.push(p.x, p.y, p.z);
      this.nodeIds.push(node.id);
    }
    const nodes = new THREE.BufferGeometry();
    nodes.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
    nodes.setAttribute('aD', new THREE.Float32BufferAttribute(new Float32Array(this.nodeIds.length).fill(UNREACHED), 1));
    nodes.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(this.nodeIds.length), 1));
    this.nodes = nodes;
    this.disposables.push(nodes);
    const nodeMaterial = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: NODE_VERTEX, fragmentShader: NODE_FRAGMENT, toneMapped: false, fog: false });
    this.materials.push(nodeMaterial);
    const points = new THREE.Points(nodes, nodeMaterial);
    points.frustumCulled = false;
    points.renderOrder = 4;
    this.group.add(points);

    // ---- the stations: a ring on the ground and a label -------------------------
    for (const st of bower.rootStations) {
      const p = toThree(st.position);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.56, 48), new THREE.MeshBasicMaterial({ color: OVERLAY_COLOURS.beyond, toneMapped: false, fog: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, 0.012, p.z);
      this.disposables.push(ring.geometry, ring.material);
      this.stationRings.set(st.id, ring);
      this.group.add(ring);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'scene-label station';
      el.textContent = st.id;
      el.title = st.note ?? st.id;
      el.addEventListener('click', () => this.onStationPicked(st.id));
      this.labelLayer.append(el);
      this.labels.push({ id: st.id, kind: 'station', element: el, position: new V3(p.x, 0.55, p.z) });
    }
    const summit = document.createElement('div');
    summit.className = 'scene-label summit';
    this.labelLayer.append(summit);
    this.labels.push({ id: 'summit', kind: 'summit', element: summit, position: new V3() });
  }

  /** Recolour everything for a station: route length to every point of every route. */
  setStation(field: StationField): void {
    const { bower, tube, nodes } = this;
    if (!bower || !tube || !nodes) return;
    const aD = tube.getAttribute('aD') as THREE.BufferAttribute;
    const aSummit = tube.getAttribute('aSummit') as THREE.BufferAttribute;
    const onSummit = new Set(field.summit.route?.edges ?? []);
    const station = bower.rootStations.find((s) => s.id === field.stationId);
    for (const g of this.edges) {
      let from = UNREACHED;
      let to = UNREACHED;
      if (g.edge) {
        const d = edgeDistances(field, g.edge);
        if (Number.isFinite(d.from)) from = d.from;
        if (Number.isFinite(d.to)) to = d.to;
      } else if (g.leadOf === field.stationId) {
        // the lead of the chosen station is the start of every route: length 0
        from = to = -g.length;
      }
      const summit = g.edge && onSummit.has(g.edge.id) ? 1 : 0;
      for (let i = 0; i < g.points.length; i++) {
        const a = from + g.s[i]!;
        const b = to + g.length - g.s[i]!;
        for (let j = 0; j < RADIAL; j++) {
          const v = g.vertexStart + i * RADIAL + j;
          aD.setXY(v, Math.min(a, UNREACHED), Math.min(b, UNREACHED));
          aSummit.setX(v, summit);
        }
      }
    }
    aD.needsUpdate = true;
    aSummit.needsUpdate = true;

    const nD = nodes.getAttribute('aD') as THREE.BufferAttribute;
    const nK = nodes.getAttribute('aKind') as THREE.BufferAttribute;
    const entries = new Set(station?.entryNodeIds ?? []);
    this.nodeIds.forEach((id, i) => {
      nD.setX(i, field.distanceByNode.get(id) ?? UNREACHED);
      nK.setX(i, id === field.summit.nodeId ? 1 : entries.has(id) ? 2 : 0);
    });
    nD.needsUpdate = true;
    nK.needsUpdate = true;

    this.uniforms.uScaleMax.value = Math.max(field.farthestM, 0.001);
    for (const [id, ring] of this.stationRings) (ring.material as THREE.MeshBasicMaterial).color.set(id === field.stationId ? OVERLAY_COLOURS.ramp[0] : OVERLAY_COLOURS.beyond);
    for (const l of this.labels) {
      if (l.kind === 'station') l.element.classList.toggle('active', l.id === field.stationId);
      if (l.kind === 'summit') {
        const node = bower.graph.nodes.get(field.summit.nodeId);
        if (node) toThree(node.position, l.position);
      }
    }
  }

  setBudget(budgetM: number): void {
    this.uniforms.uBudget.value = budgetM;
  }

  setSummitText(text: string, reached: boolean): void {
    const l = this.labels.find((x) => x.kind === 'summit');
    if (!l) return;
    l.element.textContent = text;
    l.element.classList.toggle('reached', reached);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    this.labelLayer.hidden = !visible;
  }

  setHover(edgeId: string | null): void {
    this.uniforms.uHover.value = edgeId === null ? -10 : (this.edgeIndex.get(edgeId) ?? -10);
  }

  setSelected(edgeId: string | null): void {
    this.uniforms.uSelected.value = edgeId === null ? -10 : (this.edgeIndex.get(edgeId) ?? -10);
  }

  /** The route nearest the pointer, within `tolerancePx`; null if there is none. */
  pick(camera: THREE.Camera, x: number, y: number, width: number, height: number, tolerancePx = 9): SupportEdge | null {
    let best: SupportEdge | null = null;
    let bestPx = tolerancePx;
    let bestDepth = Infinity;
    const a = new V3();
    const b = new V3();
    for (const g of this.edges) {
      if (!g.edge) continue;
      let have = false;
      for (let i = 0; i < g.points.length; i++) {
        b.copy(g.points[i]!).project(camera);
        const visible = b.z > -1 && b.z < 1;
        b.x = (b.x * 0.5 + 0.5) * width;
        b.y = (-b.y * 0.5 + 0.5) * height;
        if (have && visible) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const l2 = dx * dx + dy * dy;
          const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
          const px = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
          const depth = a.z + (b.z - a.z) * t;
          // nearest on screen; where two routes cross under the pointer, the one in front
          if (px < bestPx - 2 || (px < bestPx + 2 && px <= tolerancePx && depth < bestDepth)) {
            best = g.edge;
            bestPx = Math.min(px, bestPx);
            bestDepth = depth;
          }
        }
        a.copy(b);
        have = visible;
      }
    }
    return best;
  }

  /** Once a frame: keep widths constant on screen and the labels over their points. */
  update(camera: THREE.PerspectiveCamera, width: number, height: number, pixelRatio: number): void {
    if (!this.group.visible) return;
    this.uniforms.uPixelScale.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / height;
    this.uniforms.uPixelRatio.value = pixelRatio;
    const p = new V3();
    for (const l of this.labels) {
      p.copy(l.position).project(camera);
      const shown = p.z > -1 && p.z < 1;
      l.element.style.display = shown ? '' : 'none';
      if (shown) l.element.style.transform = `translate(-50%, -100%) translate(${((p.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * height).toFixed(1)}px)`;
    }
  }

  private clear(): void {
    for (const d of this.disposables) d.dispose();
    for (const m of this.materials) m.dispose();
    this.disposables = [];
    this.materials.length = 0;
    this.group.clear();
    this.edges = [];
    this.edgeIndex.clear();
    this.stationRings.clear();
    for (const l of this.labels) l.element.remove();
    this.labels.length = 0;
    this.tube = null;
    this.nodes = null;
    this.bower = null;
  }

  dispose(): void {
    this.clear();
  }
}
