import { setSourceFieldDefault as setSourceFieldDefaultCommand } from "@mechane/commands";
import { Sidebar, SidebarContent, SidebarProvider } from "@mechane/design-system";
import { type Shape, type ShowGraph, type SourceNode } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { GraphEditing } from "../../commands/use-graph-editing";
import { SourceValues } from "./SourceValues";

const detailsShape: Shape = {
  id: "shape-details",
  name: "Details",
  fields: [
    { id: "city", name: "City", type: "text", required: true, defaultValue: "London" },
    { id: "active", name: "Active", type: "boolean", required: true, defaultValue: true },
  ],
};

const shape: Shape = {
  id: "shape-profile",
  name: "Profile",
  fields: [
    { id: "headline", name: "Headline", type: "text", required: true, defaultValue: "Welcome" },
    { id: "score", name: "Score", type: "number", required: true, defaultValue: 7 },
    {
      id: "details",
      name: "Details",
      type: { kind: "shape", shapeId: detailsShape.id },
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
  shapes: [detailsShape, shape],
  nodes: [source],
  edges: [],
};

const meta = {
  title: "studio/SourceValues",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function SourceValuesStory() {
  const [graph, setGraph] = useState(initialGraph);
  const updateGraph = (command: { apply(current: ShowGraph): { state: ShowGraph } }) => {
    setGraph((current) => command.apply(current).state);
  };
  const editing = {
    graph,
    setSourceFieldDefault: (nodeId: string, fieldPath: readonly string[], value: unknown) =>
      updateGraph(setSourceFieldDefaultCommand(nodeId, fieldPath, value)),
    commands: {
      beginGesture: () => ({
        update: updateGraph,
        commit: () => {},
        abort: () => {},
      }),
    },
  } as unknown as GraphEditing;

  return (
    <SidebarProvider className="min-h-screen w-full bg-background">
      <div className="min-h-screen flex-1 bg-background" />
      <Sidebar collapsible="offcanvas" side="right" variant="floating" aria-label="Source values">
        <SidebarContent className="p-0">
          <SourceValues node={source} editing={editing} />
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

export const Default: Story = { render: SourceValuesStory };
