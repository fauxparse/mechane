import {
  assertValidCanvas,
  assertValidShowGraph,
  defaultSourceValues,
  resolveCanvasProperties,
  sceneVariableValues,
} from "@mechane/domain";
import type { Element } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import {
  AUDIENCE_VARIABLE_IDS,
  CANDIDATE_SHAPE_ID,
  CANDIDATE_SOURCE_IDS,
  SEED_CANVASES,
  seedCanvasPosition,
  seedBlockCanvasPosition,
  SEED_GRAPHS,
  TALLY_VARIABLE_IDS,
  votingCanvases,
  votingGraph,
  workflowBlocks,
} from "./seed-graphs";

describe("Voting demo seed", () => {
  it("builds the requested valid graph", () => {
    const graph = votingGraph();
    expect(() => assertValidShowGraph(graph)).not.toThrow();
    expect(graph.shapes?.map((shape) => shape.id)).toEqual([CANDIDATE_SHAPE_ID]);
    expect(graph.nodes.filter((node) => node.kind === "source").map((node) => node.id)).toEqual([
      ...CANDIDATE_SOURCE_IDS,
    ]);
    const tally = graph.nodes.find((node) => node.kind === "scene" && node.name === "Vote tally");
    const audience = graph.nodes.find(
      (node) => node.kind === "scene" && node.name === "Choose a candidate",
    );
    expect(tally?.kind).toBe("scene");
    expect(audience?.kind).toBe("scene");
    if (tally?.kind !== "scene" || audience?.kind !== "scene")
      throw new Error("Seed Scenes are missing.");
    expect(tally.variables.map((variable) => variable.id)).toEqual([...TALLY_VARIABLE_IDS]);
    expect(audience.variables.map((variable) => variable.id)).toEqual([...AUDIENCE_VARIABLE_IDS]);
    expect(graph.nodes.filter((node) => node.kind === "device").map((node) => node.name)).toEqual([
      "Projector",
      "Audience",
    ]);
    const audienceFlow = graph.nodes.find(
      (node) => node.kind === "flow" && node.name === "Audience",
    );
    expect(audienceFlow?.kind).toBe("flow");
    expect(audience?.parentId).toBe(audienceFlow?.id);
    expect(audience?.position).toEqual({ x: 24, y: 74 });
  });

  it("builds valid tally and audience Canvases", () => {
    const canvases = votingCanvases();
    expect(Object.keys(canvases)).toHaveLength(2);
    for (const canvas of Object.values(canvases))
      expect(() => assertValidCanvas(canvas)).not.toThrow();
    expect(canvases.scene_vote_tally?.root.children).toHaveLength(7);
    expect(canvases.scene_audience_vote?.root.children).toHaveLength(6);
    expect(
      canvases.scene_vote_tally?.root.children
        ?.filter((child) => child.type === "slot")
        .map((child) => child.type === "slot" && child.blockId),
    ).toEqual(["block_card", "block_card", "block_card"]);
    expect(
      canvases.scene_audience_vote?.root.children
        ?.filter((child) => child.type === "slot")
        .map((child) => child.type === "slot" && child.blockId),
    ).toEqual(["block_nested", "block_repeated"]);
  });
  it("resolves seeded Candidate field bindings from Source defaults", () => {
    const graph = votingGraph();
    const canvases = votingCanvases();
    const tally = graph.nodes.find((node) => node.kind === "scene" && node.name === "Vote tally");
    if (tally?.kind !== "scene") throw new Error("Vote tally Scene is missing.");
    const values = sceneVariableValues(graph, tally.id, defaultSourceValues(graph));
    const resolved = resolveCanvasProperties(canvases.scene_vote_tally!, {
      graph,
      variables: tally.variables,
      shapes: graph.shapes,
      values,
    });
    const firstRow = resolved.root.children?.[1];
    expect(firstRow).toMatchObject({
      children: [{ content: "Alice" }, { content: "12" }],
    });
  });

  it("builds complete deterministic Block workflow fixtures", () => {
    const blocks = workflowBlocks();
    const card = blocks.find((block) => block.id === "block_card");
    const nested = blocks.find((block) => block.id === "block_nested");
    const repeated = blocks.find((block) => block.id === "block_repeated");
    expect(card?.states.map((state) => state.name)).toEqual(["Default", "Selected"]);
    expect(card?.stateSelectorVariableId).toBe("block_card_selector");
    const nestedSlot = nested?.canvas.root.children?.[0];
    expect(nestedSlot).toMatchObject({ type: "slot", blockId: "block_card" });
    expect(
      nestedSlot?.type === "slot" ? nestedSlot.assignments?.map((item) => item.variableId) : [],
    ).toEqual(expect.arrayContaining(["block_card_name", "block_card_count"]));
    expect(repeated?.variables[0]?.type).toEqual({
      kind: "array",
      of: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
    });
    expect(repeated?.canvas.root.children?.[0]).toMatchObject({
      expansion: { source: { kind: "variable", variableId: "block_repeated_items" } },
    });
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

  it("lays seeded Scene Canvases out in a non-overlapping row", () => {
    expect(seedCanvasPosition(0)).toEqual({ x: 0, y: 0 });
    expect(seedCanvasPosition(1)).toEqual({ x: 800, y: 0 });
    expect(seedBlockCanvasPosition(0)).toEqual({ x: 0, y: 900 });
    expect(seedBlockCanvasPosition(1)).toEqual({ x: 420, y: 900 });
  });

  it("registers only the Voting demo seed builders", () => {
    expect(Object.keys(SEED_GRAPHS)).toEqual(["Voting demo"]);
    expect(Object.keys(SEED_CANVASES)).toEqual(["Voting demo"]);
  });
});
