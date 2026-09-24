import {
  type FlowNode,
  type NavigateEdge,
  type SceneNode,
  type WiringEdge,
  assertValidShowGraph,
} from "@mechane/domain/graph";
import { describe, expect, it } from "vitest";

import { decodeShowGraphDocument, ShowGraphDocumentError } from "./show-graph-document";

type Wire = Record<string, unknown>;

/** A node fixture using the domain kind vocabulary as a shorthand for __typename. */
function apiNode(overrides: { id: string; kind: string } & Wire): Wire {
  const { kind, ...rest } = overrides;
  const typeName = ({
    scene: "SceneNode",
    flow: "FlowNode",
    source: "SourceNode",
    transformer: "TransformerNode",
    device: "DeviceNode",
  }[kind] ?? kind) as string;
  return {
    __typename: typeName,
    name: overrides.id,
    parentId: null,
    defaultSceneId: null,
    sourceType: kind === "source" ? { kind: "text", shapeId: null, of: null } : undefined,
    transformerType:
      kind === "transformer" ? { kind: "number", shapeId: null, of: null } : undefined,
    ports: kind === "transformer" ? [] : undefined,
    transform:
      kind === "transformer"
        ? {
            __typename: "CalculateTransform",
            kind: "calculate",
            calculateFormula: "0",
            outputType: { kind: "number", shapeId: null, of: null },
          }
        : undefined,
    position: { x: 0, y: 0 },
    variables: [],
    perConnection: false,
    pairingCode: null,
    ...rest,
  };
}

function apiEdge(
  overrides: { id: string; kind: string; sourceId: string; targetId: string } & Wire,
): Wire {
  const { kind, ...rest } = overrides;
  const typeName = ({ wiring: "WiringEdge", navigate: "NavigateEdge", device: "DeviceEdge" }[
    kind
  ] ?? kind) as string;
  return {
    __typename: typeName,
    sourcePath: [],
    targetPath: [],
    targetVariableId: null,
    fieldMapping: null,
    cueId: null,
    actionId: null,
    ...rest,
  };
}

function document(graph: Wire): Wire {
  return {
    showId: "show_1",
    state: "draft",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 3,
    ...graph,
  };
}

function decode(graph: Wire) {
  return decodeShowGraphDocument(document(graph)).graph;
}

const NODES = [
  apiNode({
    id: "flow_vote",
    kind: "flow",
    name: "Vote",
    defaultSceneId: "scene_voting",
    size: { width: 640, height: 480 },
    color: "blue",
  }),
  apiNode({
    id: "scene_voting",
    kind: "scene",
    parentId: "flow_vote",
    position: { x: 24, y: 48 },
    color: "aqua",
    variables: [{ id: "variable_prompt", name: "prompt", type: null }],
  }),
  apiNode({ id: "source_tally", kind: "source", position: { x: 300, y: 0 } }),
  apiNode({ id: "transformer_winner", kind: "transformer" }),
  apiNode({ id: "device_phone", kind: "device" }),
];

const GRAPH: Wire = {
  nodes: NODES,
  edges: [
    {
      ...apiEdge({
        id: "edge_wire",
        kind: "wiring",
        sourceId: "source_tally",
        targetId: "scene_voting",
      }),
      targetPath: ["variable_prompt"],
      targetVariableId: "variable_prompt",
    },
    apiEdge({
      id: "edge_navigate",
      kind: "navigate",
      sourceId: "scene_voting",
      targetId: "scene_voting",
    }),
    apiEdge({ id: "edge_device", kind: "device", sourceId: "flow_vote", targetId: "device_phone" }),
  ],
};

describe("decodeShowGraphDocument", () => {
  it("converts every node kind", () => {
    expect(decode(GRAPH).nodes.map((node) => node.kind)).toEqual([
      "flow",
      "scene",
      "source",
      "transformer",
      "device",
    ]);
  });

  it("keeps names, positions, containment, and Variables", () => {
    const voting = decode(GRAPH).nodes.find((node) => node.id === "scene_voting") as SceneNode;
    expect(voting.name).toBe("scene_voting");
    expect(voting.position).toEqual({ x: 24, y: 48 });
    expect(voting.parentId).toBe("flow_vote");
    expect(voting.color).toBe("aqua");
    expect(voting.variables).toEqual([
      { id: "variable_prompt", name: "prompt", type: null, defaultValue: null },
    ]);
  });

  it("keeps a Flow's default Scene and authored size", () => {
    const flow = decode(GRAPH).nodes.find((node) => node.id === "flow_vote") as FlowNode;
    expect(flow.defaultSceneId).toBe("scene_voting");
    expect(flow.size).toEqual({ width: 640, height: 480 });
  });

  // The point of the conversion: fields that don't belong to a kind are gone,
  // not carried along as nulls, so the commands act on the domain's union.
  it("drops fields that don't belong to a kind", () => {
    const graph = decode(GRAPH);
    const source = graph.nodes.find((node) => node.id === "source_tally");
    expect(source).not.toHaveProperty("defaultSceneId");
    expect(source).not.toHaveProperty("variables");
    expect(graph.nodes.find((node) => node.id === "device_phone")).not.toHaveProperty("variables");
  });

  it("converts every edge kind, keeping paths and Cue/Action ids", () => {
    const graph = decode(GRAPH);
    const wire = graph.edges.find((edge) => edge.id === "edge_wire") as WiringEdge;
    expect(wire.targetPath).toEqual(["variable_prompt"]);
    const navigate = graph.edges.find((edge) => edge.id === "edge_navigate") as NavigateEdge;
    expect(navigate.cueId).toBeNull();
    expect(navigate.actionId).toBeNull();
    expect(graph.edges.map((edge) => edge.kind)).toEqual(["wiring", "navigate", "device"]);
  });

  it("keeps a wiring edge's conversion, and drops one it doesn't recognise (#532)", () => {
    const edges = decode({
      nodes: [...NODES, apiNode({ id: "scene_lobby", kind: "scene" })],
      edges: [
        apiEdge({
          id: "edge_first",
          kind: "wiring",
          sourceId: "source_tally",
          targetId: "scene_lobby",
          conversion: "firstItem",
        }),
        apiEdge({
          id: "edge_future",
          kind: "wiring",
          sourceId: "source_tally",
          targetId: "scene_lobby",
          conversion: "lastItem",
        }),
      ],
    }).edges as WiringEdge[];
    expect(edges[0]?.conversion).toBe("firstItem");
    expect(edges[1]?.conversion).toBeUndefined();
  });

  it("keeps an Action's layout, the durable half a Navigate edge's drag lives on (#475, #597)", () => {
    const actions =
      decode({
        ...GRAPH,
        cues: [
          {
            id: "cue_red",
            name: "Red",
            ownerKind: "scene",
            sceneId: "scene_voting",
            blockId: null,
            actionIds: ["action_red_green"],
            parameters: [],
          },
        ],
        actions: [
          {
            __typename: "NavigateAction",
            id: "action_red_green",
            cueId: "cue_red",
            kind: "navigate",
            targetSceneId: "scene_voting",
            layout: { HVH: { "1": -24 } },
          },
          {
            __typename: "NavigateAction",
            id: "action_untouched",
            cueId: "cue_red",
            kind: "navigate",
            targetSceneId: "scene_voting",
            layout: null,
          },
        ],
      }).actions ?? [];
    expect(actions.find((action) => action.id === "action_red_green")?.layout).toEqual({
      HVH: { "1": -24 },
    });
    expect(actions.find((action) => action.id === "action_untouched")).not.toHaveProperty("layout");
  });

  it("preserves Event Binding parameter mappings", () => {
    const graph = decode({
      ...GRAPH,
      cues: [
        {
          id: "cue_vote",
          name: "Vote",
          ownerKind: "scene",
          sceneId: "scene_voting",
          blockId: null,
          actionIds: [],
          parameters: [
            {
              id: "candidate",
              name: "Candidate",
              type: { kind: "text", shapeId: null, of: null },
              position: 0,
            },
          ],
        },
      ],
      eventBindings: [
        {
          id: "binding_vote",
          canvasId: "canvas_voting",
          elementId: "vote-button",
          eventKind: "tap",
          cueId: "cue_vote",
          position: 0,
          parameterMappings: [
            {
              parameterId: "candidate",
              source: { kind: "variable", variableId: "variable_candidate" },
            },
          ],
        },
      ],
    });
    expect(graph.eventBindings?.[0]?.parameterMappings).toEqual([
      { parameterId: "candidate", source: { kind: "variable", variableId: "variable_candidate" } },
    ]);
  });

  it("produces a graph the domain accepts", () => {
    // The fixture's Navigate edge is a self-loop, which is structurally legal;
    // what matters is that nothing about the conversion invents a violation.
    expect(() => assertValidShowGraph(decode(GRAPH))).not.toThrow();
  });

  it("carries the facts about the read beside the graph, not inside it", () => {
    const decoded = decodeShowGraphDocument(document(GRAPH));
    expect(decoded.version).toBe(3);
    expect(decoded.showId).toBe("show_1");
    expect(decoded.state).toBe("draft");
    expect(decoded.graph).not.toHaveProperty("version");
  });

  describe("Shapes", () => {
    const shapeDocument = (fields: Wire[]) =>
      decode({ nodes: [], edges: [], shapes: [{ id: "candidate", name: "Candidate", fields }] });

    const field = (overrides: Wire): Wire => ({
      name: String(overrides.id),
      required: true,
      type: { kind: "text", shapeId: null, of: null },
      default: null,
      ...overrides,
    });

    it("orders Fields by position, not by arrival", () => {
      const shape = shapeDocument([
        field({ id: "second", position: 1 }),
        field({ id: "first", position: 0 }),
      ]).shapes?.[0];
      expect(shape?.fields.map((entry) => entry.id)).toEqual(["first", "second"]);
    });

    it("unwraps an authored Field default out of its value union", () => {
      const shape = shapeDocument([
        field({
          id: "votes",
          position: 0,
          type: { kind: "number", shapeId: null, of: null },
          default: { __typename: "NumberValue", numberValue: 7 },
        }),
      ]).shapes?.[0];
      expect(shape?.fields[0]?.defaultValue).toBe(7);
    });

    it("keeps an image default whole, because its identity is the asset", () => {
      const image = { __typename: "ImageValue", assetId: "asset_1", url: "/a.png" };
      const shape = shapeDocument([
        field({
          id: "portrait",
          position: 0,
          type: { kind: "image", shapeId: null, of: null },
          default: image,
        }),
      ]).shapes?.[0];
      expect(shape?.fields[0]?.defaultValue).toEqual(image);
    });

    it("spells an absent default as Typed Absence", () => {
      const shape = shapeDocument([field({ id: "note", position: 0, required: false })])
        .shapes?.[0];
      expect(shape?.fields[0]?.defaultValue).toBeNull();
    });
  });

  describe("refusals", () => {
    const codeOf = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return error instanceof ShowGraphDocumentError ? error.code : "not-a-document-error";
      }
      return "no-error";
    };

    it("refuses a node kind this build doesn't know", () => {
      expect(
        codeOf(() => decode({ nodes: [apiNode({ id: "x", kind: "hologram" })], edges: [] })),
      ).toBe("unknown-node-kind");
    });

    it("refuses an edge kind this build doesn't know", () => {
      expect(
        codeOf(() =>
          decode({
            nodes: [],
            edges: [apiEdge({ id: "e", kind: "telepathy", sourceId: "a", targetId: "b" })],
          }),
        ),
      ).toBe("unknown-edge-kind");
    });

    // A subtype this build cannot describe used to become a Shuffle, which
    // invents a Transformer that does real work (ADR-0004).
    it("refuses a Transformer transform this build doesn't know, rather than shuffling", () => {
      expect(
        codeOf(() =>
          decode({
            nodes: [
              apiNode({
                id: "transformer_future",
                kind: "transformer",
                transform: { __typename: "InterpolateTransform", kind: "interpolate" },
              }),
            ],
            edges: [],
          }),
        ),
      ).toBe("unknown-transform-kind");
    });

    // An unrecognised owner used to fall through to Block ownership, which
    // silently reparents an authored interaction.
    it("refuses a Cue whose owner it cannot resolve, rather than reparenting it", () => {
      expect(
        codeOf(() =>
          decode({
            nodes: [],
            edges: [],
            cues: [
              {
                id: "cue_orphan",
                name: "Orphan",
                ownerKind: "conjecture",
                sceneId: null,
                blockId: null,
                actionIds: [],
                parameters: [],
              },
            ],
          }),
        ),
      ).toBe("invalid-cue-owner");
    });

    it("refuses an edge whose endpoint is not in the graph", () => {
      expect(
        codeOf(() =>
          decode({
            nodes: [apiNode({ id: "scene_a", kind: "scene" })],
            edges: [
              apiEdge({
                id: "edge_dangling",
                kind: "navigate",
                sourceId: "scene_a",
                targetId: "scene_gone",
              }),
            ],
          }),
        ),
      ).toBe("unresolved-reference");
    });

    it("refuses a Cue naming an Action that is not in the graph", () => {
      expect(
        codeOf(() =>
          decode({
            nodes: [],
            edges: [],
            cues: [
              {
                id: "cue_vote",
                name: "Vote",
                ownerKind: "scene",
                sceneId: "scene_voting",
                blockId: null,
                actionIds: ["action_gone"],
                parameters: [],
              },
            ],
          }),
        ),
      ).toBe("unresolved-reference");
    });

    it("refuses two nodes sharing an id", () => {
      expect(
        codeOf(() =>
          decode({
            nodes: [
              apiNode({ id: "scene_a", kind: "scene" }),
              apiNode({ id: "scene_a", kind: "scene" }),
            ],
            edges: [],
          }),
        ),
      ).toBe("duplicate-id");
    });

    it("names the subject at fault", () => {
      try {
        decode({ nodes: [apiNode({ id: "node_odd", kind: "hologram" })], edges: [] });
        expect.unreachable();
      } catch (error) {
        expect((error as ShowGraphDocumentError).subjectId).toBe("node_odd");
      }
    });
  });
});
