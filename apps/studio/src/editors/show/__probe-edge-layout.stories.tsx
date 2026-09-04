// THROWAWAY — diagnostic probe only, not committed.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { MockEditorChrome } from "../../components/EditorLayout/MockEditorChrome";
import { ShowGraphEditor } from "./ShowGraphEditor";
import { SAMPLE_GRAPH } from "./data/sample-graph";
import type { GraphEdit } from "@mechane/commands";

const meta: Meta = {
  title: "studio/__probe/EdgeLayoutPayload",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

const storyQueryClient = new QueryClient();

function Probe({ graph }: { graph: typeof SAMPLE_GRAPH }) {
  const [log, setLog] = useState<GraphEdit[]>([]);
  return (
    <div className="flex h-full w-full flex-col">
      <pre
        id="probe-log"
        data-testid="probe-log"
        style={{
          maxHeight: "30%",
          overflow: "auto",
          background: "#111",
          color: "#0f0",
          padding: 8,
          fontSize: 11,
          margin: 0,
        }}
      >
        {JSON.stringify(
          log.filter((edit) => edit.type === "graph.setEdgeLayout"),
          null,
          2,
        )}
      </pre>
      <div className="flex-1">
        <ShowGraphEditor graph={graph} onEdit={(edits) => setLog((current) => [...current, ...edits])} />
      </div>
    </div>
  );
}

export const Capture: Story = {
  render: () => (
    <QueryClientProvider client={storyQueryClient}>
      <MockEditorChrome>
        <Probe graph={SAMPLE_GRAPH} />
      </MockEditorChrome>
    </QueryClientProvider>
  ),
};

// Two Scenes, close together, wired by a Navigate edge, with a third Scene
// sized and positioned to sit directly on top of the whole route between
// them — no exposed pixel of the edge anywhere.
const COVERED_GRAPH = {
  nodes: [
    {
      __typename: "SceneNode",
      id: "scene_a",
      name: "A",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [],
      fieldDefaults: [],
    },
    {
      __typename: "SceneNode",
      id: "scene_b",
      name: "B",
      parentId: null,
      position: { x: 400, y: 0 },
      variables: [],
      fieldDefaults: [],
    },
    {
      __typename: "SceneNode",
      id: "scene_cover",
      name: "Cover",
      parentId: null,
      position: { x: 180, y: 0 },
      variables: [],
      fieldDefaults: [],
    },
  ],
  edges: [
    {
      __typename: "NavigateEdge",
      id: "edge_covered",
      sourceId: "scene_a",
      targetId: "scene_b",
      sourcePath: [],
      targetPath: [],
      cueId: null,
      actionId: null,
    },
  ],
} as unknown as typeof SAMPLE_GRAPH;

export const CoveredEdge: Story = {
  render: () => (
    <QueryClientProvider client={storyQueryClient}>
      <MockEditorChrome>
        <Probe graph={COVERED_GRAPH} />
      </MockEditorChrome>
    </QueryClientProvider>
  ),
};
