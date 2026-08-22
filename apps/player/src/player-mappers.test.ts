import { describe, expect, it } from "vitest";
import { normalizePlayerSession } from "./player-mappers";

describe("normalizePlayerSession", () => {
  it("converts GraphQL discriminators and removes nullable Canvas properties", () => {
    const session = normalizePlayerSession({
      device: { id: "device_1", name: "Audience", perConnection: true },
      run: null,
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [
          {
            __typename: "DeviceNode",
            id: "device_1",
            name: "Audience",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            perConnection: true,
            pairingCode: "FBPCW",
          },
        ],
        edges: [
          {
            __typename: "DeviceEdge",
            id: "edge_1",
            sourceId: "scene_1",
            targetId: "device_1",
            sourcePath: [],
            targetPath: [],
          },
        ],
        shapes: [],
      },
      scene: null,
      canvas: {
        id: "canvas_1",
        kind: "scene",
        ownerId: "scene_1",
        ownerName: "Lobby",
        position: { x: 0, y: 0 },
        root: {
          __typename: "FrameElement",
          id: "root",
          name: "Root",
          parentId: null,
          rank: "a",
          hidden: false,
          fill: null,
          children: [],
        },
      },
      imageAssets: [],
    });

    expect(session.graph.nodes[0]).toMatchObject({ kind: "device", pairingCode: "FBPCW" });
    expect(session.graph.edges[0]).toMatchObject({ kind: "device" });
    expect(session.canvas?.root).toMatchObject({ type: "frame", children: [] });
    expect("fill" in (session.canvas?.root ?? {})).toBe(false);
  });

  it("normalizes GraphQL Type objects before domain resolution", () => {
    const session = normalizePlayerSession({
      device: { id: "device_1", name: "Projector", perConnection: false },
      run: null,
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [
          {
            __typename: "SourceNode",
            id: "source_candidate",
            name: "Candidate",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            sourceType: { kind: "shape", shapeId: "candidate", of: null },
            fieldDefaults: [],
          },
          {
            __typename: "SceneNode",
            id: "scene_vote",
            name: "Vote",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            variables: [
              {
                id: "variable_candidate",
                name: "Candidate",
                rank: "a",
                type: { kind: "shape", shapeId: "candidate", of: null },
                suggestedDimensions: null,
              },
            ],
          },
        ],
        edges: [],
        shapes: [
          {
            id: "candidate",
            name: "Candidate",
            fields: [
              {
                id: "field_name",
                name: "Name",
                position: 0,
                required: true,
                type: { kind: "text", shapeId: null, of: null },
              },
            ],
          },
        ],
      },
      scene: {
        __typename: "SceneNode",
        id: "scene_vote",
        name: "Vote",
        parentId: null,
        position: { x: 0, y: 0 },
        color: null,
        variables: [
          {
            id: "variable_candidate",
            name: "Candidate",
            rank: "a",
            type: { kind: "shape", shapeId: "candidate", of: null },
            suggestedDimensions: null,
          },
        ],
      },
      canvas: null,
      imageAssets: [],
    });

    expect(session.graph.shapes?.[0]?.fields[0]?.type).toBe("text");
    expect(session.graph.nodes.find((node) => node.kind === "source")).toMatchObject({
      type: { kind: "shape", shapeId: "candidate" },
    });
    expect(session.scene?.kind === "scene" ? session.scene.variables[0]?.type : null).toEqual({
      kind: "shape",
      shapeId: "candidate",
    });
  });
});
