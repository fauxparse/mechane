import {
  assertValidCanvas,
  assertValidShowGraph,
  defaultSourceValues,
  isShapeCollectionInstance,
  resolveSlotInstances,
  sceneVariableValues,
} from "@mechane/domain";
import type { Element } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import {
  AUDIENCE_VARIABLE_ID,
  CANDIDATE_BUTTON_VARIABLE_ID,
  CANDIDATE_IMAGE_FIELD_ID,
  CANDIDATE_IMAGE_REVISION,
  CANDIDATE_LIST_SCENE_ID,
  CANDIDATE_NAME_FIELD_ID,
  CANDIDATE_SHAPE_ID,
  CANDIDATE_SOURCE_ID,
  CANDIDATE_VOTES_FIELD_ID,
  CANDIDATES,
  CONFIRMATION_SCENE_ID,
  SEED_CANVASES,
  seedBlockCanvasPosition,
  seedCanvasPosition,
  SEED_GRAPHS,
  TALLY_ROW_VARIABLE_ID,
  TALLY_SCENE_ID,
  TALLY_VARIABLE_ID,
  THANK_YOU_SCENE_ID,
  votingCanvases,
  votingGraph,
  workflowBlocks,
} from "./seed-graphs";

describe("Voting seed", () => {
  it("builds the requested valid graph", () => {
    const graph = votingGraph();
    expect(() => assertValidShowGraph(graph)).not.toThrow();
    expect(graph.shapes?.map((shape) => shape.id)).toEqual([CANDIDATE_SHAPE_ID]);
    expect(graph.shapes?.[0]?.fields.map((field) => field.name)).toEqual([
      "name",
      "votes",
      "image",
    ]);

    const sources = graph.nodes.filter((node) => node.kind === "source");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: CANDIDATE_SOURCE_ID,
      name: "Candidates",
      type: { kind: "array", of: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID } },
    });

    const sourceDefault = graph.sourceFieldDefaults?.[0];
    expect(sourceDefault?.nodeId).toBe(CANDIDATE_SOURCE_ID);
    expect(sourceDefault?.fieldPath).toEqual([]);
    expect(sourceDefault?.value).toEqual(
      CANDIDATES.map((candidate) => ({
        [CANDIDATE_NAME_FIELD_ID]: candidate.name,
        [CANDIDATE_VOTES_FIELD_ID]: 0,
        [CANDIDATE_IMAGE_FIELD_ID]: {
          assetId: candidate.imageAssetId,
          revision: CANDIDATE_IMAGE_REVISION,
        },
      })),
    );

    const scenes = graph.nodes.filter((node) => node.kind === "scene");
    expect(scenes.map((scene) => scene.name)).toEqual([
      "Projector tally",
      "Candidate list",
      "Confirmation screen",
      "Thank you screen",
    ]);
    expect(graph.nodes.find((node) => node.id === TALLY_SCENE_ID)).toMatchObject({
      variables: [{ id: TALLY_VARIABLE_ID, type: { kind: "array" } }],
    });
    expect(graph.nodes.find((node) => node.id === CANDIDATE_LIST_SCENE_ID)).toMatchObject({
      variables: [{ id: AUDIENCE_VARIABLE_ID, type: { kind: "array" } }],
    });

    expect(graph.edges.filter((edge) => edge.kind === "navigate")).toEqual([
      expect.objectContaining({
        sourceId: CANDIDATE_LIST_SCENE_ID,
        targetId: CONFIRMATION_SCENE_ID,
      }),
      expect.objectContaining({
        sourceId: CONFIRMATION_SCENE_ID,
        targetId: CANDIDATE_LIST_SCENE_ID,
      }),
      expect.objectContaining({ sourceId: CONFIRMATION_SCENE_ID, targetId: THANK_YOU_SCENE_ID }),
    ]);
    expect(graph.nodes.filter((node) => node.kind === "device")).toEqual([
      expect.objectContaining({ name: "Projector", perConnection: false }),
      expect.objectContaining({ name: "Audience", perConnection: true }),
    ]);
  });

  it("materializes one array source with zero votes", () => {
    const values = defaultSourceValues(votingGraph())[CANDIDATE_SOURCE_ID];
    expect(Array.isArray(values)).toBe(true);
    if (!Array.isArray(values))
      throw new Error("Candidate source did not materialize as an array.");
    expect(values).toHaveLength(3);
    const votes = values.map((item) => {
      if (!isShapeCollectionInstance(item))
        throw new Error("Candidate source item is not normalized.");
      const value = item.value;
      if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new Error("Candidate source item has no shape value.");
      if (!(CANDIDATE_VOTES_FIELD_ID in value))
        throw new Error("Candidate source item has no vote field.");
      return value[CANDIDATE_VOTES_FIELD_ID];
    });
    expect(votes).toEqual([0, 0, 0]);
  });

  it("builds valid canvases at the requested viewport dimensions", () => {
    const canvases = votingCanvases();
    expect(Object.keys(canvases)).toHaveLength(4);
    for (const canvas of Object.values(canvases))
      expect(() => assertValidCanvas(canvas)).not.toThrow();
    expect(canvases[CANDIDATE_LIST_SCENE_ID]?.root.sizing).toMatchObject({
      width: { mode: "fixed", value: 360 },
      height: { mode: "fixed", value: 720 },
    });
    expect(canvases[CONFIRMATION_SCENE_ID]?.root.sizing).toMatchObject({
      width: { mode: "fixed", value: 360 },
      height: { mode: "fixed", value: 720 },
    });
    expect(canvases[TALLY_SCENE_ID]?.root.sizing).toMatchObject({
      width: { mode: "fixed", value: 1920 },
      height: { mode: "fixed", value: 1080 },
    });
  });

  it("repeats CandidateButton and TallyRow over the candidate array", () => {
    const canvases = votingCanvases();
    const candidateListSlot = canvases[CANDIDATE_LIST_SCENE_ID]?.root.children?.[1];
    const tallySlot = canvases[TALLY_SCENE_ID]?.root.children?.[1];
    expect(candidateListSlot).toMatchObject({
      type: "slot",
      blockId: "block_candidate_button",
      expansion: { source: { kind: "variable", variableId: AUDIENCE_VARIABLE_ID } },
      assignments: [{ variableId: CANDIDATE_BUTTON_VARIABLE_ID, source: { kind: "runtimeItem" } }],
    });
    expect(tallySlot).toMatchObject({
      type: "slot",
      blockId: "block_tally_row",
      expansion: { source: { kind: "variable", variableId: TALLY_VARIABLE_ID } },
      assignments: [{ variableId: TALLY_ROW_VARIABLE_ID, source: { kind: "runtimeItem" } }],
    });
  });

  it("resolves the candidate list from the array source", () => {
    const graph = votingGraph();
    const canvases = votingCanvases();
    const candidateList = graph.nodes.find((node) => node.id === CANDIDATE_LIST_SCENE_ID);
    if (candidateList?.kind !== "scene") throw new Error("Candidate list scene is missing.");
    const candidatesVariable = candidateList.variables[0];
    if (!candidatesVariable?.type) throw new Error("Candidate list variable type is missing.");
    const values = sceneVariableValues(graph, candidateList.id, defaultSourceValues(graph));
    const slot = canvases[CANDIDATE_LIST_SCENE_ID]?.root.children?.[1];
    if (slot?.type !== "slot") throw new Error("Candidate list slot is missing.");
    const candidateButton = workflowBlocks().find((block) => block.id === "block_candidate_button");
    if (!candidateButton) throw new Error("CandidateButton block is missing.");
    const result = resolveSlotInstances(
      candidateButton,
      slot,
      [
        {
          id: AUDIENCE_VARIABLE_ID,
          type: candidatesVariable.type,
          value: values[AUDIENCE_VARIABLE_ID],
        },
      ],
      undefined,
      { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
      graph.shapes,
      workflowBlocks(),
    );
    expect(result.instances).toHaveLength(3);
  });

  it("resolves Candidate images inside repeated CandidateButtons", () => {
    const graph = votingGraph();
    const canvases = votingCanvases();
    const candidateList = graph.nodes.find((node) => node.id === CANDIDATE_LIST_SCENE_ID);
    if (candidateList?.kind !== "scene") throw new Error("Candidate list scene is missing.");
    const candidatesVariable = candidateList.variables[0];
    if (!candidatesVariable?.type) throw new Error("Candidate list variable type is missing.");
    const slot = canvases[CANDIDATE_LIST_SCENE_ID]?.root.children?.[1];
    if (slot?.type !== "slot") throw new Error("Candidate list slot is missing.");
    const candidateButton = workflowBlocks().find((block) => block.id === "block_candidate_button");
    if (!candidateButton) throw new Error("CandidateButton block is missing.");
    const values = sceneVariableValues(graph, candidateList.id, defaultSourceValues(graph));
    const result = resolveSlotInstances(
      candidateButton,
      slot,
      [
        {
          id: AUDIENCE_VARIABLE_ID,
          type: candidatesVariable.type,
          value: values[AUDIENCE_VARIABLE_ID],
        },
      ],
      undefined,
      { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
      graph.shapes,
      workflowBlocks(),
      [
        {
          assetId: "image_asset_alice",
          revision: CANDIDATE_IMAGE_REVISION,
          url: "/alice.png",
          width: 128,
          height: 128,
          alt: "Alice",
          mimeType: "image/png",
          blurHash: null,
        },
      ],
    );
    const first = result.instances[0];
    if (!first?.canvas) throw new Error("CandidateButton instance has no canvas.");
    expect(first.canvas.root.children?.[0]).toMatchObject({
      type: "image",
      image: { url: "/alice.png" },
    });
  });

  it("passes Candidate shapes into reusable Blocks", () => {
    const [candidateButton, tallyRow] = workflowBlocks();
    expect(candidateButton?.variables).toEqual([
      {
        id: CANDIDATE_BUTTON_VARIABLE_ID,
        name: "Candidate",
        type: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
        required: true,
      },
    ]);
    expect(candidateButton?.canvas.root).toMatchObject({
      direction: "horizontal",
      sizing: {
        width: { mode: "fixed", value: 296 },
        height: { mode: "hug" },
      },
    });
    expect(tallyRow?.variables).toEqual([
      {
        id: TALLY_ROW_VARIABLE_ID,
        name: "Candidate",
        type: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
        required: true,
      },
    ]);
    expect(candidateButton?.canvas.root.children?.[0]).toMatchObject({
      type: "image",
      image: {
        kind: "variable",
        variableId: CANDIDATE_BUTTON_VARIABLE_ID,
        fieldPath: [CANDIDATE_IMAGE_FIELD_ID],
      },
    });
    expect(candidateButton?.canvas.root.children?.[1]).toMatchObject({
      content: {
        kind: "variable",
        variableId: CANDIDATE_BUTTON_VARIABLE_ID,
        fieldPath: [CANDIDATE_NAME_FIELD_ID],
      },
    });
    expect(tallyRow?.canvas.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: {
            kind: "variable",
            variableId: TALLY_ROW_VARIABLE_ID,
            fieldPath: [CANDIDATE_NAME_FIELD_ID],
          },
        }),
        expect.objectContaining({
          content: {
            kind: "variable",
            variableId: TALLY_ROW_VARIABLE_ID,
            fieldPath: [CANDIDATE_VOTES_FIELD_ID],
          },
        }),
      ]),
    );
  });

  it("assigns persisted ranks to every Block sibling", () => {
    const visit = (element: Element): void => {
      const children = element.children ?? [];
      const ranks = children.map((child) => child.rank);
      expect(ranks.every((rank) => rank !== undefined && rank !== "")).toBe(true);
      expect(new Set(ranks).size).toBe(ranks.length);
      children.forEach(visit);
    };
    workflowBlocks().forEach((block) => visit(block.canvas.root));
  });

  it("lays seeded canvases out in a non-overlapping row", () => {
    expect(seedCanvasPosition(0)).toEqual({ x: 0, y: 0 });
    expect(seedCanvasPosition(1)).toEqual({ x: 800, y: 0 });
    expect(seedBlockCanvasPosition(0)).toEqual({ x: 0, y: 900 });
    expect(seedBlockCanvasPosition(1)).toEqual({ x: 420, y: 900 });
  });

  it("registers only the Voting seed builders", () => {
    expect(Object.keys(SEED_GRAPHS)).toEqual(["Voting"]);
    expect(Object.keys(SEED_CANVASES)).toEqual(["Voting"]);
  });
});
