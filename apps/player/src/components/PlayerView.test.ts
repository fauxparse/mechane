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
      {
        id: "field_name",
        name: "name",
        type: "text" as const,
        required: true,
        defaultValue: "",
      },
      {
        id: "field_votes",
        name: "votes",
        type: "number" as const,
        required: true,
        defaultValue: 0,
      },
    ],
  };
  const candidateType = { kind: "shape" as const, shapeId: candidateShape.id };
  const candidateArrayType = { kind: "array" as const, of: candidateType };
  const graph: ShowGraph = {
    shapes: [candidateShape],
    sourceFieldDefaults: [
      {
        nodeId: "source_candidates",
        fieldPath: [],
        value: [
          { field_name: "Alice", field_votes: 0 },
          { field_name: "Beatrix", field_votes: 0 },
          { field_name: "Clarissa", field_votes: 0 },
        ],
      },
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
  const tallyRow: Block = {
    id: "block_tally_row",
    name: "TallyRow",
    canvas: {
      id: "canvas_tally_row",
      kind: "block",
      root: {
        id: "tally_row_root",
        type: "frame",
        children: [
          {
            id: "tally_row_name",
            type: "text",
            content: {
              kind: "variable",
              variableId: "tally_row_candidate",
              fieldPath: ["field_name"],
            },
          },
          {
            id: "tally_row_votes",
            type: "text",
            content: {
              kind: "variable",
              variableId: "tally_row_candidate",
              fieldPath: ["field_votes"],
            },
          },
        ],
      },
    },
    variables: [
      {
        id: "tally_row_candidate",
        name: "Candidate",
        type: candidateType,
        required: true,
      },
    ],
    states: [],
  };
  graph.blocks = [candidateButton, tallyRow];
  const canvas: Canvas & { id: string; ownerId: string; ownerName: string } = {
    id: "canvas_scene_candidates",
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
        {
          id: "tally_slot",
          type: "slot",
          blockId: tallyRow.id,
          expansion: { source: { kind: "variable", variableId: "variable_candidates" } },
          assignments: [
            {
              variableId: "tally_row_candidate",
              source: { kind: "runtimeItem" },
            },
          ],
        },
      ],
    },
  };
  const scene = graph.nodes.find((node) => node.id === "scene_candidates");
  if (scene?.kind !== "scene") throw new Error("Candidate scene is missing.");
  return {
    device: { name: "Audience", perConnection: true },
    realtime: { channel: "player:test", grant: "grant", expiresAt: "2026-01-01T00:01:00.000Z" },
    run: {
      id: "run_1",
      showId: "show_1",
      status: "active",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: null,
      sourceValues: {
        source_candidates: [
          { field_name: "Alice", field_votes: 0 },
          { field_name: "Beatrix", field_votes: 0 },
          { field_name: "Clarissa", field_votes: 0 },
        ],
      },
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
  it("renders one TallyRow for each candidate", () => {
    mockedUsePlayerSession.mockReturnValue({
      status: "ready",
      session: sessionWithRepeatedCandidate(),
    });

    const html = renderToStaticMarkup(createElement(PlayerView, { code: "ABCDE" }));

    expect(html.match(/data-element-id="tally_row_root"/g) ?? []).toHaveLength(3);
    expect(html).toContain("Alice");
    expect(html).toContain("Beatrix");
    expect(html).toContain("Clarissa");
  });
});
