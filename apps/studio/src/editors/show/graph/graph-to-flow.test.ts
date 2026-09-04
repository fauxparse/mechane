import { describe, expect, it } from "vitest";
import type {
  EdgeKind,
  EdgeLayout,
  FlowSize,
  FlowColor,
  GraphEdge,
  GraphNode,
  NodeKind,
  ShowGraph,
  Type,
} from "@mechane/domain";

import {
  DEFAULT_FLOW_DIMENSIONS,
  FLOW_HEADER_HEIGHT,
  FLOW_NODE_TYPE,
  fieldRows,
  flowSize,
  graphToFlow,
  NODE_HEIGHT,
  NODE_WIDTH,
  PLACEHOLDER_NODE_TYPE,
  VARIABLE_ROW_HEIGHT,
} from "./graph-to-flow";
import { handleFor } from "./handle-ids";

// These fixtures exercise vendor projection and geometry using domain graph
// nodes and edges; reusable graph facts have their own domain test suite.
type ShowGraphNode = {
  id: string;
  kind: NodeKind;
  name: string;
  parentId: string | null;
  defaultSceneId: string | null;
  size?: FlowSize;
  color?: FlowColor | null;
  position: { x: number; y: number };
  variables: { id: string; name: string; type?: Type | null }[];
  type?: Type | null;
  perConnection?: boolean;
  pairingCode?: string | null;
};

function node(overrides: Partial<ShowGraphNode> & Pick<ShowGraphNode, "id" | "kind">): GraphNode {
  const base = {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    parentId: overrides.parentId ?? null,
    position: overrides.position ?? { x: 0, y: 0 },
    ...(overrides.color ? { color: overrides.color } : {}),
  };
  switch (overrides.kind) {
    case "scene":
      return { ...base, kind: "scene", variables: overrides.variables ?? [] };
    case "flow":
      return {
        ...base,
        kind: "flow",
        parentId: null,
        defaultSceneId: overrides.defaultSceneId ?? null,
        ...(overrides.size ? { size: overrides.size } : {}),
      };
    case "source":
      return { ...base, kind: "source", type: overrides.type ?? "text" };
    case "transformer":
      return { ...base, kind: "transformer", type: overrides.type ?? null };
    case "device":
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: overrides.perConnection ?? false,
        pairingCode: overrides.pairingCode ?? null,
      };
  }
}

type ShowGraphEdge = {
  id: string;
  kind: EdgeKind;
  sourceId: string;
  targetId: string;
  sourcePath: string[];
  targetPath: string[];
  targetVariableId?: string | null;
  cueId?: string | null;
  actionId?: string | null;
  fieldMapping?: Record<string, string>;
  conversion?: "firstItem";
  layout?: EdgeLayout;
};

function edge(overrides: Partial<ShowGraphEdge> & Pick<ShowGraphEdge, "id" | "kind">): GraphEdge {
  const base = {
    id: overrides.id,
    sourceId: overrides.sourceId ?? "a",
    targetId: overrides.targetId ?? "b",
    sourcePath: overrides.sourcePath ?? [],
    targetPath: overrides.targetPath ?? [],
    ...(overrides.layout ? { layout: overrides.layout } : {}),
  };
  switch (overrides.kind) {
    case "wiring":
      return {
        ...base,
        kind: "wiring",
        ...(overrides.fieldMapping ? { fieldMapping: overrides.fieldMapping } : {}),
        ...(overrides.conversion ? { conversion: overrides.conversion } : {}),
      };
    case "navigate":
      return {
        ...base,
        kind: "navigate",
        cueId: overrides.cueId ?? null,
        actionId: overrides.actionId ?? null,
      };
    case "device":
      return { ...base, kind: "device" };
  }
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
          variables: [{ id: "variable_1", name: "prompt", type: null }],
        }),
      ],
      edges: [],
    });
    expect(nodes[0]?.data).toEqual({
      color: "neutral",
      kind: "scene",
      name: "Cast your vote",
      type: null,
      cues: [],
      fields: [],
      variables: [{ id: "variable_1", name: "prompt", type: null }],
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
  it("renders Scene Cues as outgoing handle rows", () => {
    const { nodes, edges } = graphToFlow({
      nodes: [
        node({ id: "flow_1", kind: "flow" }),
        node({ id: "scene_1", kind: "scene", parentId: "flow_1" }),
        node({ id: "scene_2", kind: "scene", parentId: "flow_1" }),
      ],
      cues: [
        {
          id: "cue_1",
          name: "Go to Green",
          owner: { kind: "scene", sceneId: "scene_1" },
          actionIds: ["action_1"],
        },
      ],
      actions: [{ id: "action_1", cueId: "cue_1", kind: "navigate", targetSceneId: "scene_2" }],
      edges: [
        {
          id: "navigate:action_1",
          kind: "navigate",
          sourceId: "scene_1",
          targetId: "scene_2",
          sourcePath: [],
          targetPath: [],
          cueId: "cue_1",
          actionId: "action_1",
        },
      ],
    });
    const scene = nodes.find((candidate) => candidate.id === "scene_1");
    if (!scene || scene.data.kind !== "scene") throw new Error("Expected Scene node.");
    expect(scene.data.cues).toEqual([{ id: "cue_1", name: "Go to Green", actionCount: 1 }]);
    expect(edges[0]?.sourceHandle).toBe(handleFor({ kind: "cue", id: "cue_1" }));
  });

  it("narrows rendered data by node kind", () => {
    const { nodes } = graphToFlow({
      nodes: [
        node({ id: "flow_1", kind: "flow", defaultSceneId: "scene_1" }),
        node({ id: "scene_1", kind: "scene" }),
        node({ id: "source_1", kind: "source" }),
        node({ id: "device_1", kind: "device", pairingCode: "ABC123" }),
      ],
      edges: [],
    });
    const byId = new Map(nodes.map((flowNode) => [flowNode.id, flowNode]));
    const flow = byId.get("flow_1");
    if (!flow || flow.data.kind !== "flow") throw new Error("Expected a Flow node.");
    expect(flow.data.collapsed).toBe(false);

    const scene = byId.get("scene_1");
    if (!scene || scene.data.kind !== "scene") throw new Error("Expected a Scene node.");
    expect(scene.data.type).toBeNull();

    const source = byId.get("source_1");
    if (!source || source.data.kind !== "source") throw new Error("Expected a Source node.");
    expect(source.data.fields).toEqual([]);

    const device = byId.get("device_1");
    if (!device || device.data.kind !== "device") throw new Error("Expected a Device node.");
    expect(device.data.pairingCode).toBe("ABC123");
  });
  it("projects handed Shape values into rows in Shape order", () => {
    const shapes = [
      {
        id: "shape_profile",
        name: "Profile",
        fields: [
          {
            id: "first",
            name: "First",
            type: "number" as const,
            required: true,
            defaultValue: 0,
          },
          {
            id: "second",
            name: "Second",
            type: "text" as const,
            required: true,
            defaultValue: "",
          },
        ],
      },
    ];
    const rows = fieldRows(
      node({
        id: "transformer_profile",
        kind: "transformer",
        type: { kind: "shape", shapeId: "shape_profile" },
      }),
      { first: 3, second: "Edited headline" },
      shapes,
    );

    expect(rows).toEqual([
      { id: "first", name: "First", type: "number", value: 3 },
      { id: "second", name: "Second", type: "text", value: "Edited headline" },
    ]);
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
            { id: "variable_1", name: "prompt", type: null },
            { id: "variable_2", name: "leader", type: null },
          ],
        }),
      ],
      edges: [],
    });
    const heights = new Map(nodes.map((n) => [n.id, n.initialHeight]));
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
            { id: "variable_fed", name: "prompt", type: null },
            { id: "variable_dangling", name: "leader", type: null },
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
        node({
          id: "scene_1",
          kind: "scene",
          variables: [{ id: "variable_1", name: "prompt", type: null }],
        }),
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
    expect(byId.get("edge_wire")?.targetHandle).toBe(
      handleFor({ kind: "variable", id: "variable_1" }),
    );
    expect(byId.get("edge_wire")?.sourceHandle).toBe(handleFor({ kind: "output" }));
    expect(byId.get("edge_nav")?.targetHandle).toBe(handleFor({ kind: "input" }));
  });

  // The conversion changes what the Variable receives, so it stays on the
  // edge for as long as the edge does, alongside a live report of whether it
  // is currently finding anything (#532).
  it("carries a first-item conversion and its live diagnostic onto the drawn edge", () => {
    const graph: ShowGraph = {
      nodes: [
        node({ id: "source_1", kind: "source", type: { kind: "array", of: "text" } }),
        node({
          id: "scene_1",
          kind: "scene",
          variables: [{ id: "variable_1", name: "prompt", type: "text" }],
        }),
      ],
      edges: [
        edge({
          id: "edge_first",
          kind: "wiring",
          sourceId: "source_1",
          targetId: "scene_1",
          targetPath: ["variable_1"],
          conversion: "firstItem",
        }),
      ],
    };

    const filled = graphToFlow(graph, { sourceValues: { source_1: ["Alice"] } });
    expect(filled.edges[0]?.data?.conversion).toBe("firstItem");
    expect(filled.edges[0]?.data?.invalidReason).toBeNull();
    expect(filled.edges[0]?.data?.warningReason).toBeNull();

    const empty = graphToFlow(graph, { sourceValues: { source_1: [] } });
    expect(empty.edges[0]?.data?.conversion).toBe("firstItem");
    expect(empty.edges[0]?.data?.warningReason).toMatch(/empty/);
  });

  it("uses the Flow color within a Flow and neutral across scopes", () => {
    const { edges } = graphToFlow({
      nodes: [
        node({ id: "flow_1", kind: "flow", color: "purple" }),
        node({ id: "source_1", kind: "source", parentId: "flow_1" }),
        node({
          id: "scene_1",
          kind: "scene",
          parentId: "flow_1",
          variables: [{ id: "variable_1", name: "Value", type: "text" }],
        }),
        node({ id: "device_1", kind: "device" }),
      ],
      edges: [
        edge({
          id: "inside",
          kind: "wiring",
          sourceId: "source_1",
          targetId: "scene_1",
          targetPath: ["variable_1"],
        }),
        edge({ id: "outside", kind: "device", sourceId: "flow_1", targetId: "device_1" }),
      ],
    });
    expect(edges.find((edge) => edge.id === "inside")?.data?.color).toBe("purple");
    expect(edges.find((edge) => edge.id === "outside")?.data?.color).toBe("neutral");
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

  it("uses each node color, inheriting its Flow color when unset", () => {
    const { nodes } = graphToFlow({
      nodes: [
        node({ id: "flow_1", kind: "flow", color: "aqua" }),
        node({ id: "scene_1", kind: "scene", parentId: "flow_1" }),
        node({ id: "scene_2", kind: "scene", parentId: "flow_1", color: "red" }),
        node({ id: "device_1", kind: "device" }),
      ],
      edges: [],
    });
    expect(nodes.find((node) => node.id === "flow_1")?.data.color).toBe("aqua");
    expect(nodes.find((node) => node.id === "scene_1")?.data.color).toBe("aqua");
    expect(nodes.find((node) => node.id === "scene_2")?.data.color).toBe("red");
    expect(nodes.find((node) => node.id === "device_1")?.data.color).toBe("neutral");
  });
  // The initial estimate is available for fitView, but ordinary nodes must
  // remain intrinsically sized after React Flow measures their DOM wrapper.
  it("seeds dimensions without pinning content-driven node height", () => {
    const { nodes } = graphToFlow({
      nodes: [node({ id: "device_1", kind: "device" })],
      edges: [],
    });
    expect(nodes[0]).toMatchObject({
      initialWidth: NODE_WIDTH,
      initialHeight: NODE_HEIGHT,
      style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT },
    });
    expect(nodes[0]?.style).not.toHaveProperty("height");
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
        edges: [
          {
            id: "edge_1",
            kind: "device",
            sourceId: "flow_1",
            targetId: "device_1",
            sourcePath: [],
            targetPath: [],
          },
        ],
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
            pairingCode: "V9BEZ",
          }),
        ],
        edges: [],
      });
      expect(nodes[0]?.data.perConnection).toBe(true);
      expect(nodes[0]?.data.pairingCode).toBe("V9BEZ");
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

    // The key has to be *present* and undefined, not missing: ../reconcile-nodes
    // merges drawn nodes over live ones, so an omitted key would leave a node
    // that has just left a Flow still pointing at it.
    it("states a Show-level node's absent parent rather than omitting it", () => {
      const { nodes } = graphToFlow({
        nodes: [node({ id: "scene_1", kind: "scene", parentId: null })],
        edges: [],
      });
      const scene = nodes.find((candidate) => candidate.id === "scene_1");
      expect(scene && "parentId" in scene).toBe(true);
      expect(scene?.parentId).toBeUndefined();
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

    it("uses authored dimensions instead of fitting around children", () => {
      const { nodes } = graphToFlow({
        nodes: [
          node({ id: "flow_1", kind: "flow" }),
          node({ id: "scene_1", kind: "scene", parentId: "flow_1", position: { x: 40, y: 80 } }),
          node({ id: "scene_2", kind: "scene", parentId: "flow_1", position: { x: 300, y: 80 } }),
        ],
        edges: [],
      });
      expect(nodes.find((n) => n.id === "flow_1")?.style).toEqual(DEFAULT_FLOW_DIMENSIONS);
    });

    it("uses explicit dimensions wherever the children are", () => {
      const size = { width: 1000, height: 900 };
      const { nodes } = graphToFlow({
        nodes: [
          node({ id: "flow_1", kind: "flow", size }),
          node({
            id: "scene_1",
            kind: "scene",
            parentId: "flow_1",
            position: { x: 1200, y: 1000 },
          }),
        ],
        edges: [],
      });
      expect(nodes.find((candidate) => candidate.id === "flow_1")?.style).toEqual(size);
    });

    it("uses compact dimensions while a Flow is collapsed", () => {
      const { nodes } = graphToFlow(
        {
          nodes: [
            node({ id: "flow_1", kind: "flow" }),
            node({ id: "scene_1", kind: "scene", parentId: "flow_1", position: { x: 40, y: 80 } }),
          ],
          edges: [],
        },
        {
          collapsedFlowIds: new Set(["flow_1"]),
        },
      );
      const flow = nodes.find((candidate) => candidate.id === "flow_1");
      expect(flow?.style).toEqual({ width: NODE_WIDTH, height: FLOW_HEADER_HEIGHT });
      expect(flow?.width).toBe(NODE_WIDTH);
      expect(flow?.height).toBe(FLOW_HEADER_HEIGHT);
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

    // The last link in the chain that carries a drag back from the database:
    // an edge's stored layout has to reach the drawn edge for the geometry to
    // read it back, jog keys and all.
    it("carries an authored layout through to the drawn edge", () => {
      const layout = { HVH: { "1": -24, "0.head": 36 } };
      const { edges } = graphToFlow({
        nodes: [node({ id: "scene_1", kind: "scene" }), node({ id: "scene_2", kind: "scene" })],
        edges: [
          edge({ id: "e1", kind: "navigate", sourceId: "scene_1", targetId: "scene_2", layout }),
        ],
      });

      expect(edges[0]?.data?.layout).toEqual(layout);
    });

    it("maps a virtual Device source path to its handle", () => {
      const { edges } = graphToFlow({
        nodes: [
          node({ id: "device_1", kind: "device", pairingCode: "V9BEZ" }),
          node({
            id: "scene_1",
            kind: "scene",
            variables: [{ id: "variable_1", name: "image" }],
          }),
        ],
        edges: [
          edge({
            id: "e_qr",
            kind: "wiring",
            sourceId: "device_1",
            targetId: "scene_1",
            sourcePath: ["qr-code"],
            targetPath: ["variable_1"],
            targetVariableId: "variable_1",
          }),
        ],
      });

      expect(edges[0]).toMatchObject({
        sourceHandle: handleFor({ kind: "deviceSource", name: "qr-code" }),
        targetHandle: handleFor({ kind: "variable", id: "variable_1" }),
      });
    });

    it("redirects every edge targeting a hidden child to the Flow handle", () => {
      const { edges } = graphToFlow(
        {
          nodes: [
            node({ id: "flow_1", kind: "flow" }),
            node({ id: "scene_1", kind: "scene", parentId: "flow_1" }),
            node({ id: "source_1", kind: "source" }),
          ],
          edges: [
            edge({
              id: "navigate_hidden",
              kind: "navigate",
              sourceId: "source_1",
              targetId: "scene_1",
            }),
          ],
        },
        { collapsedFlowIds: new Set(["flow_1"]) },
      );

      expect(edges[0]).toMatchObject({
        source: "source_1",
        target: "flow_1",
        targetHandle: handleFor({ kind: "input" }),
      });
    });

    it("redirects edges leaving hidden children to the Flow output", () => {
      const { edges } = graphToFlow(
        {
          nodes: [
            node({ id: "flow_1", kind: "flow" }),
            node({ id: "source_1", kind: "source", parentId: "flow_1" }),
            node({ id: "scene_2", kind: "scene" }),
          ],
          edges: [
            edge({
              id: "wiring_hidden",
              kind: "wiring",
              sourceId: "source_1",
              targetId: "scene_2",
              targetPath: ["variable_1"],
            }),
          ],
        },
        { collapsedFlowIds: new Set(["flow_1"]) },
      );

      expect(edges[0]).toMatchObject({
        source: "flow_1",
        sourceHandle: handleFor({ kind: "output" }),
        target: "scene_2",
      });
    });
    // Until nodes grow per-Variable handles (#35) the Variable is data, not
    // a handle — but it has to survive the trip, or #35 has to re-derive it.
    it("carries a wiring edge's target Variable", () => {
      const { edges } = graphToFlow({
        nodes: [
          node({ id: "source_1", kind: "source" }),
          node({
            id: "scene_1",
            kind: "scene",
            variables: [{ id: "variable_1", name: "Value", type: "text" }],
          }),
        ],
        edges: [
          edge({
            id: "e1",
            kind: "wiring",
            sourceId: "source_1",
            targetId: "scene_1",
            targetPath: ["variable_1", "name"],
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

describe("parallel edges and authored layout (#475)", () => {
  const scene = (id: string, x: number): GraphNode => ({
    id,
    kind: "scene",
    name: id,
    position: { x, y: 0 },
    parentId: "flow_1",
    variables: [],
  });

  const navigate = (id: string, cueId: string): GraphEdge => ({
    id,
    kind: "navigate",
    sourceId: "scene_a",
    targetId: "scene_b",
    sourcePath: [],
    targetPath: [],
    cueId,
    actionId: null,
  });

  const graph: ShowGraph = {
    nodes: [
      {
        id: "flow_1",
        kind: "flow",
        name: "Flow",
        position: { x: 0, y: 0 },
        parentId: null,
        defaultSceneId: null,
      },
      scene("scene_a", 0),
      scene("scene_b", 400),
    ],
    edges: [navigate("edge_1", "cue_1"), navigate("edge_2", "cue_2"), navigate("edge_3", "cue_3")],
  };

  it("numbers each edge within the set sharing both its handles", () => {
    const { edges } = graphToFlow(graph);
    expect(edges.map((edge) => edge.data?.parallelIndex)).toEqual([0, 1, 2]);
    expect(edges.map((edge) => edge.data?.parallelCount)).toEqual([3, 3, 3]);
  });

  it("leaves an edge with no rivals alone", () => {
    const { edges } = graphToFlow({ ...graph, edges: [navigate("edge_1", "cue_1")] });
    expect(edges[0]?.data).toMatchObject({ parallelIndex: 0, parallelCount: 1 });
  });

  it("carries an edge's authored layout through to the canvas", () => {
    const layout = { HVH: { "1": -24 } };
    const { edges } = graphToFlow({
      ...graph,
      edges: [{ ...navigate("edge_1", "cue_1"), layout }],
    });
    expect(edges[0]?.data?.layout).toEqual(layout);
  });

  it("says an edge has no layout rather than an empty one", () => {
    const { edges } = graphToFlow({ ...graph, edges: [navigate("edge_1", "cue_1")] });
    expect(edges[0]?.data?.layout).toBeNull();
  });
});
