import type { Meta, StoryObj } from "@storybook/react-vite";

import { CanvasRenderer } from "./canvas-renderer";
import type { Canvas } from "@mechane/domain";

const canvas: Canvas = {
  kind: "scene",
  root: {
    id: "scene-root",
    type: "frame",
    layoutMode: "absolute",
    fill: "#191724",
    children: [
      {
        id: "title",
        type: "text",
        rank: "a",
        content: "A shared Canvas renderer",
        color: "#f6f1f4",
        fontSize: 28,
        width: { mode: "fixed", value: { value: 360, unit: "px" } },
        height: { mode: "hug" },
        anchor: { horizontal: "center", vertical: "top", offsetY: 32 },
      },
      {
        id: "auto-frame",
        type: "frame",
        rank: "b",
        layoutMode: "auto",
        direction: "horizontal",
        gap: 16,
        padding: 16,
        alignPrimary: "center",
        alignCounter: "center",
        width: { mode: "fixed", value: { value: 540, unit: "px" } },
        height: { mode: "fixed", value: { value: 180, unit: "px" } },
        anchor: { horizontal: "center", vertical: "center" },
        fill: {
          type: "linear",
          angle: 90,
          stops: [
            { color: "#eb6f92", position: 0 },
            { color: "#c4a7e7", position: 0.5 },
            { color: "#9ccfd8", position: 1 },
          ],
        },
        children: [
          {
            id: "card-one",
            type: "rect",
            rank: "a",
            width: { mode: "fixed", value: 120 },
            height: { mode: "fixed", value: 100 },
            cornerRadius: 12,
            fill: "#26233a",
          },
          {
            id: "card-two",
            type: "frame",
            rank: "b",
            layoutMode: "absolute",
            width: { mode: "fixed", value: 120 },
            height: { mode: "fixed", value: 100 },
            padding: 8,
            fill: {
              type: "radial",
              stops: [
                { color: "#31748f", position: 0 },
                { color: "#26233a", position: 1 },
              ],
            },
            children: [
              {
                id: "rotated-copy",
                type: "text",
                content: "90°",
                color: "#f6f1f4",
                fontSize: 24,
                rotation: 90,
                width: { mode: "hug" },
                height: { mode: "hug" },
                anchor: { horizontal: "center", vertical: "center" },
              },
            ],
          },
        ],
      },
    ],
  },
};

const meta: Meta<typeof CanvasRenderer> = {
  title: "design-system/CanvasRenderer",
  component: CanvasRenderer,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof CanvasRenderer>;

export const MixedLayout: Story = {
  args: {
    canvas,
    style: { width: 640, height: 360, background: "#191724" },
  },
};
