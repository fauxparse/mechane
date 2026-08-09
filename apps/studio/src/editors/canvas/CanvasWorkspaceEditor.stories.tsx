import { applyCanvasEdits, CANVAS_COMMAND_TYPES } from "@mechane/commands";
import type { ElementProperties } from "@mechane/commands";
import type { CanvasArtboardDocument } from "../../api/canvas";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

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
const reparentReviewArtboard: CanvasArtboardDocument = {
  canvasId: "canvas-reparent-review",
  artId: "reparent-review",
  kind: "scene",
  name: "Reparent review",
  canvas: {
    kind: "scene",
    root: {
      id: "reparent-root",
      type: "frame",
      layoutMode: "absolute",
      width: { mode: "fixed", value: 680 },
      height: { mode: "fixed", value: 440 },
      fill: "#e2e8f0",
      children: [
        {
          id: "reparent-source",
          type: "rect",
          rank: "a",
          width: { mode: "fixed", value: 120 },
          height: { mode: "fixed", value: 72 },
          fill: "#2563eb",
          anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 32 },
        },
        {
          id: "reparent-target",
          type: "frame",
          rank: "b",
          layoutMode: "auto",
          width: { mode: "fixed", value: 360 },
          height: { mode: "fixed", value: 280 },
          fill: "#fef3c7",
          anchor: { horizontal: "left", vertical: "top", offsetX: 250, offsetY: 100 },
          children: [],
        },
      ],
    },
  },
  position: { x: 64, y: 96 },
};

function StatefulReparentReview() {
  const [artboard, setArtboard] = useState(reparentReviewArtboard);
  const updateCanvas = (
    canvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties: Record<string, unknown> = {},
    unsetProperties: readonly string[] = [],
  ) => {
    if (canvasId !== artboard.canvasId) return;
    const edits = [
      { type: CANVAS_COMMAND_TYPES.reparentElement, elementId, parentId, rank },
      ...(Object.keys(properties).length > 0 || unsetProperties.length > 0
        ? [
            {
              type: CANVAS_COMMAND_TYPES.updateElement,
              elementId,
              properties: properties as ElementProperties,
              unsetProperties,
            },
          ]
        : []),
    ];
    setArtboard((current) => ({
      ...current,
      canvas: applyCanvasEdits(current.canvas, edits),
    }));
  };

  return (
    <CanvasWorkspaceEditor
      artboards={[artboard]}
      focusedArtId={artboard.artId}
      onFocusArtboard={noOp}
      onBeginMoveArtboard={noOp}
      onMoveArtboard={noOp}
      onEndMoveArtboard={noOp}
      onMoveElement={updateCanvas}
    />
  );
}

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
export const KeyboardNudgeAndReorder: Story = {
  args: {
    selectedArtId: "scene-lobby",
    selectedElementIds: ["Lobby-title"],
    onUpdateElement: noOp,
    onMoveElement: noOp,
  },
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
export const StatefulReparentReviewStory: Story = {
  render: () => <StatefulReparentReview />,
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
