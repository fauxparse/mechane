import { describe, expect, it } from "vitest";

import { FLOW_NODE_TYPE } from "./graph-to-flow";
import { reconcileEdges, reconcileNodes, SELECTED_EDGE_Z } from "./reconcile-nodes";
import type { ShowFlowEdge, ShowFlowNode } from "./graph-to-flow";

function node(id: string, overrides: Partial<ShowFlowNode> = {}): ShowFlowNode {
  return {
    id,
    type: "showNode",
    position: { x: 0, y: 0 },
    data: {} as ShowFlowNode["data"],
    ...overrides,
  } as ShowFlowNode;
}

function flowNode(id: string, collapsed: boolean, overrides: Partial<ShowFlowNode> = {}) {
  return node(id, {
    type: FLOW_NODE_TYPE,
    data: { collapsed } as ShowFlowNode["data"],
    ...overrides,
  });
}

describe("reconcileNodes", () => {
  it("keeps a dragged node's live position", () => {
    const drawn = [node("source", { position: { x: 200, y: 300 } })];
    const live = [node("source", { position: { x: 20, y: 30 } })];

    expect(reconcileNodes(drawn, live, { dragging: true })).toEqual([
      expect.objectContaining({ position: { x: 20, y: 30 } }),
    ]);
  });

  // A node whose drawn `parentId` is undefined has left its Flow. Merging
  // drawn over live must say so, or React Flow keeps dragging it around with
  // the Flow it is no longer in, and the next drag tries to extract it again.
  it("clears the parent of a node that has moved out of its Flow", () => {
    const drawn = [node("scene", { parentId: undefined, position: { x: 900, y: 40 } })];
    const live = [node("scene", { parentId: "flow", position: { x: 24, y: 74 } })];

    expect(reconcileNodes(drawn, live)[0]?.parentId).toBeUndefined();
  });

  it("clears measured dimensions when a Flow collapses or expands", () => {
    const drawn = [flowNode("flow", true)];
    const live = [flowNode("flow", false, { measured: { width: 320, height: 240 } })];

    expect(reconcileNodes(drawn, live)[0]).toEqual(
      expect.objectContaining({ measured: undefined }),
    );
  });

  it("preserves live selection when the graph changes", () => {
    const drawn = [node("source", { data: { name: "Updated" } as ShowFlowNode["data"] })];
    const live = [
      node("source", { selected: true, data: { name: "Old" } as ShowFlowNode["data"] }),
    ];

    expect(reconcileNodes(drawn, live)[0]).toEqual(
      expect.objectContaining({ selected: true, data: { name: "Updated" } }),
    );
  });

  it("selects only the arriving node", () => {
    const drawn = [node("first"), node("arriving")];
    const live = [node("first", { selected: true })];

    expect(reconcileNodes(drawn, live, { selectOnArrival: "arriving" })).toEqual([
      expect.objectContaining({ id: "first", selected: false }),
      expect.objectContaining({ id: "arriving", selected: true }),
    ]);
  });
});

describe("reconcileEdges", () => {
  it("preserves live edge selection while applying drawn edge data", () => {
    const drawnEdge = {
      id: "edge",
      source: "source",
      target: "target",
      data: {
        kind: "wiring",
        targetVariableId: null,
        coercing: false,
        invalidReason: null,
        color: "neutral",
      },
    } as ShowFlowEdge;
    const drawn = [drawnEdge];
    const live: ShowFlowEdge[] = [
      {
        ...drawnEdge,
        data: {
          kind: "wiring",
          targetVariableId: null,
          coercing: false,
          conversion: null,
          invalidReason: "old",
          warningReason: null,
          color: "neutral",
          sourceColor: "neutral",
          targetColor: "neutral",
          layout: null,
          parallelIndex: 0,
          parallelCount: 1,
        },
        selected: true,
      },
    ];

    expect(reconcileEdges(drawn, live)).toEqual([
      expect.objectContaining({ data: drawnEdge.data, selected: true }),
    ]);
  });

  // React Flow paints the node layer after the edge layer and lifts a selected
  // node to 1000, so an edge that stays below that is drawn behind the nodes it
  // runs between — exactly when the author most needs to see where it goes.
  it("lifts a selected edge above every node", () => {
    const edge = { id: "edge", source: "source", target: "target" } as ShowFlowEdge;

    expect(reconcileEdges([edge], [{ ...edge, selected: true }])[0]?.zIndex).toBe(SELECTED_EDGE_Z);
    expect(SELECTED_EDGE_Z).toBeGreaterThan(1000);
  });

  // Deselecting has to put the edge back: a stale 2000 would keep it in front
  // of everything for the rest of the session.
  it("drops the elevation when an edge is deselected", () => {
    const edge = { id: "edge", source: "source", target: "target" } as ShowFlowEdge;
    const live = [{ ...edge, selected: false, zIndex: SELECTED_EDGE_Z }];

    expect(reconcileEdges([edge], live)[0]?.zIndex).toBeUndefined();
  });
});
