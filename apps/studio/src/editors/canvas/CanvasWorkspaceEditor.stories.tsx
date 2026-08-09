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
  decorators: [
    (Story) => (
      <div className="h-screen w-screen">
        <Story />
      </div>
    ),
  ],
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
export const SelectedElementAndConstantChrome: Story = {
  args: {
    selectedArtId: "scene-lobby",
    selectedElementIds: ["Lobby-title"],
  },
};

export const SelectionReviewAtZoom: Story = {
  args: {
    initialCamera: { x: -140, y: -60, zoom: 2 },
    selectedArtId: "scene-lobby",
    selectedElementIds: ["Lobby-title"],
  },
};
export const StatefulCreationTools: Story = {
  args: {
    onCreateElement: (canvasId, element, parentId, rank) =>
      console.info("create canvas element", { canvasId, element, parentId, rank }),
  },
};

export const CreationToolCancellation: Story = {
  args: {
    onCreateElement: noOp,
  },
};
export const DragAcrossLayoutParents: Story = {
  args: {
    onMoveElement: (canvasId, elementId, parentId, rank) =>
      console.info("move canvas element", { canvasId, elementId, parentId, rank }),
  },
};

export const InvalidDragTargets: Story = {
  args: { onMoveElement: noOp },
};

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

export const LayersCollapsed: Story = {
  args: { initialLayersOpen: false },
};

export const InspectorCollapsed: Story = {
  args: { initialInspectorOpen: false },
};

export const BothSidebarsCollapsed: Story = {
  args: { initialLayersOpen: false, initialInspectorOpen: false },
};

export const NarrowMainPanel: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  args: { initialLayersOpen: true, initialInspectorOpen: true },
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
