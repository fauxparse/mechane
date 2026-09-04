import type { ShowGraph } from "@mechane/domain";
import { assertValidShowGraph, isId } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import {
  CREATABLE_KINDS,
  CREATABLE_NODES,
  createNode,
  NODE_KIND_META,
  nodeIcon,
  typeLabel,
} from "./node-kinds";

describe("createNode", () => {
  // A node's id announces its kind (#47), which is what lets a log line or an
  // edge's endpoints be read without a lookup.
  it("gives each kind an id from its own prefix", () => {
    expect(isId("scene", createNode("scene", { x: 0, y: 0 }).id)).toBe(true);
    expect(isId("flow", createNode("flow", { x: 0, y: 0 }).id)).toBe(true);
    expect(isId("source", createNode("source", { x: 0, y: 0 }).id)).toBe(true);
    expect(isId("transformer", createNode("transformer", { x: 0, y: 0 }).id)).toBe(true);
    expect(isId("device", createNode("device", { x: 0, y: 0 }).id)).toBe(true);
  });

  it("places the node where it was asked for, on whole pixels", () => {
    expect(createNode("scene", { x: 12.4, y: -8.6 }).position).toEqual({ x: 12, y: -9 });
  });

  it("nests inside a Flow when asked", () => {
    expect(createNode("scene", { x: 0, y: 0 }, "flow_1").parentId).toBe("flow_1");
    expect(createNode("source", { x: 0, y: 0 }, "flow_1").parentId).toBe("flow_1");
  });
  it("preserves an explicitly inherited color", () => {
    expect(createNode("source", { x: 0, y: 0 }, null, { color: "purple" }).color).toBe("purple");
  });

  // #23 and #26: Flows and Devices are always Show-level peers, so a parent is
  // refused rather than stored and rejected later.
  it("never nests a Flow or a Device", () => {
    expect(createNode("flow", { x: 0, y: 0 }, "flow_1").parentId).toBeNull();
    expect(createNode("device", { x: 0, y: 0 }, "flow_1").parentId).toBeNull();
  });

  it("starts a Scene with no Variables and a Flow with explicit dimensions", () => {
    const scene = createNode("scene", { x: 0, y: 0 });
    expect(scene.kind === "scene" && scene.variables).toEqual([]);
    const flow = createNode("flow", { x: 0, y: 0 });
    expect(flow.kind === "flow" && flow.defaultSceneId).toBeNull();
    expect(flow.kind === "flow" && flow.size).toEqual({ width: 264, height: 130 });
  });

  it("produces nodes the domain accepts, including nested ones", () => {
    const flow = createNode("flow", { x: 0, y: 0 });
    const graph: ShowGraph = {
      nodes: [
        flow,
        createNode("scene", { x: 24, y: 24 }, flow.id),
        createNode("device", { x: 400, y: 0 }),
      ],
      edges: [],
    };
    expect(() => assertValidShowGraph(graph)).not.toThrow();
  });

  // A Device that isn't explicitly per-connection is the shared kind.
  it("makes a shared Device unless asked for a per-connection one", () => {
    const shared = createNode("device", { x: 0, y: 0 });
    expect(shared.kind === "device" && shared.perConnection).toBe(false);
    const audience = createNode("device", { x: 0, y: 0 }, null, { perConnection: true });
    expect(audience.kind === "device" && audience.perConnection).toBe(true);
  });

  it("leaves a new Device's pairing code for the server to mint", () => {
    const device = createNode("device", { x: 0, y: 0 });
    expect(device.kind === "device" && device.pairingCode).toBeNull();
  });

  it("names a new node after its kind until it's renamed", () => {
    for (const kind of CREATABLE_KINDS) {
      expect(createNode(kind, { x: 0, y: 0 }).name).toBe(NODE_KIND_META[kind].defaultName);
    }
  });
});

describe("CREATABLE_NODES", () => {
  // The menu offers one more entry than there are node kinds: a Device
  // comes in two flavours so the common cases start as the right kind.
  it("offers Audience as a second kind of Device", () => {
    const devices = CREATABLE_NODES.filter((creatable) => creatable.kind === "device");
    expect(devices.map((creatable) => creatable.perConnection)).toEqual([false, true]);
  });

  it("gives every entry a distinct id", () => {
    const ids = CREATABLE_NODES.map((creatable) => creatable.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("creates what each entry advertises", () => {
    for (const creatable of CREATABLE_NODES) {
      const node = createNode(creatable.kind, { x: 0, y: 0 }, null, {
        perConnection: creatable.perConnection,
        defaultName: creatable.defaultName,
      });
      expect(node.kind).toBe(creatable.kind);
      expect(node.name).toBe(creatable.defaultName);
    }
  });
});

describe("nodeIcon", () => {
  it("gives every kind an icon", () => {
    for (const kind of CREATABLE_KINDS) expect(nodeIcon(kind)).toBeTruthy();
  });

  // #35: a Device's icon resolves by role, a Source's by the type of data it
  // holds. Roles arrive with #45 and Shapes with the Source slice, so both fall
  // back for now — but the by-role and by-type principle is wired.
  it("resolves a Device by role and a Source by data type", () => {
    expect(nodeIcon("device", { perConnection: true })).not.toBe(nodeIcon("device"));
    expect(nodeIcon("source", { sourceType: "number" })).not.toBe(
      nodeIcon("source", { sourceType: "text" }),
    );
    // An unknown (or absent) type is an object, not a crash.
    expect(nodeIcon("source", { sourceType: "hologram" })).toBe(nodeIcon("source"));
  });
});

describe("typeLabel", () => {
  const shapes = [{ id: "shape_person", name: "Person", fields: [] }];

  it("resolves Shape references to their names, including array members", () => {
    expect(typeLabel({ kind: "shape", shapeId: "shape_person" }, shapes)).toBe("Person");
    expect(
      typeLabel({ kind: "array", of: { kind: "shape", shapeId: "shape_person" } }, shapes),
    ).toBe("array<Person>");
  });

  it("uses a generic label when a Shape reference is unavailable", () => {
    expect(typeLabel({ kind: "shape", shapeId: "missing_shape" })).toBe("Shape");
  });
});
