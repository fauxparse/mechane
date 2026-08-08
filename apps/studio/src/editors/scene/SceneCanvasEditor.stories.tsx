import type { Meta, StoryObj } from "@storybook/react-vite";

import type { Canvas } from "@mechane/domain";

import { SceneCanvasEditor } from "./SceneCanvasEditor";

const canvas: Canvas & { id: string } = {
  id: "canvas:storybook",
  kind: "scene",
  root: {
    id: "element:root",
    type: "frame",
    layoutMode: "absolute",
    width: { mode: "fixed", value: 720 },
    height: { mode: "fixed", value: 480 },
    fill: "#0f172a",
    children: [
      {
        id: "element:title",
        type: "text",
        rank: "a",
        content: "Select an Element",
        fontSize: 28,
        color: "#f8fafc",
        anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 28 },
      },
      {
        id: "element:card",
        type: "rect",
        rank: "b",
        width: { mode: "fixed", value: 260 },
        height: { mode: "fixed", value: 150 },
        fill: "#334155",
        cornerRadius: 12,
        anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 100 },
      },
    ],
  },
};

const meta = {
  title: "studio/SceneCanvasEditor",
  component: SceneCanvasEditor,
  parameters: { layout: "fullscreen" },
  args: { canvas, onBack: () => undefined },
} satisfies Meta<typeof SceneCanvasEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
