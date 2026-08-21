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
});
