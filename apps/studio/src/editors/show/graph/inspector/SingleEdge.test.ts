import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GraphInspectorEditing } from "../../commands/use-graph-editing";
import type { GraphEdge, ShowGraph } from "@mechane/domain";
import { SingleEdge } from "./SingleEdge";

const edge: GraphEdge = {
  id: "update-edge",
  kind: "update",
  sourceId: "scene-red",
  targetId: "source-score",
  sourcePath: [],
  targetPath: [],
  cueId: "cue-update",
  actionId: "action-update",
};

const graph: ShowGraph = {
  nodes: [
    {
      id: "scene-red",
      kind: "scene",
      name: "Red",
      position: { x: 0, y: 0 },
      parentId: "flow",
      variables: [],
    },
    {
      id: "source-score",
      kind: "source",
      name: "Score",
      position: { x: 0, y: 0 },
      parentId: null,
      type: "number",
    },
  ],
  edges: [edge],
  actions: [
    {
      id: "action-update",
      cueId: "cue-update",
      kind: "update",
      target: { sourceId: "source-score", fieldPath: [] },
      operation: {
        kind: "set",
        operand: { kind: "literal", value: { kind: "number", value: 1 } },
      },
    },
  ],
};

const editing = {
  graph,
  setUpdateOperation: () => {},
} as unknown as GraphInspectorEditing;

describe("Update edge inspector", () => {
  it("exposes the Update operation selector", () => {
    const html = renderToStaticMarkup(createElement(SingleEdge, { edge, graph, editing }));

    expect(html).toContain("update");
    expect(html).toContain("Set");
    expect(html).toContain('aria-label="Update operation"');
  });
  it("shows the default adjustment amount", () => {
    const adjustedGraph: ShowGraph = {
      ...graph,
      actions: graph.actions?.map((action) =>
        action.kind === "update"
          ? {
              ...action,
              operation: {
                kind: "adjust",
                operand: { kind: "literal", value: { kind: "number", value: 1 } },
              },
            }
          : action,
      ),
    };
    const html = renderToStaticMarkup(
      createElement(SingleEdge, { edge, graph: adjustedGraph, editing }),
    );

    expect(html).toContain('aria-label="Adjustment amount"');
    expect(html).toContain('value="1"');
  });
});
