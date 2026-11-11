/**
 * The specification's reference shell: a hemisphere, by default 15 m across.
 *
 * It exists to keep one fact in front of every design decision (KEY.md
 * section 4): the crown is 7.5 m up, but the shortest route to it over the
 * surface is pi * R / 2 = 11.78 m, and real training routes are longer still.
 *
 * The structure is the growing surface:
 *   MERIDIANS    curved glulam ribs from the ground to the crown: the primary
 *                structure, and the way up for a trained leader
 *   RING BEAMS   lighter timber rings between them: the timber sub-lattice
 *   CABLE RINGS  slender steel cables, straight from rib to rib, between the
 *                ring beams: the only steel, there for plants that cannot
 *                grasp timber
 *
 * Routes lie on the outer face of the timber, which is the ideal hemisphere
 * of radius R. Sizes are placeholders: the structures are still being designed.
 */
import { Polyline } from '../math/polyline.ts';
import { type Vec3, v3 } from '../math/vec3.ts';
import { unknown } from '../provenance.ts';
import { SupportGraph } from './support-graph.ts';
import { type Bower, type LocalSupport, type RootStation, type Section, type StructuralMember, equivalentDiameterMm, materialSummary } from './types.ts';

export interface HemisphereOptions {
  diameterM?: number;
  /** Number of meridian ribs. */
  meridians?: number;
  /** Number of bands between the base and the crown; a timber ring beam separates each pair. */
  rings?: number;
  /** Steel cable rings within each band. 0 gives an all-timber shell. */
  cableRingsPerBand?: number;
  /** Root stations, spaced evenly round the base. */
  stations?: number;
  cableDiameterMm?: number;
  /** Straight segments used to draw each curved edge. */
  segmentsPerEdge?: number;
}

const RIB = { shape: 'rect', widthMm: 100, depthMm: 180 } as const satisfies Section;
const RING = { shape: 'rect', widthMm: 70, depthMm: 90 } as const satisfies Section;

export function makeHemisphereBower(options: HemisphereOptions = {}): Bower {
  const { diameterM = 15, meridians = 12, rings = 6, cableRingsPerBand = 1, stations = 3, cableDiameterMm = 5, segmentsPerEdge = 24 } = options;
  if (meridians < 3 || rings < 2) throw new Error('a hemisphere needs at least 3 meridians and 2 rings');
  const R = diameterM / 2;
  const azimuth = (i: number) => (2 * Math.PI * i) / meridians;
  const at = (r: number, phi: number, theta: number): Vec3 => v3(r * Math.cos(theta) * Math.cos(phi), r * Math.cos(theta) * Math.sin(phi), r * Math.sin(theta));

  // Levels from the base (0) to just below the crown: fraction of the way up, and what runs round at that level.
  const levels: { f: number; ring: 'none' | 'timber' | 'cable' }[] = [{ f: 0, ring: 'none' }];
  for (let band = 0; band < rings; band++) {
    for (let c = 1; c <= cableRingsPerBand; c++) levels.push({ f: (band + c / (cableRingsPerBand + 1)) / rings, ring: 'cable' });
    if (band < rings - 1) levels.push({ f: (band + 1) / rings, ring: 'timber' });
  }
  const elevation = (j: number) => (Math.PI / 2) * (j < levels.length ? levels[j]!.f : 1);
  const nodeId = (i: number, j: number) => (j >= levels.length ? 'crown' : `m${i}.l${j}`);

  const members: StructuralMember[] = [];
  const supports: LocalSupport[] = [];
  const graph = new SupportGraph();

  for (let i = 0; i < meridians; i++) for (let j = 0; j < levels.length; j++) graph.addNode({ id: nodeId(i, j), position: at(R, azimuth(i), elevation(j)) });
  graph.addNode({ id: 'crown', position: at(R, 0, Math.PI / 2) });

  // ---- primary structure: glulam meridian ribs, each the way up ----------------
  for (let i = 0; i < meridians; i++) {
    const rib: StructuralMember = {
      id: `rib.m${i}`,
      tier: 'primary',
      role: 'meridian',
      curve: Polyline.sample((t) => at(R - RIB.depthMm / 2000, azimuth(i), (Math.PI / 2) * t), rings * segmentsPerEdge),
      section: RIB,
      material: 'glulam',
      surface: 'textured',
      contact: 'permitted',
      inspectable: true,
    };
    members.push(rib);
    for (let j = 0; j < levels.length; j++) {
      const e0 = elevation(j);
      const e1 = elevation(j + 1);
      graph.addEdge({
        id: `m${i}.l${j}-l${j + 1}`,
        from: nodeId(i, j),
        to: nodeId(i, j + 1),
        curve: Polyline.sample((t) => at(R, azimuth(i), e0 + (e1 - e0) * t), Math.max(2, Math.round(segmentsPerEdge * ((e1 - e0) / (Math.PI / 2)) * rings))),
        host: { type: 'member', id: rib.id },
        kind: 'timber',
        gripDiameterMm: equivalentDiameterMm(RIB),
        surface: 'textured',
        contact: 'permitted',
        zones: [],
      });
    }
  }

  // ---- sub-lattice: timber ring beams, and steel cable rings between them ------
  for (let j = 1; j < levels.length; j++) {
    const { ring } = levels[j]!;
    const theta = elevation(j);
    if (ring === 'timber') {
      const beam: StructuralMember = {
        id: `ring.l${j}`,
        tier: 'sub_lattice',
        role: 'ring',
        curve: Polyline.sample((t) => at(R - RING.depthMm / 2000, 2 * Math.PI * t, theta), meridians * segmentsPerEdge),
        section: RING,
        material: 'larch',
        surface: 'textured',
        contact: 'permitted',
        inspectable: true,
      };
      members.push(beam);
      for (let i = 0; i < meridians; i++) {
        const a0 = azimuth(i);
        const a1 = a0 + (2 * Math.PI) / meridians;
        graph.addEdge({
          id: `l${j}.m${i}-m${(i + 1) % meridians}`,
          from: nodeId(i, j),
          to: nodeId((i + 1) % meridians, j),
          curve: Polyline.sample((t) => at(R, a0 + (a1 - a0) * t, theta), segmentsPerEdge),
          host: { type: 'member', id: beam.id },
          kind: 'timber',
          gripDiameterMm: equivalentDiameterMm(RING),
          surface: 'textured',
          contact: 'permitted',
          zones: [],
        });
      }
    } else if (ring === 'cable') {
      for (let i = 0; i < meridians; i++) {
        const i2 = (i + 1) % meridians;
        // a tensioned cable is straight from rib to rib
        const curve = new Polyline([at(R, azimuth(i), theta), at(R, azimuth(i2), theta)]);
        const id = `l${j}.m${i}-m${i2}`;
        supports.push({ id: `cable.${id}`, kind: 'cable', curve, diameterMm: cableDiameterMm, material: 'stainless steel', surface: 'smooth', contact: 'permitted', replaceable: true, mountedOn: [`rib.m${i}`, `rib.m${i2}`] });
        graph.addEdge({ id, from: nodeId(i, j), to: nodeId(i2, j), curve, host: { type: 'support', id: `cable.${id}` }, kind: 'cable', gripDiameterMm: cableDiameterMm, surface: 'smooth', contact: 'permitted', zones: [] });
      }
    }
  }

  const rootStations: RootStation[] = [];
  for (let s = 0; s < stations; s++) {
    const i = Math.round((s * meridians) / stations) % meridians;
    rootStations.push({
      id: `station.${s}`,
      position: at(R + 0.3, azimuth(i), 0),
      entryNodeIds: [nodeId(i, 0)],
      soilVolumeM3: unknown('m3'),
      irrigated: unknown(),
      note: `at the foot of meridian ${i}`,
    });
  }

  const bower: Bower = { id: `hemisphere-${diameterM}m`, name: `${diameterM} m hemispherical reference shell`, members, supports, graph, rootStations, zones: [], facts: {} };
  const mat = materialSummary(bower);
  return {
    ...bower,
    facts: {
      radiusM: R,
      crownHeightM: R,
      meridianArcM: (Math.PI * R) / 2,
      meridians,
      rings,
      cableRingsPerBand,
      steelCableM: Number(mat.steelCableM.toFixed(1)),
      steelShareOfRoute: Number(mat.steelShareOfRoute.toFixed(3)),
      sizes: 'placeholders: the structure is still being designed',
    },
  };
}
