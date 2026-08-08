import type { CanvasArtboardDocument } from "../../api/canvas";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { CanvasWorkspaceEditor } from "./CanvasWorkspaceEditor";

const root = (id: string, fill: string) => ({
  id: `${id}-root`,
  type: "frame" as const,
  layoutMode: "absolute" as const,
  width: { mode: "fixed" as const, value: 680 },
  height: { mode: "fixed" as const, value: 440 },
  fill,
  children: [
    {
      id: `${id}-title`,
      type: "text" as const,
      content: id,
      rank: "a",
      position: { x: 24, y: 24 },
    },
  ],
});

const artboards: CanvasArtboardDocument[] = [
  {
    canvasId: "canvas-scene-lobby",
    artId: "scene-lobby",
    kind: "scene",
    name: "Lobby",
    canvas: { root: root("Lobby", "#e2e8f0") },
    position: { x: 64, y: 96 },
  },
  {
    canvasId: "canvas-block-card",
    artId: "block-card",
    kind: "block",
    name: "Card",
    canvas: { root: root("Card", "#fef3c7") },
    position: { x: 860, y: 220 },
  },
];

const meta: Meta<typeof CanvasWorkspaceEditor> = {
  title: "studio/CanvasWorkspaceEditor",
  component: CanvasWorkspaceEditor,
  parameters: { layout: "fullscreen" },
  args: {
    artboards,
    focusedArtId: "scene-lobby",
    onFocusArtboard: () => {},
    onBack: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof CanvasWorkspaceEditor>;

export const EmptyWorkspace: Story = {
  args: { artboards: [], focusedArtId: null },
};

export const MixedSceneAndBlockWorkspace: Story = {};

export const FocusedBlockDeepLink: Story = {
  args: { focusedArtId: "block-card" },
};

export const OverlappingArtboards: Story = {
  args: {
    artboards: artboards.map((artboard, index) => ({
      ...artboard,
      position: { x: 160 + index * 240, y: 140 + index * 80 },
    })),
  },
};
