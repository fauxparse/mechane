import { assertValidCanvas, assertValidShowGraph } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import {
  AUDIENCE_VARIABLE_IDS,
  CANDIDATE_SHAPE_ID,
  CANDIDATE_SOURCE_IDS,
  SEED_CANVASES,
  SEED_GRAPHS,
  TALLY_VARIABLE_IDS,
  votingCanvases,
  votingGraph,
} from "./seed-graphs";

describe("Voting demo seed", () => {
  it("builds the requested valid graph", () => {
    const graph = votingGraph();
    expect(() => assertValidShowGraph(graph)).not.toThrow();
    expect(graph.shapes?.map((shape) => shape.id)).toEqual([CANDIDATE_SHAPE_ID]);
    expect(graph.nodes.filter((node) => node.kind === "source").map((node) => node.id)).toEqual(
      [...CANDIDATE_SOURCE_IDS],
    );
    const tally = graph.nodes.find((node) => node.kind === "scene" && node.name === "Vote tally");
    const audience = graph.nodes.find((node) => node.kind === "scene" && node.name === "Choose a candidate");
    expect(tally?.kind).toBe("scene");
    expect(audience?.kind).toBe("scene");
    if (tally?.kind !== "scene" || audience?.kind !== "scene") throw new Error("Seed Scenes are missing.");
    expect(tally.variables.map((variable) => variable.id)).toEqual([...TALLY_VARIABLE_IDS]);
    expect(audience.variables.map((variable) => variable.id)).toEqual([...AUDIENCE_VARIABLE_IDS]);
    expect(graph.nodes.filter((node) => node.kind === "device").map((node) => node.name)).toEqual(["Projector", "Audience"]);
    const audienceFlow = graph.nodes.find((node) => node.kind === "flow" && node.name === "Audience");
    expect(audienceFlow?.kind).toBe("flow");
    expect(audience?.parentId).toBe(audienceFlow?.id);
    expect(audience?.position).toEqual({ x: 24, y: 74 });
  });

  it("builds valid tally and audience Canvases", () => {
    const canvases = votingCanvases();
    expect(Object.keys(canvases)).toHaveLength(2);
    for (const canvas of Object.values(canvases)) expect(() => assertValidCanvas(canvas)).not.toThrow();
    expect(canvases.scene_vote_tally?.root.children).toHaveLength(4);
    expect(canvases.scene_audience_vote?.root.children).toHaveLength(4);
  });

  it("registers only the Voting demo seed builders", () => {
    expect(Object.keys(SEED_GRAPHS)).toEqual(["Voting demo"]);
    expect(Object.keys(SEED_CANVASES)).toEqual(["Voting demo"]);
  });
});
