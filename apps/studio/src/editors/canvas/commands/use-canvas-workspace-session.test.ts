import { commandForEdit } from "@mechane/commands";
import type { GraphEdit } from "@mechane/commands";
import type { Block } from "@mechane/domain/blocks";
import type { ShowGraph } from "@mechane/domain/graph";
import { generateId } from "@mechane/domain/id";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import type { CanvasWorkspaceSession } from "../canvas-workspace-types";
import { useCanvasWorkspaceSession } from "./use-canvas-workspace-session";

const fixtures = vi.hoisted(() => {
  const graph: ShowGraph = { nodes: [], edges: [] };
  const documents: CanvasArtboardDocument[] = [];
  return {
    graph,
    documents,
    enqueue: vi.fn<(edits: readonly GraphEdit[]) => void>(),
  };
});

vi.mock("../../../api/canvas", () => ({
  useCanvasWorkspace: () => ({ data: fixtures.documents }),
}));
vi.mock("../../../api/images", () => ({
  useImageAssets: () => ({ data: [] }),
  useImageUpload: () => ({}),
}));
vi.mock("../../../api/show-graph", () => ({
  useShowGraph: () => ({ data: { version: 1 } }),
  useShowGraphEdits: () => ({ enqueue: fixtures.enqueue }),
}));
vi.mock("../../show/data/use-opened-graph", () => ({
  useOpenedShowGraph: () => ({ graph: fixtures.graph }),
}));

const block: Block = {
  id: "block-card",
  name: "Card",
  canvas: {
    id: "canvas-card",
    kind: "block",
    root: { id: "card-root", type: "frame", children: [] },
  },
  variables: [],
  states: [],
  stateSelectorVariableId: null,
};

function openSession(): CanvasWorkspaceSession {
  let session: CanvasWorkspaceSession | undefined;
  function Probe() {
    session = useCanvasWorkspaceSession({
      showId: generateId("show"),
      requestedArtId: block.id,
      focusArtboard: () => {},
      focusCue: () => {},
    }).session;
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  if (!session) throw new Error("Canvas session was not rendered.");
  return session;
}

function savedGraph(): ShowGraph {
  return fixtures.enqueue.mock.calls
    .flatMap(([edits]) => edits)
    .reduce((graph, edit) => commandForEdit(edit).apply(graph).state, fixtures.graph);
}

beforeEach(() => {
  fixtures.enqueue.mockClear();
  fixtures.graph = {
    nodes: [
      {
        id: "scene-main",
        kind: "scene",
        name: "Main",
        parentId: null,
        position: { x: 0, y: 0 },
        variables: [],
      },
    ],
    edges: [],
    blocks: [block],
  };
  fixtures.documents = [
    {
      canvasId: block.canvas.id,
      artId: block.id,
      kind: "block",
      name: block.name,
      canvas: block.canvas,
      position: { x: 0, y: 0 },
    },
  ];
});

describe("Canvas Artboard rename", () => {
  it("renames a Block stored outside the Show graph nodes and saves the edit", () => {
    openSession().canvas.renameArtboard?.(block.id, "Renamed card");

    expect(savedGraph().blocks?.find(({ id }) => id === block.id)?.name).toBe("Renamed card");
    expect(savedGraph().nodes).toEqual(fixtures.graph.nodes);
  });

  it("continues to rename Scene nodes without changing Blocks", () => {
    openSession().canvas.renameArtboard?.("scene-main", "Renamed scene");

    expect(savedGraph().nodes.find(({ id }) => id === "scene-main")?.name).toBe("Renamed scene");
    expect(savedGraph().blocks).toEqual(fixtures.graph.blocks);
  });
});
