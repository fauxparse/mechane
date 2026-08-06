import type { ShowGraphEdge, ShowGraphNode } from "@mechane/graphql-schema";
import { describe, expect, it } from "vitest";

import {
  FLOW_NODE_TYPE,
  flowSize,
  graphToFlow,
  INPUT_HANDLE,
  NODE_HEIGHT,
  NODE_WIDTH,
  OUTPUT_HANDLE,
  PLACEHOLDER_NODE_TYPE,
  VARIABLE_ROW_HEIGHT,
} from "./graph-to-flow";

// The API's node/edge shapes have every field on every kind (a Source
// carries a null `defaultSceneId`, and so on), so the fixtures spell out
// the whole shape and override the parts a case is about.
function node(overrides: Partial<ShowGraphNode> & Pick<ShowGraphNode, "id" | "kind">) {
  return {
    name: overrides.id,
    parentId: null,
    defaultSceneId: null,
    position: { x: 0, y: 0 },
    variables: [],
    ...overrides,
  } as ShowGraphNode;
}

function edge(overrides: Partial<ShowGraphEdge> & Pick<ShowGraphEdge, "id" | "kind">) {
  return {
    sourceId: "a",
    targetId: "b",
    sourcePath: [],
    targetPath: [],
    targetVariableId: null,
    cueId: null,
    actionId: null,
    ...overrides,
  } as ShowGraphEdge;
}

describe("graphToFlow", () => {
  it("has nothing to draw for a missing or empty graph", () => {
    expect(graphToFlow(null)).toEqual({ nodes: [], edges: [] });
    expect(graphToFlow({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
  });

  it("keeps each node's stored position (#25 — no auto-layout)", () => {
    const { nodes } = graphToFlow({
      nodes: [node({ id: "source_1", kind: "source", position: { x: -320, y: 91.5 } })],
      edges: [],
    });
    expect(nodes[0]?.position).toEqual({ x: -320, y: 91.5 });
  });

  it("carries the node's kind, name and Variables into its data", () => {
    const { nodes } = graphToFlow({
      nodes: [
        node({
          id: "scene_1",
          kind: "scene",
          name: "Cast your vote",
          variables: [{ id: "variable_1", name: "prompt" }],
        }),
      ],
      edges: [],
    });
    expect(nodes[0]?.data).toEqual({
      kind: "scene",
      name: "Cast your vote",
      variables: [{ id: "variable_1", name: "prompt" }],
      defaultSceneId: null,
      // Nothing feeds the Variable, so it's dangling (#35) — and nothing is
      // this Scene's Flow's entry point either.
      wiredVariableIds: [],
      isDefaultScene: false,
      childCount: 0,
      // Device-only fields, at their defaults on every other kind (#45).
      perConnection: false,
      pairingCode: null,
      driven: false,
    });
  });

  // #35 puts each Variable's handle on its own row, so a Scene's height is a
  // function of how many it has — and a Flow has to size around that.
  it("grows a Scene by a row per Variable", () => {
    const { nodes } = graphToFlow({
      nodes: [
        node({ id: "scene_bare", kind: "scene" }),
        node({
          id: "scene_wired",
          kind: "scene",
          variables: [
            { id: "variable_1", name: "prompt" },
            { id: "variable_2", name: "leader" },
          ],
        }),
      ],
      edges: [],
    });
    const heights = new Map(nodes.map((n) => [n.id, (n.style as { height: number }).height]));
    expect(heights.get("scene_bare")).toBe(NODE_HEIGHT);
    expect(heights.get("scene_wired")).toBeGreaterThan(NODE_HEIGHT + 2 * VARIABLE_ROW_HEIGHT - 1);
  });

  it("reports which Variables have a producer, and which Scene a Flow enters", () => {
    const { nodes } = graphToFlow({
      nodes: [
        node({ id: "flow_1", kind: "flow", defaultSceneId: "scene_1" }),
        node({
          id: "scene_1",
          kind: "scene",
          parentId: "flow_1",
          variables: [
            { id: "variable_fed", name: "prompt" },
            { id: "variable_dangling", name: "leader" },
          ],
        }),
        node({ id: "source_1", kind: "source" }),
      ],
      edges: [
        edge({
          id: "edge_1",
          kind: "wiring",
          sourceId: "source_1",
          targetId: "scene_1",
          targetPath: ["variable_fed"],
          targetVariableId: "variable_fed",
        }),
      ],
    });
    const scene = nodes.find((n) => n.id === "scene_1");
    expect(scene?.data.wiredVariableIds).toEqual(["variable_fed"]);
    expect(scene?.data.isDefaultScene).toBe(true);
    expect(nodes.find((n) => n.id === "flow_1")?.data.childCount).toBe(1);
  });

  // React Flow addresses handles by string, and a Variable already has a
  // stable id — so a wiring edge lands on the Variable's own row (#35).
  it("lands a wiring edge on its Variable's handle and everything else on the node's", () => {
    const { edges } = graphToFlow({
      nodes: [
        node({ id: "scene_1", kind: "scene", variables: [{ id: "variable_1", name: "prompt" }] }),
        node({ id: "scene_2", kind: "scene" }),
        node({ id: "source_1", kind: "source" }),
      ],
      edges: [
        edge({
          id: "edge_wire",
          kind: "wiring",
          sourceId: "source_1",
          targetId: "scene_1",
          targetPath: ["variable_1"],
          targetVariableId: "variable_1",
        }),
        edge({ id: "edge_nav", kind: "navigate", sourceId: "scene_1", targetId: "scene_2" }),
      ],
    });
    const byId = new Map(edges.map((e) => [e.id, e]));
    expect(byId.get("edge_wire")?.targetHandle).toBe("variable_1");
    expect(byId.get("edge_wire")?.sourceHandle).toBe(OUTPUT_HANDLE);
    expect(byId.get("edge_nav")?.targetHandle).toBe(INPUT_HANDLE);
  });

  it("renders Flows as containers and everything else as placeholders", () => {
    const { nodes } = graphToFlow({
      nodes: [
        node({ id: "flow_1", kind: "flow" }),
        node({ id: "device_1", kind: "device" }),
        node({ id: "transformer_1", kind: "transformer" }),
      ],
      edges: [],
    });
    const types = new Map(nodes.map((n) => [n.id, n.type]));
    expect(types.get("flow_1")).toBe(FLOW_NODE_TYPE);
    expect(types.get("device_1")).toBe(PLACEHOLDER_NODE_TYPE);
    expect(types.get("transformer_1")).toBe(PLACEHOLDER_NODE_TYPE);
  });

  // Sizes have to be known before the first measurement, or the `fitView`
  // that runs on first paint leaves nodes off-screen.
  it("sizes every node up front", () => {
    const { nodes } = graphToFlow({
      nodes: [node({ id: "device_1", kind: "device" })],
      edges: [],
    });
    expect(nodes[0]?.style).toEqual({ width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // A Device with nothing driving it displays nothing at performance time,
  // which the node marks — but it stays a legal graph, because creating the
  // projector before the Flow exists is ordinary work (#45).
  describe("Devices", () => {
    it("marks a Device nothing drives as undriven", () => {
      const { nodes } = graphToFlow({
        nodes: [
          node({ id: "flow_1", kind: "flow" }),
          node({ id: "device_1", kind: "device" }),
          node({ id: "device_2", kind: "device" }),
        ],
        edges: [{ id: "edge_1", kind: "device", sourceId: "flow_1", targetId: "device_1" }],
      });
      const byId = new Map(nodes.map((flowNode) => [flowNode.id, flowNode]));
      expect(byId.get("device_1")?.data.driven).toBe(true);
      expect(byId.get("device_2")?.data.driven).toBe(false);
    });

    it("carries instance cardinality and the pairing code through", () => {
      const { nodes } = graphToFlow({
        nodes: [
          node({
            id: "device_1",
            kind: "device",
            perConnection: true,
            pairingCode: "482913",
          }),
        ],
        edges: [],
      });
      expect(nodes[0]?.data.perConnection).toBe(true);
      expect(nodes[0]?.data.pairingCode).toBe("482913");
    });
  });

  describe("containment", () => {
    it("turns parentId into React Flow's parentNode", () => {
      const { nodes } = graphToFlow({
        nodes: [
          node({ id: "flow_1", kind: "flow" }),
          node({ id: "scene_1", kind: "scene", parentId: "flow_1" }),
        ],
        edges: [],
      });
      expect(nodes.find((n) => n.id === "scene_1")?.parentId).toBe("flow_1");
      expect(nodes.find((n) => n.id === "flow_1")?.parentId).toBeUndefined();
    });

    // React Flow v11 drops a child whose parent it hasn't seen yet.
    it("orders every Flow ahead of its children", () => {
      const { nodes } = graphToFlow({
        nodes: [
          node({ id: "scene_1", kind: "scene", parentId: "flow_1" }),
          node({ id: "source_1", kind: "source" }),
          node({ id: "flow_1", kind: "flow" }),
        ],
        edges: [],
      });
      expect(nodes.findIndex((n) => n.id === "flow_1")).toBeLessThan(
        nodes.findIndex((n) => n.id === "scene_1"),
      );
    });

    it("sizes a Flow around the children it holds", () => {
      const { nodes } = graphToFlow({
        nodes: [
          node({ id: "flow_1", kind: "flow" }),
          node({ id: "scene_1", kind: "scene", parentId: "flow_1", position: { x: 40, y: 80 } }),
          node({ id: "scene_2", kind: "scene", parentId: "flow_1", position: { x: 300, y: 80 } }),
        ],
        edges: [],
      });
      expect(nodes.find((n) => n.id === "flow_1")?.style).toEqual(
        flowSize([
          node({ id: "scene_1", kind: "scene", position: { x: 40, y: 80 } }),
          node({ id: "scene_2", kind: "scene", position: { x: 300, y: 80 } }),
        ]),
      );
    });

    it("refuses to render a kind it doesn't know", () => {
      expect(() =>
        graphToFlow({ nodes: [node({ id: "x_1", kind: "sprocket" })], edges: [] }),
      ).toThrow(/Unknown Show graph node kind "sprocket"/);
    });
  });

  describe("edges", () => {
    it("maps endpoints and carries the kind", () => {
      const { edges } = graphToFlow({
        nodes: [],
        edges: [edge({ id: "e1", kind: "navigate", sourceId: "scene_1", targetId: "scene_2" })],
      });
      expect(edges[0]).toMatchObject({
        id: "e1",
        source: "scene_1",
        target: "scene_2",
        data: { kind: "navigate", targetVariableId: null },
      });
    });

    // Until nodes grow per-Variable handles (#35) the Variable is data, not
    // a handle — but it has to survive the trip, or #35 has to re-derive it.
    it("carries a wiring edge's target Variable", () => {
      const { edges } = graphToFlow({
        nodes: [],
        edges: [
          edge({
            id: "e1",
            kind: "wiring",
            targetPath: ["variable_1", "name"],
            targetVariableId: "variable_1",
          }),
        ],
      });
      expect(edges[0]?.data?.targetVariableId).toBe("variable_1");
    });
  });
});

describe("flowSize", () => {
  it("gives an empty Flow room for one node", () => {
    const { width, height } = flowSize([]);
    expect(width).toBeGreaterThanOrEqual(NODE_WIDTH);
    expect(height).toBeGreaterThanOrEqual(NODE_HEIGHT);
  });

  it("grows to contain the furthest child", () => {
    const size = flowSize([node({ id: "scene_1", kind: "scene", position: { x: 300, y: 200 } })]);
    expect(size.width).toBeGreaterThan(300 + NODE_WIDTH);
    expect(size.height).toBeGreaterThan(200 + NODE_HEIGHT);
  });
});
