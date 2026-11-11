/**
 * The support-path graph: the routes a plant can physically follow from a
 * root station. KEY.md section 4: "measured path length is not the same as
 * vertical height".
 */
import { distance } from '../math/vec3.ts';
import type { SupportEdge, SupportNode } from './types.ts';

export interface Reached {
  /** Route length from the nearest start node, in metres. */
  distance: number;
  /** The edge travelled to arrive here and the node it was entered from; null at a start. */
  via: { edgeId: string; from: string } | null;
}

export interface Route {
  nodes: string[];
  edges: string[];
  length: number;
}

export interface TraverseOptions {
  /** Which edges may be used. Attachment rules, zones and occupancy all enter here. */
  allow?: (edge: SupportEdge) => boolean;
  /** Stop expanding beyond this route length. */
  budgetM?: number;
}

export class SupportGraph {
  readonly nodes = new Map<string, SupportNode>();
  readonly edges = new Map<string, SupportEdge>();
  private readonly adjacency = new Map<string, string[]>();

  addNode(node: SupportNode): void {
    if (this.nodes.has(node.id)) throw new Error(`duplicate support node "${node.id}"`);
    this.nodes.set(node.id, node);
    this.adjacency.set(node.id, []);
  }

  addEdge(edge: SupportEdge): void {
    if (this.edges.has(edge.id)) throw new Error(`duplicate support edge "${edge.id}"`);
    const a = this.nodes.get(edge.from);
    const b = this.nodes.get(edge.to);
    if (!a || !b) throw new Error(`edge "${edge.id}" joins a node that does not exist`);
    // geometry and topology must agree, or route lengths would be fiction
    const tol = 1e-6 + 1e-3 * edge.curve.length;
    if (distance(a.position, edge.curve.start) > tol || distance(b.position, edge.curve.end) > tol) {
      throw new Error(`edge "${edge.id}": its curve does not start and end at its nodes`);
    }
    this.edges.set(edge.id, edge);
    this.adjacency.get(edge.from)!.push(edge.id);
    this.adjacency.get(edge.to)!.push(edge.id);
  }

  edgesAt(nodeId: string): SupportEdge[] {
    const ids = this.adjacency.get(nodeId);
    if (!ids) throw new Error(`unknown support node "${nodeId}"`);
    return ids.map((id) => this.edges.get(id)!);
  }

  /** The node at the other end of `edge` from `nodeId`. */
  otherEnd(edge: SupportEdge, nodeId: string): string {
    if (edge.from === nodeId) return edge.to;
    if (edge.to === nodeId) return edge.from;
    throw new Error(`node "${nodeId}" is not an end of edge "${edge.id}"`);
  }

  /** Total length of all routes, in metres. */
  get totalLength(): number {
    let sum = 0;
    for (const e of this.edges.values()) sum += e.curve.length;
    return sum;
  }

  /**
   * Shortest route length from any of `starts` to every node that can be
   * reached under `options` (Dijkstra). Unreached nodes are absent.
   */
  reach(starts: readonly string[], options: TraverseOptions = {}): Map<string, Reached> {
    const { allow, budgetM = Infinity } = options;
    const out = new Map<string, Reached>();
    const done = new Set<string>();
    // a binary heap of [distance, nodeId]
    const heap: [number, string][] = [];
    const push = (d: number, id: string) => {
      heap.push([d, id]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]![0] <= heap[i]![0]) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = (): [number, string] => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };

    for (const s of starts) {
      if (!this.nodes.has(s)) throw new Error(`unknown start node "${s}"`);
      out.set(s, { distance: 0, via: null });
      push(0, s);
    }
    while (heap.length) {
      const [d, id] = pop();
      if (done.has(id)) continue;
      done.add(id);
      for (const edge of this.edgesAt(id)) {
        if (allow && !allow(edge)) continue;
        const next = this.otherEnd(edge, id);
        const nd = d + edge.curve.length;
        if (nd > budgetM) continue;
        const known = out.get(next);
        if (!known || nd < known.distance) {
          out.set(next, { distance: nd, via: { edgeId: edge.id, from: id } });
          push(nd, next);
        }
      }
    }
    return out;
  }

  /** Rebuild the route to `target` from a `reach` result; null if it was not reached. */
  routeTo(reached: ReadonlyMap<string, Reached>, target: string): Route | null {
    const end = reached.get(target);
    if (!end) return null;
    const nodes = [target];
    const edges: string[] = [];
    let cur = end;
    while (cur.via) {
      edges.push(cur.via.edgeId);
      nodes.push(cur.via.from);
      cur = reached.get(cur.via.from)!;
    }
    return { nodes: nodes.reverse(), edges: edges.reverse(), length: end.distance };
  }
}
