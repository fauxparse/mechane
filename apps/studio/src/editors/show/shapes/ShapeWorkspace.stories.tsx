import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ShowGraph, Shape } from "@mechane/domain";

import { ShapeWorkspace } from "./ShapeWorkspace";
import type { ShapeEditing } from "../commands/use-graph-editing";

const SHAPES: Shape[] = [
  {
    id: "shape_vote",
    name: "Vote",
    fields: [
      {
        id: "field_prompt",
        name: "prompt",
        type: "text",
        required: true,
        defaultValue: "Choose one",
      },
      { id: "field_count", name: "count", type: "number", required: true, defaultValue: 0 },
    ],
  },
  {
    id: "shape_attendee",
    name: "Attendee",
    fields: [{ id: "field_name", name: "name", type: "text", required: true, defaultValue: "" }],
  },
];

const GRAPH: ShowGraph = { shapes: SHAPES, nodes: [], edges: [] };

function noop(): void {}

const editing = {
  graph: GRAPH,
  addShape: noop,
  renameShape: noop,
  duplicateShape: noop,
  removeShape: noop,
  addShapeField: noop,
  renameShapeField: noop,
  setShapeFieldType: noop,
  setShapeFieldRequired: noop,
  setShapeFieldDefault: noop,
  reorderShapeFields: noop,
  removeShapeField: noop,
} as unknown as ShapeEditing;

const meta = {
  title: "studio/ShapeWorkspace",
  component: ShapeWorkspace,
  parameters: { layout: "fullscreen" },
  args: {
    graph: GRAPH,
    shapeId: null,
    editing,
    saving: false,
    saveError: null,
    retrySave: noop,
    runActive: false,
    onOpenShape: noop,
    onBack: noop,
  },
} satisfies Meta<typeof ShapeWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { graph: { shapes: [], nodes: [], edges: [] } },
};

export const Collection: Story = {};

export const Editor: Story = {
  args: { shapeId: "shape_vote" },
};

export const SaveFailed: Story = {
  args: { shapeId: "shape_vote", saveError: new Error("The draft server is unavailable.") },
};

export const ActiveRun: Story = {
  args: { shapeId: "shape_vote", runActive: true },
};
