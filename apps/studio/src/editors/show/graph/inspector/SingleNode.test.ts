import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GraphInspectorEditing } from "../../commands/use-graph-editing";
import type { FlowNode, SceneNode, ShowGraph } from "@mechane/domain";
import { SingleNode } from "./SingleNode";

const flow: FlowNode = {
  id: "flow_counter",
  kind: "flow",
  name: "Counter Flow",
  position: { x: 0, y: 0 },
  parentId: null,
  defaultSceneId: "scene_counter",
};

const scene: SceneNode = {
  id: "scene_counter",
  kind: "scene",
  name: "Counter",
  position: { x: 0, y: 0 },
  parentId: flow.id,
  variables: [],
};

const graph: ShowGraph = { nodes: [flow, scene], edges: [] };

const editing = {
  graph,
  setFlowDefaultScene: () => {},
} as unknown as GraphInspectorEditing;

describe("Flow inspector", () => {
  it("exposes the Flow entry Scene selector", () => {
    const html = renderToStaticMarkup(createElement(SingleNode, { node: flow, editing }));

    expect(html).toContain("Entry Scene");
    expect(html).toContain("The Scene shown when this Flow starts on a Device.");
    expect(html).toContain("Counter");
    expect(html).toContain('aria-label="Entry Scene"');
  });
});
