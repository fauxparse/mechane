import { describe, expect, it } from "vitest";

import {
  assertValidGraphState,
  assertValidShowGraph,
  containingFlowId,
  deviceInstanceCardinality,
  deviceSourceType,
  DEVICE_SOURCE_HANDLES,
  emptyShowGraph,
  findNode,
  formatValuePath,
  InvalidGraphStateError,
  InvalidShowGraphError,
  isFlowLocal,
  nodesInFlow,
  topLevelNodes,
  wiringTargetVariableId,
} from "./graph";
import type {
  DeviceEdge,
  DeviceNode,
  FlowNode,
  GraphEdge,
  GraphNode,
  GraphViolation,
  NavigateEdge,
  SceneNode,
  ShowGraph,
  SourceNode,
  TransformerNode,
  WiringEdge,
} from "./graph";
import type { Shape } from "./shapes";

const at = { x: 0, y: 0 };

function expectViolation(run: () => unknown, reason: GraphViolation): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidShowGraphError);
    expect(error).toMatchObject({ reason });
    return;
  }
  throw new Error(`Expected InvalidShowGraphError with reason "${reason}".`);
}

function scene(id: string, parentId: string | null = null, variableIds: string[] = []): SceneNode {
  return {
    id,
    kind: "scene",
    name: id,
    position: at,
    parentId,
    variables: variableIds.map((variableId) => ({ id: variableId, name: variableId })),
  };
}

function flow(id: string, defaultSceneId: string | null = null): FlowNode {
  return { id, kind: "flow", name: id, position: at, parentId: null, defaultSceneId };
}
function source(
  id: string,
  parentId: string | null = null,
  type: SourceNode["type"] = "text",
): SourceNode {
  return { id, kind: "source", name: id, position: at, parentId, type };
}

function transformer(id: string, parentId: string | null = null): TransformerNode {
  return { id, kind: "transformer", name: id, position: at, parentId };
}

function device(id: string, perConnection = false): DeviceNode {
  return {
    id,
    kind: "device",
    name: id,
    position: at,
    parentId: null,
    perConnection,
    pairingCode: null,
  };
}

function wiring(
  id: string,
  sourceId: string,
  targetId: string,
  targetPath: string[],
  sourcePath: string[] = [],
): WiringEdge {
  return { id, kind: "wiring", sourceId, targetId, sourcePath, targetPath };
}

function navigate(
  id: string,
  sourceId: string,
  targetId: string,
  cueId: string | null = null,
): NavigateEdge {
  return {
    id,
    kind: "navigate",
    sourceId,
    targetId,
    sourcePath: [],
    targetPath: [],
    cueId,
    actionId: null,
  };
}

function deviceEdge(id: string, sourceId: string, targetId: string): DeviceEdge {
  return { id, kind: "device", sourceId, targetId, sourcePath: [], targetPath: [] };
}
function graph(nodes: GraphNode[], edges: GraphEdge[] = [], shapes: Shape[] = []): ShowGraph {
  return { nodes, edges, shapes };
}
const PATH_SHAPES: Shape[] = [
  {
    id: "path",
    name: "Path",
    fields: [
      {
        id: "tally",
        name: "Tally",
        type: { kind: "shape", shapeId: "tally" },
        required: true,
        defaultValue: { total: 0 },
      },
      {
        id: "voter",
        name: "Voter",
        type: { kind: "shape", shapeId: "voter" },
        required: true,
        defaultValue: { name: "", score: 0 },
      },
    ],
  },
  {
    id: "tally",
    name: "Tally",
    fields: [{ id: "total", name: "Total", type: "number", required: true, defaultValue: 0 }],
  },
  {
    id: "voter",
    name: "Voter",
    fields: [
      { id: "name", name: "Name", type: "text", required: true, defaultValue: "" },
      { id: "score", name: "Score", type: "number", required: true, defaultValue: 0 },
    ],
  },
];

/**
 * A Show exercising every node kind and every edge kind at once: a Flow
 * with two nested Scenes and a Flow-local Source, plus a top-level Scene
 * fed by a Show-level Source through a Transformer, with a Device on each.
 */
function fullShowGraph(): ShowGraph {
  return graph(
    [
      flow("f1", "c1"),
      scene("c1", "f1", ["v1"]),
      scene("c2", "f1"),
      source("r1", "f1"),
      scene("c3", null, ["v2"]),
      source("r2"),
      transformer("t1"),
      device("d1"),
      device("d2"),
    ],
    [
      wiring("e1", "r1", "c1", ["v1"]),
      wiring("e2", "t1", "c3", ["v2"]),
      navigate("e3", "c1", "c2", "cue-a"),
      navigate("e4", "c1", "c2", "cue-b"),
      navigate("e5", "c2", "c1"),
      deviceEdge("e6", "f1", "d1"),
      deviceEdge("e7", "c3", "d2"),
    ],
  );
}

describe("assertValidShowGraph", () => {
  it("accepts the empty graph — a Show with no Flows is valid", () => {
    expect(assertValidShowGraph(emptyShowGraph())).toEqual({ shapes: [], nodes: [], edges: [] });
  });

  it("accepts a graph with all five node kinds and all three edge kinds", () => {
    const showGraph = fullShowGraph();
    expect(assertValidShowGraph(showGraph)).toBe(showGraph);
  });

  it("rejects duplicate node ids", () => {
    expectViolation(() => assertValidShowGraph(graph([scene("c1"), scene("c1")])), "duplicateId");
  });

  it("rejects duplicate edge ids", () => {
    const showGraph = graph(
      [flow("f1"), scene("c1", "f1"), scene("c2", "f1")],
      [navigate("e1", "c1", "c2", "cue-a"), navigate("e1", "c2", "c1", "cue-b")],
    );
    expectViolation(() => assertValidShowGraph(showGraph), "duplicateId");
  });

  it("rejects two Variables with the same name on one Scene", () => {
    const withDuplicateNames = scene("c1");
    withDuplicateNames.variables = [
      { id: "v1", name: "tally" },
      { id: "v2", name: "tally" },
    ];
    expectViolation(() => assertValidShowGraph(graph([withDuplicateNames])), "duplicateId");
  });

  it("rejects a node whose position isn't a finite number", () => {
    const adrift = scene("c1");
    adrift.position = { x: Number.NaN, y: 0 };
    expectViolation(() => assertValidShowGraph(graph([adrift])), "nonFinitePosition");
  });

  describe("nesting", () => {
    it("accepts Scenes both nested in a Flow and top-level", () => {
      const showGraph = graph([flow("f1"), scene("c1", "f1"), scene("c2")]);
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects a Flow nested inside another Flow", () => {
      const nested = { ...flow("f2"), parentId: "f1" } as unknown as FlowNode;
      expectViolation(() => assertValidShowGraph(graph([flow("f1"), nested])), "flowNested");
    });

    it("rejects a Device nested inside a Flow", () => {
      const nested = { ...device("d1"), parentId: "f1" } as unknown as DeviceNode;
      expectViolation(() => assertValidShowGraph(graph([flow("f1"), nested])), "deviceNested");
    });

    it("rejects a node nested inside something that isn't a Flow", () => {
      expectViolation(
        () => assertValidShowGraph(graph([scene("c1"), source("r1", "c1")])),
        "invalidParent",
      );
    });

    it("rejects a node whose parent isn't in the graph", () => {
      expectViolation(() => assertValidShowGraph(graph([scene("c1", "f1")])), "missingNode");
    });

    it("rejects a Flow whose default Scene isn't one of its own Scenes", () => {
      expectViolation(
        () => assertValidShowGraph(graph([flow("f1", "c1"), scene("c1")])),
        "invalidDefaultScene",
      );
    });
  });

  describe("wiring edges", () => {
    it("accepts a Source and a Transformer feeding Scene Variables", () => {
      const showGraph = graph(
        [source("r1"), transformer("t1"), scene("c1", null, ["v1", "v2"])],
        [wiring("e1", "r1", "c1", ["v1"]), wiring("e2", "t1", "c1", ["v2"])],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects a wiring edge that starts anywhere but a Source, Transformer, or virtual Device source", () => {
      const showGraph = graph(
        [scene("c1", null, ["v1"]), scene("c2", null, ["v2"])],
        [wiring("e1", "c1", "c2", ["v2"])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "invalidWiringSource");
    });

    it("rejects a wiring edge targeting a node that isn't a Scene", () => {
      const showGraph = graph([source("r1"), device("d1")], [wiring("e1", "r1", "d1", ["v1"])]);
      expectViolation(() => assertValidShowGraph(showGraph), "invalidWiringTarget");
    });

    it("rejects a wiring edge targeting a Variable the Scene doesn't have", () => {
      const showGraph = graph(
        [source("r1"), scene("c1", null, ["v1"])],
        [wiring("e1", "r1", "c1", ["v-nope"])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "missingVariable");
    });

    it("carries a field path at each end", () => {
      const showGraph = graph(
        [source("r1", null, { kind: "shape", shapeId: "path" }), scene("c1", null, ["v1"])],
        [wiring("e1", "r1", "c1", ["v1", "count"], ["tally", "total"])],
        PATH_SHAPES,
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
      const [edge] = showGraph.edges;
      expect(wiringTargetVariableId(edge as WiringEdge)).toBe("v1");
      expect(formatValuePath((edge as WiringEdge).sourcePath)).toBe("tally.total");
    });

    it("allows two edges feeding different fields of one Variable", () => {
      const showGraph = graph(
        [source("r1", null, { kind: "shape", shapeId: "path" }), scene("c1", null, ["v1"])],
        [
          wiring("e1", "r1", "c1", ["v1", "name"], ["voter", "name"]),
          wiring("e2", "r1", "c1", ["v1", "score"], ["voter", "score"]),
        ],
        PATH_SHAPES,
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects overlapping producers for one Variable path", () => {
      const showGraph = graph(
        [source("r1"), source("r2"), scene("c1", null, ["v1"])],
        [wiring("e1", "r1", "c1", ["v1"]), wiring("e2", "r2", "c1", ["v1", "name"])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "wiringFanIn");
    });
    it("rejects incompatible wiring types with a discriminator", () => {
      const target = scene("c1", null, ["v1"]);
      target.variables[0]!.type = "image";
      const showGraph = graph([source("r1"), target], [wiring("e1", "r1", "c1", ["v1"])]);
      expectViolation(() => assertValidShowGraph(showGraph), "incompatibleTypes");
    });

    it("rejects wiring cycles with a discriminator", () => {
      const showGraph = graph(
        [source("r1"), source("r2")],
        [wiring("e1", "r1", "r2", []), wiring("e2", "r2", "r1", [])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "wiringCycle");
    });

    it("rejects a Device with more than one driver", () => {
      const showGraph = graph(
        [flow("f1"), scene("c1"), device("d1")],
        [deviceEdge("e1", "f1", "d1"), deviceEdge("e2", "c1", "d1")],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "deviceHasDriver");
    });

    it("rejects a wiring edge with no target path at all", () => {
      const showGraph = graph(
        [source("r1"), scene("c1", null, ["v1"])],
        [wiring("e1", "r1", "c1", [])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "emptyTargetPath");
    });

    it("rejects an empty segment in a path", () => {
      const showGraph = graph(
        [source("r1"), scene("c1", null, ["v1"])],
        [wiring("e1", "r1", "c1", ["v1"], ["tally", ""])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "emptyPathSegment");
    });

    it("rejects a duplicate wiring edge", () => {
      const showGraph = graph(
        [source("r1"), scene("c1", null, ["v1"])],
        [wiring("e1", "r1", "c1", ["v1"]), wiring("e2", "r1", "c1", ["v1"])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "duplicateEdge");
    });
  });

  describe("Flow-local placement", () => {
    it("lets a Flow-local Source feed a Scene in the same Flow", () => {
      const showGraph = graph(
        [flow("f1"), source("r1", "f1"), scene("c1", "f1", ["v1"])],
        [wiring("e1", "r1", "c1", ["v1"])],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects a Flow-local Source feeding a Scene outside its Flow", () => {
      const showGraph = graph(
        [flow("f1"), source("r1", "f1"), scene("c1", null, ["v1"])],
        [wiring("e1", "r1", "c1", ["v1"])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "flowLocalEscape");
    });

    it("rejects a Flow-local Source feeding a Scene in a different Flow", () => {
      const showGraph = graph(
        [flow("f1"), flow("f2"), source("r1", "f1"), scene("c1", "f2", ["v1"])],
        [wiring("e1", "r1", "c1", ["v1"])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "flowLocalEscape");
    });

    it("lets a Show-level Source feed a Scene inside a Flow", () => {
      const showGraph = graph(
        [flow("f1"), source("r1"), scene("c1", "f1", ["v1"])],
        [wiring("e1", "r1", "c1", ["v1"])],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("accepts multiple Flow-local inputs into a Transformer in their Flow", () => {
      const showGraph = graph(
        [flow("f1"), source("r1", "f1"), source("r2", "f1"), transformer("t1", "f1")],
        [wiring("e1", "r1", "t1", []), wiring("e2", "r2", "t1", [])],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects a Flow-local Source feeding a Transformer outside its Flow", () => {
      const showGraph = graph(
        [flow("f1"), source("r1", "f1"), transformer("t1")],
        [wiring("e1", "r1", "t1", [])],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "flowLocalEscape");
    });
  });

  describe("Navigate edges", () => {
    it("allows parallel edges for distinct Cue/Action pairings", () => {
      const showGraph = graph(
        [flow("f1"), scene("c1", "f1"), scene("c2", "f1")],
        [navigate("e1", "c1", "c2", "cue-a"), navigate("e2", "c1", "c2", "cue-b")],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects two edges for the same Cue/Action pairing", () => {
      const showGraph = graph(
        [flow("f1"), scene("c1", "f1"), scene("c2", "f1")],
        [navigate("e1", "c1", "c2", "cue-a"), navigate("e2", "c1", "c2", "cue-a")],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "duplicateEdge");
    });

    it("allows self-loops and bidirectional pairs", () => {
      const showGraph = graph(
        [flow("f1"), scene("c1", "f1"), scene("c2", "f1")],
        [navigate("e1", "c1", "c1"), navigate("e2", "c1", "c2"), navigate("e3", "c2", "c1")],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects an edge between Scenes in different Flows", () => {
      const showGraph = graph(
        [flow("f1"), flow("f2"), scene("c1", "f1"), scene("c2", "f2")],
        [navigate("e1", "c1", "c2")],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "crossFlowNavigate");
    });

    it("rejects an edge between top-level Scenes — a Flow is the state machine", () => {
      const showGraph = graph([scene("c1"), scene("c2")], [navigate("e1", "c1", "c2")]);
      expectViolation(() => assertValidShowGraph(showGraph), "crossFlowNavigate");
    });

    it("rejects an edge carrying a value path — a Navigate edge moves no value", () => {
      const withPath: NavigateEdge = { ...navigate("e1", "c1", "c2"), targetPath: ["v1"] };
      const showGraph = graph([flow("f1"), scene("c1", "f1"), scene("c2", "f1")], [withPath]);
      expectViolation(() => assertValidShowGraph(showGraph), "valuePathOnNonWiring");
    });

    it("rejects an edge that doesn't run Scene → Scene", () => {
      const showGraph = graph(
        [flow("f1"), scene("c1", "f1"), source("r1", "f1")],
        [navigate("e1", "c1", "r1")],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "invalidNavigateEndpoints");
    });
  });

  describe("Device edges", () => {
    it("accepts a Flow and a top-level Scene driving Devices", () => {
      const showGraph = graph(
        [flow("f1"), scene("c1"), device("d1"), device("d2")],
        [deviceEdge("e1", "f1", "d1"), deviceEdge("e2", "c1", "d2")],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("accepts many Devices wired to the same Flow", () => {
      const showGraph = graph(
        [flow("f1"), device("d1"), device("d2")],
        [deviceEdge("e1", "f1", "d1"), deviceEdge("e2", "f1", "d2")],
      );
      expect(() => assertValidShowGraph(showGraph)).not.toThrow();
    });

    it("rejects an edge from a Scene nested inside a Flow", () => {
      const showGraph = graph(
        [flow("f1"), scene("c1", "f1"), device("d1")],
        [deviceEdge("e1", "c1", "d1")],
      );
      expectViolation(() => assertValidShowGraph(showGraph), "nestedSceneDrivesDevice");
    });

    it("rejects an edge from a Source", () => {
      const showGraph = graph([source("r1"), device("d1")], [deviceEdge("e1", "r1", "d1")]);
      expectViolation(() => assertValidShowGraph(showGraph), "invalidDeviceSource");
    });

    it("rejects an edge that doesn't end at a Device", () => {
      const showGraph = graph([flow("f1"), scene("c1")], [deviceEdge("e1", "f1", "c1")]);
      expectViolation(() => assertValidShowGraph(showGraph), "invalidDeviceTarget");
    });

    it("rejects an edge whose Device isn't in the graph", () => {
      expectViolation(
        () => assertValidShowGraph(graph([flow("f1")], [deviceEdge("e1", "f1", "d1")])),
        "missingNode",
      );
    });
  });
});

describe("structural queries", () => {
  const showGraph = fullShowGraph();

  it("reports Flow-local placement from containment alone", () => {
    expect(isFlowLocal(findNode(showGraph, "r1")!)).toBe(true);
    expect(isFlowLocal(findNode(showGraph, "r2")!)).toBe(false);
    expect(containingFlowId(findNode(showGraph, "c1")!)).toBe("f1");
    expect(containingFlowId(findNode(showGraph, "c3")!)).toBeNull();
  });

  it("lists the nodes inside a Flow", () => {
    expect(nodesInFlow(showGraph, "f1").map((node) => node.id)).toEqual(["c1", "c2", "r1"]);
  });

  it("lists the Show-level nodes", () => {
    expect(topLevelNodes(showGraph).map((node) => node.id)).toEqual([
      "f1",
      "c3",
      "r2",
      "t1",
      "d1",
      "d2",
    ]);
  });

  it("returns null for an unknown node", () => {
    expect(findNode(showGraph, "nope")).toBeNull();
  });

  it("types Device virtual outputs as image and text values", () => {
    expect(deviceSourceType(DEVICE_SOURCE_HANDLES.qrCode)).toBe("image");
    expect(deviceSourceType(DEVICE_SOURCE_HANDLES.pairingCode)).toBe("text");
  });

  it("reads a Device's instance cardinality from perConnection", () => {
    expect(deviceInstanceCardinality(device("shared"))).toBe("one");
    expect(deviceInstanceCardinality(device("phones", true))).toBe("perConnection");
  });
});

describe("assertValidGraphState", () => {
  it("accepts the two states ADR-0002 defines", () => {
    expect(assertValidGraphState("draft")).toBe("draft");
    expect(assertValidGraphState("published")).toBe("published");
  });

  it("rejects anything else", () => {
    expect(() => assertValidGraphState("live")).toThrow(InvalidGraphStateError);
  });
});
