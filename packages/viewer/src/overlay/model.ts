// What the design overlay shows, worked out from the core. No rendering here:
// every number comes from analyseReach, shortestRoute and materialSummary.
//
// The overlay exists to keep one fact visible (KEY.md section 4): route length
// is not height. A budget is a length of ROUTE from a root station.
import { type Bower, type MaterialSummary, type ReachReport, type Route, type SupportEdge, analyseReach, materialSummary, shortestRoute } from '@horti/core';

/** What a root station can get to, with no budget applied. */
export interface StationField {
  stationId: string;
  /** Shortest route length from the station to every node it can reach at all, m. */
  distanceByNode: Map<string, number>;
  /** The longest of those: the top of the colour scale. */
  farthestM: number;
  /** The highest node of the support graph, and the shortest route to it from this station. */
  summit: {
    nodeId: string;
    heightM: number;
    /** Null when no route leads there from this station. */
    route: Route | null;
  };
}

export function stationField(bower: Bower, stationId: string): StationField {
  const all = analyseReach(bower, stationId, Infinity);
  let farthestM = 0;
  for (const d of all.distanceByNode.values()) farthestM = Math.max(farthestM, d);

  // the highest node; between nodes at the same height, the one nearest by route
  let nodeId = '';
  let heightM = -Infinity;
  let best = Infinity;
  for (const n of bower.graph.nodes.values()) {
    const d = all.distanceByNode.get(n.id) ?? Infinity;
    if (n.position.z > heightM + 1e-6 || (Math.abs(n.position.z - heightM) <= 1e-6 && d < best)) {
      nodeId = n.id;
      heightM = n.position.z;
      best = d;
    }
  }
  return { stationId, distanceByNode: all.distanceByNode, farthestM, summit: { nodeId, heightM, route: shortestRoute(bower, stationId, nodeId) } };
}

/** The same station under a route budget. */
export interface ReachView {
  report: ReachReport;
  /** Whether the budget reaches the highest node. */
  summitReached: boolean;
  /** Budget minus the route to the highest node: negative when it falls short. Null when there is no route. */
  marginM: number | null;
}

export function reachView(bower: Bower, field: StationField, budgetM: number): ReachView {
  const report = analyseReach(bower, field.stationId, budgetM);
  const routeM = field.summit.route?.length ?? null;
  return { report, summitReached: report.distanceByNode.has(field.summit.nodeId), marginM: routeM === null ? null : budgetM - routeM };
}

/**
 * Route length from the station to the two ends of an edge. A point `s` metres
 * along the edge is min(from + s, to + length - s) from the station, so a
 * budget can run out part of the way along it.
 */
export function edgeDistances(field: StationField, edge: SupportEdge): { from: number; to: number } {
  return { from: field.distanceByNode.get(edge.from) ?? Infinity, to: field.distanceByNode.get(edge.to) ?? Infinity };
}

export interface RouteInfo {
  id: string;
  kind: SupportEdge['kind'];
  hostId: string;
  gripDiameterMm: number;
  lengthM: number;
  /** Route length from the station to the nearer and the farther end; null if it cannot be reached. */
  nearM: number | null;
  farM: number | null;
}

export function routeInfo(field: StationField, edge: SupportEdge): RouteInfo {
  const { from, to } = edgeDistances(field, edge);
  const near = Math.min(from, to);
  const far = Math.min(Math.max(from, to), near + edge.curve.length);
  return {
    id: edge.id,
    kind: edge.kind,
    hostId: edge.host.id,
    gripDiameterMm: edge.gripDiameterMm,
    lengthM: edge.curve.length,
    nearM: Number.isFinite(near) ? near : null,
    farM: Number.isFinite(far) ? far : null,
  };
}

export function materials(bower: Bower): MaterialSummary {
  return materialSummary(bower);
}
