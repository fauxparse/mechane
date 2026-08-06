import { assertValidShowGraph, isId } from "@mechane/domain";
import type { ShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import { createNode, nodeIcon, NODE_KIND_META, CREATABLE_KINDS } from "./node-kinds";

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

  // #23 and #26: Flows and Devices are always Show-level peers, so a parent is
  // refused rather than stored and rejected later.
  it("never nests a Flow or a Device", () => {
    expect(createNode("flow", { x: 0, y: 0 }, "flow_1").parentId).toBeNull();
    expect(createNode("device", { x: 0, y: 0 }, "flow_1").parentId).toBeNull();
  });

  it("starts a Scene with no Variables and a Flow with no default Scene", () => {
    const scene = createNode("scene", { x: 0, y: 0 });
    expect(scene.kind === "scene" && scene.variables).toEqual([]);
    const flow = createNode("flow", { x: 0, y: 0 });
    expect(flow.kind === "flow" && flow.defaultSceneId).toBeNull();
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

  it("names a new node after its kind until it's renamed", () => {
    for (const kind of CREATABLE_KINDS) {
      expect(createNode(kind, { x: 0, y: 0 }).name).toBe(NODE_KIND_META[kind].defaultName);
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
    expect(nodeIcon("device", { deviceRole: "audience" })).not.toBe(nodeIcon("device"));
    expect(nodeIcon("source", { sourceType: "number" })).not.toBe(
      nodeIcon("source", { sourceType: "text" }),
    );
    // An unknown (or absent) type is an object, not a crash.
    expect(nodeIcon("source", { sourceType: "hologram" })).toBe(nodeIcon("source"));
  });
});
