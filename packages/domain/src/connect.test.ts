import { describe, expect, it } from "vitest";

import {
  canConnect,
  connectionEdge,
  connectionError,
  connectionKindFor,
  connectionTargets,
} from "./connect";
import { DEVICE_SOURCE_HANDLES } from "./graph";
import type {
  DeviceNode,
  FlowNode,
  SceneNode,
  ShowGraph,
  SourceNode,
  TransformerNode,
} from "./graph";

const at = { x: 0, y: 0 };

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

const VOTE: FlowNode = {
  id: "flow_vote",
  kind: "flow",
  name: "Vote",
  position: at,
  parentId: null,
  defaultSceneId: null,
};
const INTERVAL: FlowNode = { ...VOTE, id: "flow_interval", name: "Interval" };
const VOTING = scene("scene_voting", VOTE.id, ["variable_prompt"]);
const RESULTS = scene("scene_results", VOTE.id);
const INTERMISSION = scene("scene_intermission", INTERVAL.id);
const LOBBY = scene("scene_lobby", null, ["variable_house"]);
const TALLY: SourceNode = {
  id: "source_tally",
  kind: "source",
  name: "Tally",
  position: at,
  parentId: null,
  type: "number",
};
const LOCAL: SourceNode = { ...TALLY, id: "source_local", name: "Local", parentId: VOTE.id };
const TRANSFORMER: TransformerNode = {
  id: "transformer_total",
  kind: "transformer",
  name: "Total",
  position: at,
  parentId: null,
};
const OTHER_LOCAL: SourceNode = { ...LOCAL, id: "source_other", parentId: INTERVAL.id };
const LOCAL_TRANSFORMER: TransformerNode = {
  ...TRANSFORMER,
  id: "transformer_local",
  parentId: VOTE.id,
};
const PHONE: DeviceNode = {
  id: "device_phone",
  kind: "device",
  name: "Phones",
  position: at,
  parentId: null,
  perConnection: true,
  pairingCode: null,
};

const GRAPH: ShowGraph = {
  nodes: [VOTE, INTERVAL, VOTING, RESULTS, INTERMISSION, LOBBY, TALLY, LOCAL, TRANSFORMER, PHONE],
  edges: [],
};

describe("connectionKindFor", () => {
  it("reads wiring to a Transformer as a data connection", () => {
    expect(connectionKindFor(GRAPH, { sourceId: TALLY.id, targetId: TRANSFORMER.id })).toBe(
      "wiring",
    );
  });

  it("reads the edge kind off the pair of node kinds", () => {
    expect(connectionKindFor(GRAPH, { sourceId: TALLY.id, targetId: VOTING.id })).toBe("wiring");
    expect(connectionKindFor(GRAPH, { sourceId: VOTING.id, targetId: RESULTS.id })).toBe(
      "navigate",
    );
    expect(connectionKindFor(GRAPH, { sourceId: VOTE.id, targetId: PHONE.id })).toBe("device");
  });

  it("treats Device QR and pairing handles as value sources", () => {
    expect(
      connectionKindFor(GRAPH, {
        sourceId: PHONE.id,
        sourceHandle: DEVICE_SOURCE_HANDLES.qrCode,
        targetId: VOTING.id,
      }),
    ).toBe("wiring");
    expect(
      connectionKindFor(GRAPH, {
        sourceId: PHONE.id,
        sourceHandle: DEVICE_SOURCE_HANDLES.pairingCode,
        targetId: VOTING.id,
      }),
    ).toBe("wiring");
  });
  it("does not treat a virtual output as a target handle", () => {
    expect(
      connectionKindFor(GRAPH, {
        sourceId: TALLY.id,
        targetId: PHONE.id,
        targetHandle: DEVICE_SOURCE_HANDLES.pairingCode,
      }),
    ).toBeNull();
  });

  it("has no kind for pairs no edge runs between", () => {
    expect(connectionKindFor(GRAPH, { sourceId: VOTING.id, targetId: TALLY.id })).toBeNull();
    expect(connectionKindFor(GRAPH, { sourceId: PHONE.id, targetId: VOTING.id })).toBeNull();
    expect(connectionKindFor(GRAPH, { sourceId: VOTE.id, targetId: VOTING.id })).toBeNull();
  });
  it("allows a value source to feed a Source input", () => {
    expect(
      connectionEdge(GRAPH, { sourceId: TALLY.id, targetId: LOCAL.id }, "edge_source"),
    ).toEqual(
      expect.objectContaining({
        kind: "wiring",
        sourceId: TALLY.id,
        targetId: LOCAL.id,
        targetPath: [],
      }),
    );
  });
});

describe("connectionEdge", () => {
  it("leaves Transformer input paths unnamed", () => {
    expect(
      connectionEdge(GRAPH, { sourceId: TALLY.id, targetId: TRANSFORMER.id }, "edge_new"),
    )?.toEqual(expect.objectContaining({ kind: "wiring", targetPath: [] }));
  });

  it("puts the Variable at the head of a wiring edge's target path", () => {
    const edge = connectionEdge(
      GRAPH,
      { sourceId: TALLY.id, targetId: VOTING.id, targetVariableId: "variable_prompt" },
      "edge_new",
    );
    expect(edge).toEqual({
      id: "edge_new",
      kind: "wiring",
      sourceId: TALLY.id,
      targetId: VOTING.id,
      sourcePath: [],
      targetPath: ["variable_prompt"],
    });
  });

  it("stores Device virtual source handles in the source path", () => {
    expect(
      connectionEdge(
        GRAPH,
        {
          sourceId: PHONE.id,
          sourceHandle: DEVICE_SOURCE_HANDLES.qrCode,
          targetId: VOTING.id,
          targetVariableId: "variable_prompt",
        },
        "edge_qr",
      ),
    ).toEqual(
      expect.objectContaining({
        kind: "wiring",
        sourcePath: [DEVICE_SOURCE_HANDLES.qrCode],
        targetPath: ["variable_prompt"],
      }),
    );
  });

  it("won't build a wiring edge with no Variable to land on", () => {
    expect(
      connectionEdge(GRAPH, { sourceId: TALLY.id, targetId: VOTING.id }, "edge_new"),
    ).toBeNull();
  });

  it("leaves a hand-drawn Navigate edge's Cue and Action unset", () => {
    const edge = connectionEdge(GRAPH, { sourceId: VOTING.id, targetId: RESULTS.id }, "edge_new");
    expect(edge).toMatchObject({ kind: "navigate", cueId: null, actionId: null, targetPath: [] });
  });
});

describe("canConnect", () => {
  it("allows the three legal shapes", () => {
    expect(
      canConnect(GRAPH, {
        sourceId: TALLY.id,
        targetId: VOTING.id,
        targetVariableId: "variable_prompt",
      }),
    ).toBe(true);
    expect(canConnect(GRAPH, { sourceId: VOTING.id, targetId: RESULTS.id })).toBe(true);
    expect(canConnect(GRAPH, { sourceId: VOTE.id, targetId: PHONE.id })).toBe(true);
    expect(canConnect(GRAPH, { sourceId: LOBBY.id, targetId: PHONE.id })).toBe(true);
  });
  it("allows Device virtual sources to feed Variables", () => {
    expect(
      canConnect(GRAPH, {
        sourceId: PHONE.id,
        sourceHandle: DEVICE_SOURCE_HANDLES.pairingCode,
        targetId: VOTING.id,
        targetVariableId: "variable_prompt",
      }),
    ).toBe(true);
  });

  // A retry transition (#24). Everything else self-connecting is nonsense.
  it("allows a Scene to Navigate to itself but nothing else to self-connect", () => {
    expect(canConnect(GRAPH, { sourceId: VOTING.id, targetId: VOTING.id })).toBe(true);
    expect(connectionError(GRAPH, { sourceId: TALLY.id, targetId: TALLY.id })).toBe(
      "A node can't connect to itself.",
    );
  });

  it("refuses a Navigate edge across two Flows, and out of a Flow entirely", () => {
    expect(connectionError(GRAPH, { sourceId: VOTING.id, targetId: INTERMISSION.id })).toBe(
      "Navigate edges connect two Scenes in the same Flow.",
    );
    expect(connectionError(GRAPH, { sourceId: VOTING.id, targetId: LOBBY.id })).toBe(
      "Navigate edges connect two Scenes in the same Flow.",
    );
  });

  it("allows a Flow-local Source to pull a top-level Transformer into its Flow", () => {
    expect(connectionError(GRAPH, { sourceId: LOCAL.id, targetId: TRANSFORMER.id })).toBeNull();
    expect(
      connectionError(
        { ...GRAPH, nodes: [...GRAPH.nodes, OTHER_LOCAL, LOCAL_TRANSFORMER] },
        { sourceId: OTHER_LOCAL.id, targetId: LOCAL_TRANSFORMER.id },
      ),
    ).toContain("Source inside a Flow");
  });

  // #29's placement rule, enforced here because it's structural.
  it("refuses a Flow-local Source feeding outside its Flow", () => {
    expect(
      connectionError(GRAPH, {
        sourceId: LOCAL.id,
        targetId: LOBBY.id,
        targetVariableId: "variable_house",
      }),
    ).toBe("A Source inside a Flow can only feed nodes in that Flow.");
    expect(
      canConnect(GRAPH, {
        sourceId: LOCAL.id,
        targetId: VOTING.id,
        targetVariableId: "variable_prompt",
      }),
    ).toBe(true);
  });

  it("refuses a Device edge from a Scene nested in a Flow", () => {
    expect(connectionError(GRAPH, { sourceId: VOTING.id, targetId: PHONE.id })).toBe(
      "A Device is driven by a Flow or a top-level Scene, not by a Scene inside a Flow.",
    );
  });

  it("asks for a Variable when a wiring drag lands on the Scene's body", () => {
    expect(connectionError(GRAPH, { sourceId: TALLY.id, targetId: VOTING.id })).toBe(
      "Drop onto one of the Scene's Variables.",
    );
  });

  it("names the kinds when no edge runs between them", () => {
    expect(connectionError(GRAPH, { sourceId: PHONE.id, targetId: VOTING.id })).toBe(
      "A device can't connect to a scene.",
    );
  });

  it("refuses a duplicate of an edge that already exists", () => {
    const wired: ShowGraph = {
      ...GRAPH,
      edges: [
        {
          id: "edge_wire",
          kind: "wiring",
          sourceId: TALLY.id,
          targetId: VOTING.id,
          sourcePath: [],
          targetPath: ["variable_prompt"],
        },
        {
          id: "edge_navigate",
          kind: "navigate",
          sourceId: VOTING.id,
          targetId: RESULTS.id,
          sourcePath: [],
          targetPath: [],
          cueId: null,
          actionId: null,
        },
      ],
    };
    expect(
      connectionError(wired, {
        sourceId: TALLY.id,
        targetId: VOTING.id,
        targetVariableId: "variable_prompt",
      }),
    ).toBe("That connection already exists.");

    expect(connectionError(wired, { sourceId: VOTING.id, targetId: RESULTS.id })).toBe(
      "These Scenes are already connected.",
    );
  });

  it("says so when a node isn't in the graph", () => {
    expect(connectionError(GRAPH, { sourceId: "scene_ghost", targetId: PHONE.id })).toBe(
      "That node isn't in this Show.",
    );
  });
});

describe("connectionTargets", () => {
  it("lists the Scenes and Variables a Source may feed", () => {
    const targets = connectionTargets(GRAPH, TALLY.id);
    expect([...targets.nodeIds].sort()).toEqual(
      [LOBBY.id, VOTING.id, LOCAL.id, TRANSFORMER.id].sort(),
    );
    expect([...targets.variableIds].sort()).toEqual(["variable_house", "variable_prompt"]);
  });

  it("narrows to its own Flow for a Flow-local Source", () => {
    const targets = connectionTargets(GRAPH, LOCAL.id);
    expect([...targets.nodeIds]).toEqual([VOTING.id, TRANSFORMER.id]);
    expect([...targets.variableIds]).toEqual(["variable_prompt"]);
  });

  // A Scene is targetable by a Navigate drag without any Variable being so.
  it("lists Scenes in the same Flow, and Devices, for a Scene", () => {
    const targets = connectionTargets(GRAPH, VOTING.id);
    expect([...targets.nodeIds].sort()).toEqual([RESULTS.id, VOTING.id]);
    expect(targets.variableIds.size).toBe(0);
  });

  it("lists only Devices for a Flow", () => {
    expect([...connectionTargets(GRAPH, VOTE.id).nodeIds]).toEqual([PHONE.id]);
  });

  it("lists nothing for a node nothing can leave", () => {
    expect(connectionTargets(GRAPH, PHONE.id).nodeIds.size).toBe(0);
  });

  it("lists value targets for Device virtual source handles", () => {
    const targets = connectionTargets(GRAPH, PHONE.id, DEVICE_SOURCE_HANDLES.pairingCode);
    expect([...targets.nodeIds].sort()).toEqual(
      [LOBBY.id, VOTING.id, LOCAL.id, TALLY.id, TRANSFORMER.id].sort(),
    );
    expect([...targets.variableIds].sort()).toEqual(["variable_house", "variable_prompt"]);
  });
});
