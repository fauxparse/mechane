import type { GraphEditing } from "../../commands/use-graph-editing";
import type { Shape, SourceNode, ShowGraph } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { SourceValues } from "./SourceValues";

const shape: Shape = {
  id: "shape-profile",
  name: "Profile",
  fields: [
    { id: "headline", name: "Headline", type: "text", required: true, defaultValue: "Welcome" },
    { id: "score", name: "Score", type: "number", required: true, defaultValue: 7 },
    {
      id: "details",
      name: "Details",
      type: { kind: "object" },
      required: true,
      defaultValue: { city: "London", active: true },
    },
  ],
};

const source: SourceNode = {
  id: "source-profile",
  kind: "source",
  name: "Profile source",
  position: { x: 0, y: 0 },
  parentId: null,
  type: { kind: "shape", shapeId: shape.id },
};

const initialGraph: ShowGraph = {
  shapes: [shape],
  nodes: [source],
  edges: [],
};

const meta = {
  title: "studio/SourceValues",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SourceValuesStory() {
  const [graph, setGraph] = useState(initialGraph);
  const editing = {
    graph,
    commands: {
      beginGesture: () => ({
        update: (command: { apply: (current: ShowGraph) => { state: ShowGraph } }) => {
          setGraph((current) => command.apply(current).state);
        },
        commit: () => {},
        abort: () => {},
      }),
    },
  } as unknown as GraphEditing;

  return <SourceValues node={source} editing={editing} />;
}

export const Default: Story = {
  render: () => <SourceValuesStory />,
};
