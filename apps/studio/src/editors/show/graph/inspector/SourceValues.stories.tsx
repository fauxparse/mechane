import { setSourceFieldDefault as setSourceFieldDefaultCommand } from "@mechane/commands";
import { Sidebar, SidebarContent, SidebarProvider } from "@mechane/design-system";
import { type Shape, type ShowGraph, type SourceNode } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { SourceValueEditing } from "../../commands/use-graph-editing";
import { SourceValues } from "./SourceValues";
import type { SourceImageAsset } from "./source-value-types";

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
    {
      id: "image",
      name: "Image",
      type: "image",
      required: false,
      defaultValue: null,
    },
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
const imageAssets = [
  {
    assetId: "story-image",
    revision: "revision-1",
    url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Crect width='160' height='90' fill='%2331758f'/%3E%3Ccircle cx='112' cy='30' r='18' fill='%23f6c177'/%3E%3C/svg%3E",
    width: 160,
    height: 90,
    name: "stage-lights.png",
    alt: "Stage lights",
    mimeType: "image/svg+xml",
    blurHash: null,
  },
] satisfies SourceImageAsset[];

const source: SourceNode = {
  id: "source-profile",
  kind: "source",
  name: "Profile source",
  position: { x: 0, y: 0 },
  parentId: null,
  type: { kind: "array", of: { kind: "shape", shapeId: shape.id } },
};

const initialGraph: ShowGraph = {
  shapes: [detailsShape, shape],
  nodes: [source],
  edges: [],
  sourceFieldDefaults: [
    {
      nodeId: source.id,
      fieldPath: [],
      value: [
        {
          headline: "Welcome",
          image: { assetId: "story-image", revision: "revision-1" },
          score: 7,
          details: { city: "London", active: true },
        },
        {
          headline: "Tonight",
          image: { assetId: "story-image", revision: "revision-1" },
          score: 9,
          details: { city: "Berlin", active: false },
        },
        {
          headline: "Encore",
          image: { assetId: "story-image", revision: "revision-1" },
          score: 4,
          details: { city: "Oslo", active: true },
        },
      ],
    },
  ],
};

const meta = {
  title: "studio/Editors/Show/Graph/Inspector/SourceValues",
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
  } as unknown as SourceValueEditing;

  return (
    <SidebarProvider className="min-h-screen w-full bg-background">
      <div className="min-h-screen flex-1 bg-background" />
      <Sidebar collapsible="offcanvas" side="right" variant="floating" aria-label="Source values">
        <SidebarContent className="p-0">
          <SourceValues node={source} editing={editing} imageAssets={imageAssets} />
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

export const Default: Story = { render: SourceValuesStory };
