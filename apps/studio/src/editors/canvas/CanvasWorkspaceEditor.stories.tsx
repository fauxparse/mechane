import type { CanvasArtboardDocument } from "../../api/canvas";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { CanvasWorkspaceEditor } from "./CanvasWorkspaceEditor";

const root = (id: string, fill: string, width = 680, height = 440) => ({
  id: `${id}-root`,
  type: "frame" as const,
  layoutMode: "absolute" as const,
  width: { mode: "fixed" as const, value: width },
  height: { mode: "fixed" as const, value: height },
  fill,
  children: [
    {
      id: `${id}-title`,
      type: "text" as const,
      content: id,
      rank: "a",
      width: { mode: "hug" as const },
      height: { mode: "hug" as const },
      anchor: { horizontal: "left" as const, vertical: "top" as const, offsetX: 24, offsetY: 24 },
    },
  ],
});

const artboards: CanvasArtboardDocument[] = [
  {
    canvasId: "canvas-scene-lobby",
    artId: "scene-lobby",
    kind: "scene",
    name: "Lobby",
    canvas: { kind: "scene", root: root("Lobby", "#e2e8f0") },
    position: { x: 64, y: 96 },
  },
  {
    canvasId: "canvas-block-card",
    artId: "block-card",
    kind: "block",
    name: "Card",
    canvas: { kind: "block", root: root("Card", "#fef3c7", 420, 260) },
    position: { x: 860, y: 220 },
  },
];

const noOp = () => {};
const meta: Meta<typeof CanvasWorkspaceEditor> = {
  title: "studio/CanvasWorkspaceEditor",
  component: CanvasWorkspaceEditor,
  parameters: { layout: "fullscreen" },
  args: {
    artboards,
    focusedArtId: "scene-lobby",
    onFocusArtboard: noOp,
    onBeginMoveArtboard: noOp,
    onMoveArtboard: noOp,
    onEndMoveArtboard: noOp,
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

export const ZoomedOutWorkspace: Story = {
  args: { initialCamera: { x: 180, y: 120, zoom: 0.35 } },
};

export const ZoomedInWorkspace: Story = {
  args: { initialCamera: { x: -220, y: -120, zoom: 1.75 } },
};

export const ManyArtboards: Story = {
  args: {
    artboards: Array.from({ length: 12 }, (_, index) => {
      const template = artboards[index % artboards.length]!;
      return {
        ...template,
        artId: `${template.artId}-${index}`,
        canvasId: `${template.canvasId}-${index}`,
        name: `${template.name} ${index + 1}`,
        position: { x: (index % 4) * 760 + 32, y: Math.floor(index / 4) * 520 + 32 },
      };
    }),
    focusedArtId: "scene-lobby-0",
  },
};
