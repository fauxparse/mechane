import { describe, expect, it } from "vitest";
import type { ShowGraph } from "@mechane/domain";

import type { PlayerDriver, PlayerRunState, PlayerStorageAdapter } from "./player-state";
import { sceneVariableValues } from "./player-state";
import {
  openPlayerStateStore,
  playerRunScope,
  playerTransitionCoordinator,
  reconcilePlayerRunState,
} from "./player-state";

const graph: ShowGraph = {
  shapes: [
    {
      id: "votes",
      name: "Votes",
      fields: [
        {
          id: "count",
          name: "Count",
          type: "number",
          required: true,
          defaultValue: null,
        },
      ],
    },
  ],
  nodes: [
    {
      id: "source_votes",
      kind: "source",
      name: "Votes",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape", shapeId: "votes" },
    },
    {
      id: "scene_vote",
      kind: "scene",
      name: "Vote",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [{ id: "variable_total", name: "Total" }],
    },
  ],
  edges: [
    {
      id: "edge_votes",
      kind: "wiring",
      sourceId: "source_votes",
      targetId: "scene_vote",
      sourcePath: ["count"],
      targetPath: ["variable_total", "value"],
    },
  ],
  sourceFieldDefaults: [{ nodeId: "source_votes", fieldPath: ["count"], value: 7 }],
};

const mappedGraph: ShowGraph = {
  shapes: [
    {
      id: "source_shape",
      name: "Source",
      fields: [
        { id: "source_name", name: "Name", type: "text", required: true, defaultValue: null },
        { id: "source_score", name: "Score", type: "number", required: true, defaultValue: null },
      ],
    },
    {
      id: "target_shape",
      name: "Target",
      fields: [
        { id: "target_name", name: "Name", type: "text", required: true, defaultValue: null },
        { id: "target_score", name: "Score", type: "number", required: true, defaultValue: null },
      ],
    },
  ],
  nodes: [
    {
      id: "source_profile",
      kind: "source",
      name: "Profile",
      parentId: null,
      position: { x: 0, y: 0 },
      type: { kind: "shape", shapeId: "source_shape" },
    },
    {
      id: "scene_profile",
      kind: "scene",
      name: "Profile",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [
        {
          id: "variable_profile",
          name: "Profile",
          type: { kind: "shape", shapeId: "target_shape" },
        },
      ],
    },
  ],
  edges: [
    {
      id: "edge_profile",
      kind: "wiring",
      sourceId: "source_profile",
      targetId: "scene_profile",
      sourcePath: [],
      targetPath: ["variable_profile"],
      fieldMapping: { source_name: "target_name", source_score: "target_score" },
    },
  ],
};

const sourceChainGraph: ShowGraph = {
  nodes: [
    {
      id: "source_upstream",
      kind: "source",
      name: "Upstream",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "text",
    },
    {
      id: "source_downstream",
      kind: "source",
      name: "Downstream",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "text",
    },
    {
      id: "scene_chain",
      kind: "scene",
      name: "Chain",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [{ id: "variable_chain", name: "Chain", type: "text" }],
    },
  ],
  edges: [
    {
      id: "edge_source_chain",
      kind: "wiring",
      sourceId: "source_upstream",
      targetId: "source_downstream",
      sourcePath: [],
      targetPath: [],
    },
    {
      id: "edge_chain_scene",
      kind: "wiring",
      sourceId: "source_downstream",
      targetId: "scene_chain",
      sourcePath: [],
      targetPath: ["variable_chain"],
    },
  ],
};

const deviceGraph: ShowGraph = {
  nodes: [
    {
      id: "device_audience",
      kind: "device",
      name: "Audience",
      parentId: null,
      position: { x: 0, y: 0 },
      perConnection: false,
      pairingCode: "PAIR5",
    },
    {
      id: "source_pairing",
      kind: "source",
      name: "Pairing",
      parentId: null,
      position: { x: 0, y: 0 },
      type: "text",
    },
    {
      id: "scene_device",
      kind: "scene",
      name: "Device",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [
        { id: "variable_pairing", name: "Pairing", type: "text" },
        { id: "variable_qr", name: "QR", type: "image" },
      ],
    },
  ],
  edges: [
    {
      id: "edge_pairing_source",
      kind: "wiring",
      sourceId: "device_audience",
      targetId: "source_pairing",
      sourcePath: ["pairing-code"],
      targetPath: [],
    },
    {
      id: "edge_pairing_scene",
      kind: "wiring",
      sourceId: "source_pairing",
      targetId: "scene_device",
      sourcePath: [],
      targetPath: ["variable_pairing"],
    },
    {
      id: "edge_qr",
      kind: "wiring",
      sourceId: "device_audience",
      targetId: "scene_device",
      sourcePath: ["qr-code"],
      targetPath: ["variable_qr"],
    },
  ],
};

describe("sceneVariableValues", () => {
  it("projects live source fields onto nested scene variable paths", () => {
    expect(
      sceneVariableValues(graph, "scene_vote", {
        source_votes: { count: 7 },
      }),
    ).toEqual({ variable_total: { value: 7 } });
  });
  it("uses the live source value pushed by the editor", () => {
    expect(
      sceneVariableValues(graph, "scene_vote", {
        source_votes: { count: 42 },
      }),
    ).toEqual({ variable_total: { value: 42 } });
  });
  // The Current Source Value is complete Run state: a value the operator set
  // to what the Type's baseline happens to be is still the value they set,
  // whatever the authored default says.
  it("uses a live value that coincides with the type baseline", () => {
    expect(sceneVariableValues(graph, "scene_vote", { source_votes: { count: 0 } })).toEqual({
      variable_total: { value: 0 },
    });

    const graphWithPublishedEdit: ShowGraph = {
      ...graph,
      sourceFieldDefaults: [{ nodeId: "source_votes", fieldPath: ["count"], value: 0 }],
    };
    expect(
      sceneVariableValues(graphWithPublishedEdit, "scene_vote", {
        source_votes: { count: 0 },
      }),
    ).toEqual({ variable_total: { value: 0 } });
  });
  it("remaps structured Source values to destination field ids", () => {
    expect(
      sceneVariableValues(mappedGraph, "scene_profile", {
        source_profile: { source_name: "Alice", source_score: 7 },
      }),
    ).toEqual({
      variable_profile: { target_name: "Alice", target_score: 7 },
    });
  });

  it("propagates values through a Source-to-Source edge", () => {
    expect(
      sceneVariableValues(sourceChainGraph, "scene_chain", {
        source_upstream: "Live",
        source_downstream: "Stale",
      }),
    ).toEqual({ variable_chain: "Live" });
  });

  it("resolves Device pairing and QR virtual values", () => {
    const values = sceneVariableValues(deviceGraph, "scene_device", {});
    expect(values.variable_pairing).toBe("PAIR5");
    expect(values.variable_qr).toMatchObject({
      assetId: "device-qr:device_audience",
      revision: "PAIR5",
    });
  });
});
class MemoryStorage implements PlayerStorageAdapter {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storedState: PlayerRunState = {
  schemaVersion: 1,
  publishedGraphVersion: 2,
  flowId: "flow_navigation",
  navigation: { kind: "scene", sceneId: "scene_green" },
  flowSourceValues: {},
};

describe("per-connection Player state", () => {
  it("persists one scoped aggregate and supersedes an older tab", () => {
    const storage = new MemoryStorage();
    const storageListeners: Array<
      (change: { key: string | null; newValue: string | null }) => void
    > = [];
    const environment = {
      storage,
      randomToken: (() => {
        let next = 0;
        return () => `tab-${++next}`;
      })(),
      subscribeStorage: (
        listener: (change: { key: string | null; newValue: string | null }) => void,
      ) => {
        storageListeners.push(listener);
        return () => undefined;
      },
    };
    const scope = playerRunScope("PAR25", "run-1");
    const first = openPlayerStateStore(scope, environment);
    expect(first.claim()).toBe(true);
    expect(first.replace(storedState)).toBe(true);

    const second = openPlayerStateStore(scope, environment);
    expect(second.read()).toEqual(storedState);
    expect(second.claim()).toBe(true);
    let claimKey: string | null = null;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("mechane.player-claim:")) claimKey = key;
    }
    if (!claimKey) throw new Error("Claim key was not written.");
    storageListeners.forEach((listener) =>
      listener({ key: claimKey, newValue: storage.getItem(claimKey) }),
    );

    expect(first.getStatus()).toMatchObject({ ownership: "superseded" });
    expect(
      first.replace({ ...storedState, navigation: { kind: "scene", sceneId: "scene_blue" } }),
    ).toBe(false);
    expect(
      second.replace({ ...storedState, navigation: { kind: "scene", sceneId: "scene_blue" } }),
    ).toBe(true);
    expect(second.read()).toMatchObject({ navigation: { sceneId: "scene_blue" } });
  });

  it("reconciles valid, changed, and discarded drivers", () => {
    const driver = {
      kind: "flow",
      flowId: "flow_navigation",
      defaultSceneId: "scene_red",
      sceneIds: new Set(["scene_red", "scene_green", "scene_blue"]),
      publishedGraphVersion: 3,
    } satisfies PlayerDriver;
    expect(reconcilePlayerRunState(storedState, driver)).toMatchObject({
      kind: "preserve",
      state: { navigation: { sceneId: "scene_green" }, publishedGraphVersion: 3 },
    });
    expect(
      reconcilePlayerRunState(
        { ...storedState, navigation: { kind: "scene", sceneId: "scene_removed" } },
        driver,
      ),
    ).toMatchObject({
      kind: "reset",
      reason: "scene-invalid",
      state: { navigation: { sceneId: "scene_red" } },
    });
    expect(reconcilePlayerRunState(storedState, { kind: "scene" })).toEqual({
      kind: "discard",
      reason: "driver-not-flow",
    });
  });

  it("serializes transition operations after rejected work", async () => {
    const coordinator = playerTransitionCoordinator();
    const order: string[] = [];
    const first = coordinator.run(async () => {
      order.push("first");
      throw new Error("expected");
    });
    const second = coordinator.run(() => {
      order.push("second");
      return "done";
    });
    await expect(first).rejects.toThrow("expected");
    await expect(second).resolves.toBe("done");
    expect(order).toEqual(["first", "second"]);
  });
});
