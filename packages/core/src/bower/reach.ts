/**
 * Reach analysis: what a plant rooted at a station can get to, given how much
 * route it can cover. Answers PROJECT_CONTEXT.md section 2, first question:
 * "Which plants can physically find and occupy the available routes from
 * their root stations?"
 *
 * The budget is a length of ROUTE. A published mature height is not a route
 * budget and must not be passed in as one without saying so.
 */
import type { Route, TraverseOptions } from './support-graph.ts';
import type { Bower, SupportEdge } from './types.ts';

export interface ReachReport {
  stationId: string;
  budgetM: number;
  nodesReached: number;
  nodesTotal: number;
  /** Length of route lying wholly within the budget. */
  routeReachedM: number;
  routeTotalM: number;
  /** Greatest height above ground among reached nodes. */
  highestReachedM: number;
  /** Greatest height above ground among all nodes. */
  highestNodeM: number;
  /** Route length to each reached node. */
  distanceByNode: Map<string, number>;
}

function station(bower: Bower, stationId: string) {
  const s = bower.rootStations.find((r) => r.id === stationId);
  if (!s) throw new Error(`unknown root station "${stationId}"`);
  return s;
}

export function analyseReach(bower: Bower, stationId: string, budgetM: number, allow?: (edge: SupportEdge) => boolean): ReachReport {
  const { graph } = bower;
  const opts: TraverseOptions = { budgetM };
  if (allow) opts.allow = allow;
  const reached = graph.reach(station(bower, stationId).entryNodeIds, opts);
  let highestReachedM = 0;
  let highestNodeM = 0;
  for (const n of graph.nodes.values()) {
    highestNodeM = Math.max(highestNodeM, n.position.z);
    if (reached.has(n.id)) highestReachedM = Math.max(highestReachedM, n.position.z);
  }
  let routeReachedM = 0;
  for (const e of graph.edges.values()) if (reached.has(e.from) && reached.has(e.to)) routeReachedM += e.curve.length;
  return {
    stationId,
    budgetM,
    nodesReached: reached.size,
    nodesTotal: graph.nodes.size,
    routeReachedM,
    routeTotalM: graph.totalLength,
    highestReachedM,
    highestNodeM,
    distanceByNode: new Map([...reached].map(([id, r]) => [id, r.distance])),
  };
}

/** The shortest route from a station to a node, ignoring any budget; null if no permitted route exists. */
export function shortestRoute(bower: Bower, stationId: string, targetNodeId: string, allow?: (edge: SupportEdge) => boolean): Route | null {
  const opts: TraverseOptions = {};
  if (allow) opts.allow = allow;
  const reached = bower.graph.reach(station(bower, stationId).entryNodeIds, opts);
  return bower.graph.routeTo(reached, targetNodeId);
}
