// Maps a Show graph as the API returns it (issue #38) onto React Flow's
// node and edge shapes (issue #40).
//
// This is the whole of the vendor boundary for graph *shape*: React Flow's
// `Node`/`Edge` types stop here, and everything upstream of this module
// speaks the domain's language. That matters more than usual because two of
// the mappings are not one-to-one:
//
//   - **Containment.** The domain says "this node's parent is that Flow"
//     (`parentId`, #29). React Flow says "this node is a child of that
//     node, and its position is relative to it" (`parentNode`). Same fact,
//     and the domain's stored positions for Flow-local nodes are already
//     relative to their Flow — but React Flow additionally needs the parent
//     to be *sized*, and to appear before its children in the array. Both
//     are handled below; neither is a thing the domain should know.
//
//   - **Wiring targets.** A wiring edge lands on a Scene *Variable*
//     (`targetPath[0]`), which will be a per-Variable handle once nodes get
//     their real visual language (#35). The placeholder node has one input
//     handle, so the Variable is carried in `data` and not yet addressed as
//     a handle — the edge is drawn to the node, not to the row.
//
// Node bodies are deliberately placeholders: issue #40 is about the camera,
// and the visual language is #35's.
import { isNodeKind } from "@presence/domain";
import type { NodeKind } from "@presence/domain";
import type { ShowGraph, ShowGraphEdge, ShowGraphNode } from "@presence/graphql-schema";
import type { Edge, Node } from "reactflow";

/**
 * Placeholder node geometry. React Flow measures rendered nodes itself, but
 * a Flow's size has to be known *before* first render (an unsized parent
 * clips its children to nothing), so the placeholder commits to a fixed box
 * and this module can do the arithmetic.
 */
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 56;

/** Breathing room between a Flow's boundary and the nodes inside it. */
const FLOW_PADDING = 24;

/** Height of a Flow's own title row, above the area its children sit in. */
const FLOW_HEADER_HEIGHT = 36;

export interface ShowNodeData {
  kind: NodeKind;
  name: string;
  /** Scene Variables, in graph order. Empty for every other kind. */
  variables: { id: string; name: string }[];
  /** The Scene a Flow enters by default (#23), if one has been chosen. */
  defaultSceneId: string | null;
}

export interface ShowEdgeData {
  kind: ShowGraphEdge["kind"];
  /**
   * The Scene Variable a wiring edge feeds — `targetPath[0]`, kept here
   * until nodes grow per-Variable handles (#35).
   */
  targetVariableId: string | null;
}

export type ShowFlowNode = Node<ShowNodeData>;
export type ShowFlowEdge = Edge<ShowEdgeData>;

/** The React Flow node type every kind currently renders as. */
export const PLACEHOLDER_NODE_TYPE = "showNode";

/** The React Flow node type a Flow renders as: a sized container. */
export const FLOW_NODE_TYPE = "showFlow";

function nodeKindOf(node: ShowGraphNode): NodeKind {
  // The API types `kind` as a string, so this is the boundary that turns it
  // back into the closed set the domain defines. A graph that gained a kind
  // this build doesn't know about should say so, not render as a blank box.
  if (!isNodeKind(node.kind)) {
    throw new Error(`Unknown Show graph node kind "${node.kind}" on node "${node.id}".`);
  }
  return node.kind;
}

/**
 * How big a Flow has to be to hold its children. Children keep their stored
 * positions (free-form, #25) — the container grows around them rather than
 * the positions being adjusted to fit a container.
 *
 * A childless Flow still gets one node's worth of room, so an empty Flow
 * reads as an empty container rather than as a collapsed sliver.
 */
export function flowSize(children: ShowGraphNode[]): { width: number; height: number } {
  const right = children.reduce((max, child) => Math.max(max, child.position.x + NODE_WIDTH), 0);
  const bottom = children.reduce((max, child) => Math.max(max, child.position.y + NODE_HEIGHT), 0);
  return {
    width: Math.max(NODE_WIDTH, right) + FLOW_PADDING,
    height: Math.max(FLOW_HEADER_HEIGHT + NODE_HEIGHT, bottom) + FLOW_PADDING,
  };
}

function toFlowNode(node: ShowGraphNode, children: ShowGraphNode[]): ShowFlowNode {
  const kind = nodeKindOf(node);
  const isFlow = kind === "flow";
  return {
    id: node.id,
    type: isFlow ? FLOW_NODE_TYPE : PLACEHOLDER_NODE_TYPE,
    position: { x: node.position.x, y: node.position.y },
    // React Flow reads `parentNode` positions as relative to the parent,
    // which is already how the domain stores a Flow-local node's position.
    ...(node.parentId ? { parentNode: node.parentId } : {}),
    // Every node is sized up front, not just Flows. React Flow measures
    // rendered nodes, but `fitView` on first paint runs *before* the first
    // measurement — an unsized node contributes nothing to the bounds, so
    // opening a Show would frame a graph with some of its nodes off-screen.
    style: isFlow ? flowSize(children) : { width: NODE_WIDTH, height: NODE_HEIGHT },
    data: {
      kind,
      name: node.name,
      variables: node.variables ?? [],
      defaultSceneId: node.defaultSceneId ?? null,
    },
  };
}

function toFlowEdge(edge: ShowGraphEdge): ShowFlowEdge {
  return {
    id: edge.id,
    source: edge.sourceId,
    target: edge.targetId,
    data: {
      kind: edge.kind,
      targetVariableId: edge.targetVariableId ?? null,
    },
  };
}

/**
 * The graph as React Flow wants it. Flows come first: React Flow v11
 * requires a parent to appear before its children, and sorting here means
 * no caller has to remember that.
 */
export function graphToFlow(graph: Pick<ShowGraph, "nodes" | "edges"> | null | undefined): {
  nodes: ShowFlowNode[];
  edges: ShowFlowEdge[];
} {
  if (!graph) return { nodes: [], edges: [] };

  const childrenByParent = new Map<string, ShowGraphNode[]>();
  for (const node of graph.nodes) {
    if (!node.parentId) continue;
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parentId, [node]);
  }

  const flows = graph.nodes.filter((node) => node.kind === "flow");
  const rest = graph.nodes.filter((node) => node.kind !== "flow");

  return {
    nodes: [...flows, ...rest].map((node) => toFlowNode(node, childrenByParent.get(node.id) ?? [])),
    edges: graph.edges.map(toFlowEdge),
  };
}
