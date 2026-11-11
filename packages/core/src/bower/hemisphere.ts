/**
 * The specification's reference shell: a hemisphere, by default 15 m across.
 *
 * It exists to keep one fact in front of every design decision (KEY.md
 * section 4): the crown is 7.5 m up, but the shortest route to it over the
 * surface is pi * R / 2 = 11.78 m, and real training routes are longer still.
 *
 * Primary timber: meridian ribs and ring beams, contact prohibited.
 * Secondary supports: a cable along every meridian and round every ring,
 * standing `standoffM` outside the timber. Plants travel only the cables.
 */
import { Polyline } from '../math/polyline.ts';
import { type Vec3, v3 } from '../math/vec3.ts';
import { unknown } from '../provenance.ts';
import { SupportGraph } from './support-graph.ts';
import type { Bower, LocalSupport, RootStation, StructuralMember } from './types.ts';

export interface HemisphereOptions {
  diameterM?: number;
  /** Number of meridian ribs. */
  meridians?: number;
  /** Number of latitude bands between the base and the crown. */
  rings?: number;
  /** How far the cables stand outside the timber surface. 0 puts routes on the ideal hemisphere. */
  standoffM?: number;
  /** Root stations, spaced evenly round the base. */
  stations?: number;
  cableDiameterMm?: number;
  /** Straight segments used to draw each curved edge. */
  segmentsPerEdge?: number;
}

export function makeHemisphereBower(options: HemisphereOptions = {}): Bower {
  const { diameterM = 15, meridians = 12, rings = 6, standoffM = 0.1, stations = 3, cableDiameterMm = 6, segmentsPerEdge = 24 } = options;
  if (meridians < 3 || rings < 2) throw new Error('a hemisphere needs at least 3 meridians and 2 rings');
  const R = diameterM / 2;
  const Rs = R + standoffM;
  const azimuth = (i: number) => (2 * Math.PI * i) / meridians;
  const elevation = (j: number) => (Math.PI / 2) * (j / rings);
  const at = (r: number, phi: number, theta: number): Vec3 => v3(r * Math.cos(theta) * Math.cos(phi), r * Math.cos(theta) * Math.sin(phi), r * Math.sin(theta));

  const members: StructuralMember[] = [];
  const supports: LocalSupport[] = [];
  const graph = new SupportGraph();
  const nodeId = (i: number, j: number) => (j === rings ? 'crown' : `m${i}.r${j}`);

  for (let i = 0; i < meridians; i++) {
    members.push({
      id: `rib.m${i}`,
      role: 'meridian',
      curve: Polyline.sample((t) => at(R, azimuth(i), (Math.PI / 2) * t), rings * segmentsPerEdge),
      section: { shape: 'rect', widthMm: 100, depthMm: 180 },
      material: 'glulam',
      contact: 'prohibited',
      inspectable: true,
    });
    supports.push({
      id: `cable.m${i}`,
      kind: 'cable',
      curve: Polyline.sample((t) => at(Rs, azimuth(i), (Math.PI / 2) * t), rings * segmentsPerEdge),
      diameterMm: cableDiameterMm,
      surface: 'smooth',
      contact: 'permitted',
      replaceable: true,
      mountedOn: [`rib.m${i}`],
    });
  }
  for (let j = 1; j < rings; j++) {
    members.push({
      id: `ring.r${j}`,
      role: 'ring',
      curve: Polyline.sample((t) => at(R, 2 * Math.PI * t, elevation(j)), meridians * segmentsPerEdge),
      section: { shape: 'rect', widthMm: 70, depthMm: 90 },
      material: 'larch',
      contact: 'prohibited',
      inspectable: true,
    });
    supports.push({
      id: `cable.r${j}`,
      kind: 'cable',
      curve: Polyline.sample((t) => at(Rs, 2 * Math.PI * t, elevation(j)), meridians * segmentsPerEdge),
      diameterMm: cableDiameterMm,
      surface: 'smooth',
      contact: 'permitted',
      replaceable: true,
      mountedOn: [`ring.r${j}`],
    });
  }

  // nodes: every meridian/ring crossing, and one shared crown
  for (let i = 0; i < meridians; i++) for (let j = 0; j < rings; j++) graph.addNode({ id: nodeId(i, j), position: at(Rs, azimuth(i), elevation(j)) });
  graph.addNode({ id: 'crown', position: at(Rs, 0, Math.PI / 2) });

  for (let i = 0; i < meridians; i++) {
    for (let j = 0; j < rings; j++) {
      graph.addEdge({
        id: `m${i}.r${j}-r${j + 1}`,
        from: nodeId(i, j),
        to: nodeId(i, j + 1),
        curve: Polyline.sample((t) => at(Rs, azimuth(i), elevation(j) + (elevation(j + 1) - elevation(j)) * t), segmentsPerEdge),
        host: { type: 'support', id: `cable.m${i}` },
        kind: 'cable',
        gripDiameterMm: cableDiameterMm,
        surface: 'smooth',
        contact: 'permitted',
        zones: [],
      });
    }
  }
  for (let j = 1; j < rings; j++) {
    for (let i = 0; i < meridians; i++) {
      const i2 = (i + 1) % meridians;
      const a0 = azimuth(i);
      const a1 = a0 + (2 * Math.PI) / meridians;
      graph.addEdge({
        id: `r${j}.m${i}-m${i2}`,
        from: nodeId(i, j),
        to: nodeId(i2, j),
        curve: Polyline.sample((t) => at(Rs, a0 + (a1 - a0) * t, elevation(j)), segmentsPerEdge),
        host: { type: 'support', id: `cable.r${j}` },
        kind: 'cable',
        gripDiameterMm: cableDiameterMm,
        surface: 'smooth',
        contact: 'permitted',
        zones: [],
      });
    }
  }

  const rootStations: RootStation[] = [];
  for (let s = 0; s < stations; s++) {
    const i = Math.round((s * meridians) / stations) % meridians;
    const foot = at(Rs + 0.3, azimuth(i), 0);
    rootStations.push({
      id: `station.${s}`,
      position: foot,
      entryNodeIds: [nodeId(i, 0)],
      soilVolumeM3: unknown('m3'),
      irrigated: unknown(),
      note: `at the foot of meridian ${i}`,
    });
  }

  return {
    id: `hemisphere-${diameterM}m`,
    name: `${diameterM} m hemispherical reference shell`,
    members,
    supports,
    graph,
    rootStations,
    zones: [],
    facts: {
      radiusM: R,
      crownHeightM: R,
      idealMeridianArcM: (Math.PI * R) / 2,
      supportMeridianArcM: (Math.PI * Rs) / 2,
      standoffM,
      meridians,
      rings,
    },
  };
}
