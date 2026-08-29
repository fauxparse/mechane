import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Block, Canvas, ShowGraph } from "@mechane/domain";

import { usePlayerSession, type PlayerSession } from "../api";
import { PlayerView } from "./PlayerView";

vi.mock("../api", () => ({ usePlayerSession: vi.fn() }));

const mockedUsePlayerSession = vi.mocked(usePlayerSession);

function sessionWithRepeatedCandidate(): PlayerSession {
  const candidateShape = {
    id: "shape_candidate",
    name: "Candidate",
    fields: [
      { id: "field_name", name: "name", type: "text" as const, required: true, defaultValue: "" },
    ],
  };
  const candidateType = { kind: "shape" as const, shapeId: candidateShape.id };
  const candidateArrayType = { kind: "array" as const, of: candidateType };
  const graph: ShowGraph = {
    shapes: [candidateShape],
    sourceFieldDefaults: [
      { nodeId: "source_candidates", fieldPath: [], value: [{ field_name: "Alice" }] },
    ],
    nodes: [
      {
        id: "source_candidates",
        kind: "source",
        name: "Candidates",
        parentId: null,
        position: { x: 0, y: 0 },
        type: candidateArrayType,
      },
      {
        id: "scene_candidates",
        kind: "scene",
        name: "Candidates",
        parentId: null,
        position: { x: 0, y: 0 },
        variables: [{ id: "variable_candidates", name: "Candidates", type: candidateArrayType }],
      },
    ],
    edges: [
      {
        id: "edge_candidates_scene",
        kind: "wiring",
        sourceId: "source_candidates",
        targetId: "scene_candidates",
        sourcePath: [],
        targetPath: ["variable_candidates"],
      },
    ],
    blocks: [],
  };
  const candidateButton: Block = {
    id: "block_candidate_button",
    name: "CandidateButton",
    canvas: {
      id: "canvas_candidate_button",
      kind: "block",
      root: {
        id: "candidate_button_root",
        type: "frame",
        children: [
          {
            id: "candidate_button_name",
            type: "text",
            content: { kind: "variable", variableId: "candidate_button_name" },
          },
        ],
      },
    },
    variables: [{ id: "candidate_button_name", name: "Name", type: "text", required: true }],
    states: [],
  };
  graph.blocks = [candidateButton];
  const canvas: Canvas & { ownerId: string; ownerName: string } = {
    kind: "scene",
    ownerId: "scene_candidates",
    ownerName: "Candidates",
    root: {
      id: "scene_root",
      type: "frame",
      children: [
        {
          id: "candidate_slot",
          type: "slot",
          blockId: candidateButton.id,
          expansion: { source: { kind: "variable", variableId: "variable_candidates" } },
          assignments: [
            {
              variableId: "candidate_button_name",
              source: { kind: "runtimeItem", fieldPath: ["field_name"] },
            },
          ],
        },
      ],
    },
  };
  const scene = graph.nodes.find((node) => node.id === "scene_candidates");
  if (scene?.kind !== "scene") throw new Error("Candidate scene is missing.");
  return {
    device: { id: "device_audience", name: "Audience", perConnection: true },
    run: {
      id: "run_1",
      showId: "show_1",
      status: "active",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      sourceValues: { source_candidates: [{ field_name: "Alice" }] },
    },
    graph: {
      ...graph,
      showId: "show_1",
      state: "published",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
    scene,
    canvas,
    blocks: graph.blocks,
    imageAssets: [],
  };
}

describe("PlayerView", () => {
  it("passes resolved Scene Variables to repeated Slots", () => {
    mockedUsePlayerSession.mockReturnValue({
      status: "ready",
      session: sessionWithRepeatedCandidate(),
    });

    const html = renderToStaticMarkup(createElement(PlayerView, { code: "ABCDE" }));

    expect(html).toContain("Alice");
  });
});
