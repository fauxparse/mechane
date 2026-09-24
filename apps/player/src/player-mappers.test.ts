import { resolveRuntimeEvent } from "@mechane/domain/interactions";
import { defaultSourceValues } from "@mechane/domain/source-defaults";
import { decodeShowGraphDocument } from "@mechane/graphql-schema";
import { describe, expect, it } from "vitest";
import { normalizePlayerSession } from "./player-mappers";

describe("normalizePlayerSession", () => {
  it("converts GraphQL discriminators and removes nullable Canvas properties", () => {
    const session = normalizePlayerSession({
      device: { name: "Audience", perConnection: true },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [
          {
            __typename: "SceneNode",
            id: "scene_1",
            name: "Opening",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            variables: [],
          },
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
        elements: [
          {
            __typename: "FrameElement",
            id: "root",
            name: "Root",
            parentId: null,
            rank: "a",
            hidden: false,
            fill: null,
          },
        ],
      },
      imageAssets: [],
    });

    expect(session.graph.nodes[1]).toMatchObject({ kind: "device", pairingCode: "FBPCW" });
    expect(session.graph.edges[0]).toMatchObject({ kind: "device" });
    expect(session.canvas?.root).toMatchObject({ type: "frame" });
    expect("fill" in (session.canvas?.root ?? {})).toBe(false);
  });

  it("normalizes GraphQL Type objects before domain resolution", () => {
    const session = normalizePlayerSession({
      device: { name: "Projector", perConnection: false },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        sourceFieldDefaults: [
          { nodeId: "source_candidate", fieldPath: ["field_name"], value: "Alice" },
        ],
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
    expect(session.graph.sourceFieldDefaults).toEqual([
      { nodeId: "source_candidate", fieldPath: ["field_name"], value: "Alice" },
    ]);
    const sourceNode = session.graph.nodes.find((node) => node.kind === "source");
    expect(sourceNode).toMatchObject({
      type: { kind: "shape", shapeId: "candidate" },
    });
    expect("fieldDefaults" in (sourceNode ?? {})).toBe(false);
    expect(session.scene?.kind === "scene" ? session.scene.variables[0]?.type : null).toEqual({
      kind: "shape",
      shapeId: "candidate",
    });
  });
  it("preserves Block variables, State overrides, and selectors", () => {
    const session = normalizePlayerSession({
      device: { name: "Audience", perConnection: true },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [],
        edges: [],
        shapes: [],
        blocks: [
          {
            id: "block-card",
            name: "Card",
            stateSelectorVariableId: "selector",
            canvas: {
              id: "canvas-card",
              kind: "block",
              elements: [{ __typename: "FrameElement", id: "root", parentId: null, rank: "a0" }],
            },
            variables: [
              {
                id: "selector",
                name: "State",
                type: { kind: "text", shapeId: null, of: null },
                required: false,
                defaultValue: null,
              },
            ],
            states: [
              {
                id: "default",
                name: "Default",
                isDefault: true,
                overrides: [],
              },
            ],
          },
        ],
      },
      scene: null,
      canvas: null,
      imageAssets: [],
    });

    expect(session.blocks?.[0]).toMatchObject({
      stateSelectorVariableId: "selector",
      variables: [{ id: "selector", type: "text" }],
      states: [{ id: "default", isDefault: true }],
    });
    // The graph carries the same Blocks. Dispatch resolves a tap inside a
    // Slot against the contained Block's Canvas, and reads them off the graph
    // rather than the session — with the graph's list empty it cannot name
    // that Canvas and reports every such tap unbound.
    expect(session.graph.blocks).toEqual(session.blocks);
    expect(session.graph.blocks?.[0]?.canvas.id).toBe("canvas-card");
  });

  it("keeps a Show-level node's null parentId rather than dropping the key", () => {
    const session = normalizePlayerSession({
      device: { name: "Audience", perConnection: true },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [
          {
            __typename: "FlowNode",
            id: "flow_audience",
            name: "Audience",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            defaultSceneId: null,
          },
          {
            __typename: "SourceNode",
            id: "source_candidates",
            name: "Candidates",
            parentId: null,
            position: { x: 0, y: 0 },
            sourceType: { kind: "number", shapeId: null, of: null },
          },
          {
            __typename: "SourceNode",
            id: "source_selected",
            name: "Selected",
            parentId: "flow_audience",
            position: { x: 0, y: 0 },
            sourceType: { kind: "number", shapeId: null, of: null },
          },
        ],
        edges: [],
        shapes: [],
      },
      scene: null,
      canvas: null,
      blocks: [],
      imageAssets: [],
    });

    // `parentId === null` is how Show scope is spelled throughout dispatch, so
    // a stripped null reads a Show Source as Instance-scoped and sends its
    // writes to the Player's own state instead of the server.
    const [, showSource, flowSource] = session.graph.nodes;
    expect(showSource).toMatchObject({ id: "source_candidates", parentId: null });
    expect(Object.hasOwn(showSource ?? {}, "parentId")).toBe(true);
    expect(flowSource).toMatchObject({ id: "source_selected", parentId: "flow_audience" });
  });

  it("resolves API-relative image URLs for the Player origin", () => {
    const session = normalizePlayerSession(
      {
        device: { name: "Projector", perConnection: false },
        realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
        graph: {
          showId: "show_1",
          state: "published",
          updatedAt: "2026-08-22T00:00:00.000Z",
          version: 1,
          nodes: [],
          edges: [],
          shapes: [],
        },
        scene: null,
        canvas: null,
        imageAssets: [
          {
            id: "asset-alice",
            revision: "seed-v1",
            url: "/api/images/asset-alice/seed-v1",
            width: 128,
            height: 128,
            alt: "Alice",
            mimeType: "image/png",
            blurHash: null,
          },
        ],
      },
      "https://api.mechane.dev",
    );

    expect(session.imageAssets[0]?.url).toBe(
      "https://api.mechane.dev/api/images/asset-alice/seed-v1",
    );
  });
  it("normalizes interaction records for local audience navigation", () => {
    const session = normalizePlayerSession({
      device: { name: "Audience", perConnection: true },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [
          {
            __typename: "FlowNode",
            id: "flow_1",
            name: "Flow",
            parentId: null,
            position: { x: 0, y: 0 },
            defaultSceneId: "scene_red",
          },
          {
            __typename: "SceneNode",
            id: "scene_red",
            name: "Red",
            parentId: "flow_1",
            position: { x: 0, y: 0 },
            variables: [],
          },
          {
            __typename: "SceneNode",
            id: "scene_green",
            name: "Green",
            parentId: "flow_1",
            position: { x: 1, y: 0 },
            variables: [],
          },
        ],
        edges: [],
        cues: [
          {
            id: "cue_red_green",
            name: "Go to Green",
            ownerKind: "scene",
            sceneId: "scene_red",
            blockId: null,
            actionIds: ["action_red_green"],
          },
        ],
        actions: [
          {
            __typename: "NavigateAction",
            id: "action_red_green",
            cueId: "cue_red_green",
            kind: "navigate",
            targetSceneId: "scene_green",
          },
        ],
        eventBindings: [
          {
            id: "binding_red_green",
            canvasId: "canvas_red",
            elementId: "button_red_green",
            eventKind: "tap",
            params: null,
            cueId: "cue_red_green",
            position: 0,
          },
        ],
        shapes: [],
      },
      scene: null,
      canvas: null,
      imageAssets: [],
    });

    expect(
      resolveRuntimeEvent(session.graph, {
        sceneId: "scene_red",
        canvasId: "canvas_red",
        elementId: "button_red_green",
        eventKind: "tap",
      }),
    ).toMatchObject({ kind: "planned", actions: [{ targetSceneId: "scene_green" }] });
  });
  it("normalizes Update edges and actions", () => {
    const session = normalizePlayerSession({
      device: { name: "Projector", perConnection: false },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [
          {
            __typename: "SceneNode",
            id: "scene_red",
            name: "Red",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            variables: [],
          },
          {
            __typename: "SourceNode",
            id: "source_score",
            name: "Score",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            sourceType: { kind: "number", shapeId: null, of: null },
          },
        ],
        edges: [
          {
            __typename: "UpdateEdge",
            id: "edge_update",
            sourceId: "scene_red",
            targetId: "source_score",
            sourcePath: [],
            targetPath: [],
          },
        ],
        actions: [
          {
            __typename: "UpdateAction",
            id: "action_update",
            cueId: "cue_update",
            kind: "update",
            targetSourceId: "source_score",
            params: { fieldPath: [], operation: { kind: "reset" } },
          },
        ],
        shapes: [],
      },
      scene: null,
      canvas: null,
      imageAssets: [],
    });
    expect(session.graph.actions?.[0]).toMatchObject({
      kind: "update",
      target: { sourceId: "source_score", fieldPath: [] },
    });
  });
  it("merges executable Flow-local Transformer configuration into the formula-free graph", () => {
    const session = normalizePlayerSession({
      device: { name: "Audience", perConnection: true },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph: {
        showId: "show_1",
        state: "published",
        updatedAt: "2026-08-22T00:00:00.000Z",
        version: 1,
        nodes: [
          {
            __typename: "FlowNode",
            id: "flow_audience",
            name: "Audience",
            parentId: null,
            position: { x: 0, y: 0 },
            color: null,
            defaultSceneId: null,
          },
          {
            __typename: "TransformerNode",
            id: "transformer_filter",
            name: "Front runners",
            parentId: "flow_audience",
            position: { x: 0, y: 0 },
            ports: [{ id: "port_input", name: "input", rank: "a" }],
            transform: {
              __typename: "FilterTransform",
              kind: "filter",
              filterFormula: "item > 10",
            },
            transformerType: {
              kind: "array",
              shapeId: null,
              of: { kind: "number", shapeId: null, of: null },
            },
          },
        ],
        edges: [],
        shapes: [],
      },
      flow: {
        flowId: "flow_audience",
        defaultSceneId: null,
        scenes: [],
        transformers: [
          {
            __typename: "TransformerNode",
            id: "transformer_filter",
            name: "Front runners",
            parentId: "flow_audience",
            position: { x: 0, y: 0 },
            color: null,
            ports: [
              {
                id: "port_input",
                name: "input",
                rank: "a",
                type: {
                  kind: "array",
                  shapeId: null,
                  of: { kind: "number", shapeId: null, of: null },
                },
              },
            ],
            transform: {
              __typename: "FilterTransform",
              kind: "filter",
              filterFormula: "item > 10",
            },
            type: {
              kind: "array",
              shapeId: null,
              of: { kind: "number", shapeId: null, of: null },
            },
          },
        ],
      },
      scene: null,
      canvas: null,
      imageAssets: [],
    });

    expect(session.graph.nodes[1]).toMatchObject({
      kind: "transformer",
      ports: [{ id: "port_input", name: "input" }],
      transform: { kind: "filter", formula: "item > 10" },
    });
  });

  // #751: a per-connection Device gets no server-materialised Flow-local
  // values (`flowDeviceDrivers` skips `perConnection`), so the Player builds
  // them itself from the Shape's authored Field defaults. The query used to
  // omit `ShapeField.default` entirely, so every required Field silently fell
  // back to a generic type default instead.
  describe("Shape Field defaults", () => {
    const candidateSession = (sourceFieldDefaults: unknown[] = []) =>
      normalizePlayerSession({
        device: { name: "Audience", perConnection: true },
        realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
        graph: {
          showId: "show_1",
          state: "published",
          updatedAt: "2026-08-22T00:00:00.000Z",
          version: 1,
          sourceFieldDefaults,
          nodes: [
            {
              __typename: "FlowNode",
              id: "flow_audience",
              name: "Audience",
              parentId: null,
              position: { x: 0, y: 0 },
              color: null,
              defaultSceneId: null,
            },
            {
              __typename: "SourceNode",
              id: "source_selected",
              name: "Selected",
              parentId: "flow_audience",
              position: { x: 0, y: 0 },
              color: null,
              sourceType: { kind: "shape", shapeId: "candidate", of: null },
            },
          ],
          edges: [],
          shapes: [
            {
              id: "candidate",
              name: "Candidate",
              fields: [
                {
                  id: "field_votes",
                  name: "Votes",
                  position: 1,
                  required: true,
                  default: { __typename: "NumberValue", numberValue: 7 },
                  type: { kind: "number", shapeId: null, of: null },
                },
                {
                  id: "field_name",
                  name: "Name",
                  position: 0,
                  required: true,
                  default: { __typename: "TextValue", textValue: "Unnamed" },
                  type: { kind: "text", shapeId: null, of: null },
                },
                {
                  id: "field_note",
                  name: "Note",
                  position: 2,
                  required: false,
                  default: null,
                  type: { kind: "text", shapeId: null, of: null },
                },
              ],
            },
          ],
        },
        scene: null,
        canvas: null,
        imageAssets: [],
      });

    it("initialises a Flow-local Shape Source from the authored Field defaults", () => {
      const values = defaultSourceValues(candidateSession().graph);

      expect(values.source_selected).toEqual({
        field_name: "Unnamed",
        field_votes: 7,
        field_note: null,
      });
    });

    it("lets an explicit Source-level override win over the Field default", () => {
      const values = defaultSourceValues(
        candidateSession([{ nodeId: "source_selected", fieldPath: ["field_name"], value: null }])
          .graph,
      );

      expect(values.source_selected).toMatchObject({ field_name: null, field_votes: 7 });
    });

    it("orders Shape Fields by position", () => {
      const shape = candidateSession().graph.shapes?.[0];

      expect(shape?.fields.map((field) => field.id)).toEqual([
        "field_name",
        "field_votes",
        "field_note",
      ]);
    });
  });

  // The whole point of #742: the Player's graph is whatever the shared
  // decoder produced, not a second reading of the same document. The only
  // thing this host adds is the Flow bundle's typed Transformer ports, and
  // a session without a Flow adds nothing at all.
  it("hands back exactly what the shared decoder produced", () => {
    const graph = {
      showId: "show_1",
      state: "published",
      updatedAt: "2026-08-22T00:00:00.000Z",
      version: 4,
      nodes: [
        {
          __typename: "SceneNode",
          id: "scene_vote",
          name: "Vote",
          parentId: null,
          position: { x: 0, y: 0 },
          color: null,
          variables: [
            {
              id: "variable_prompt",
              name: "prompt",
              rank: "a",
              defaultValue: "Pick one",
              type: { kind: "text", shapeId: null, of: null },
              suggestedDimensions: null,
            },
          ],
        },
      ],
      edges: [],
      shapes: [],
    };
    const session = normalizePlayerSession({
      device: { name: "Audience", perConnection: true },
      realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
      graph,
      scene: null,
      canvas: null,
      imageAssets: [],
    });

    const decoded = decodeShowGraphDocument(graph);
    expect(session.graph).toEqual(decoded.graph);
    expect(session.graphVersion).toBe(decoded.version);
  });
});
