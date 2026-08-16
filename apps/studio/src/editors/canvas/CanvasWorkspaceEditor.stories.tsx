import { applyCanvasEdits, CANVAS_COMMAND_TYPES } from "@mechane/commands";
import type { ElementProperties } from "@mechane/commands";
import type { CanvasArtboardDocument } from "../../api/canvas";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { CanvasWorkspaceEditor } from "./CanvasWorkspaceEditor";
import { MockEditorChrome } from "../../components/EditorLayout/MockEditorChrome";

const root = (id: string, fill: string, width = 680, height = 440) => ({
  id: `${id}-root`,
  type: "frame" as const,
  layoutMode: "absolute" as const,
  sizing: {
    width: { mode: "fixed" as const, value: width },
    height: { mode: "fixed" as const, value: height },
  },
  fill,
  children: [
    {
      id: `${id}-title`,
      type: "text" as const,
      content: id,
      rank: "a",
      sizing: {
        width: { mode: "hug" as const },
        height: { mode: "hug" as const },
      },
      anchor: { horizontal: "left" as const, vertical: "top" as const, offsetX: 24, offsetY: 24 },
    },
  ],
});
const nestedAutoRoot = (id: string) => ({
  id: `${id}-root`,
  type: "frame" as const,
  layoutMode: "auto" as const,
  direction: "vertical" as const,
  gap: 16,
  padding: 20,
  fill: "#e2e8f0",
  sizing: {
    width: { mode: "fixed" as const, value: 620 },
    height: { mode: "fixed" as const, value: 380 },
  },
  children: [
    {
      id: `${id}-header`,
      type: "frame" as const,
      layoutMode: "auto" as const,
      direction: "horizontal" as const,
      gap: 8,
      padding: 12,
      sizing: {
        width: { mode: "fill" as const },
        height: { mode: "hug" as const },
      },
      fill: "#cbd5e1",
      children: [
        {
          id: `${id}-label`,
          type: "text" as const,
          content: "Nested",
          sizing: {
            width: { mode: "hug" as const },
            height: { mode: "hug" as const },
          },
        },
        {
          id: `${id}-status`,
          type: "rect" as const,
          sizing: {
            width: { mode: "fixed" as const, value: 72 },
            height: { mode: "fixed" as const, value: 24 },
          },
          fill: "#94a3b8",
        },
      ],
    },
    {
      id: `${id}-body`,
      type: "frame" as const,
      layoutMode: "absolute" as const,
      sizing: {
        width: { mode: "fill" as const },
        height: { mode: "fill" as const },
      },
      fill: "#f8fafc",
      children: [
        {
          id: `${id}-copy`,
          type: "text" as const,
          content: "Absolute child inside auto layout",
          sizing: {
            width: { mode: "hug" as const },
            height: { mode: "hug" as const },
          },
          anchor: { horizontal: "center" as const, vertical: "center" as const },
        },
      ],
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
      sizing: {
        width: { mode: "fixed", value: 680 },
        height: { mode: "fixed", value: 440 },
      },
      fill: "#e2e8f0",
      children: [
        {
          id: "reparent-source",
          type: "rect",
          rank: "a",
          sizing: {
            width: { mode: "fixed", value: 120 },
            height: { mode: "fixed", value: 72 },
          },
          fill: "#2563eb",
          anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 32 },
        },
        {
          id: "reparent-target",
          type: "frame",
          rank: "b",
          layoutMode: "auto",
          sizing: {
            width: { mode: "fixed", value: 360 },
            height: { mode: "fixed", value: 280 },
          },
          fill: "#fef3c7",
          anchor: { horizontal: "left", vertical: "top", offsetX: 250, offsetY: 100 },
          children: [],
        },
      ],
    },
  },
  position: { x: 64, y: 96 },
};

/** Uncontrolled selection, so clicking, banding, and layer drags can all be exercised for real. */
function StatefulSelectionReview() {
  const [artboard, setArtboard] = useState(reparentReviewArtboard);
  return (
    <CanvasWorkspaceEditor
      artboards={[artboard]}
      focusedArtId={artboard.artId}
      onFocusArtboard={noOp}
      onBeginMoveArtboard={noOp}
      onMoveArtboard={noOp}
      onEndMoveArtboard={noOp}
      onMoveElement={(canvasId, elementId, parentId, rank, properties, unsetProperties) => {
        if (canvasId !== artboard.canvasId) return;
        setArtboard((current) => ({
          ...current,
          canvas: applyCanvasEdits(current.canvas, [
            { type: CANVAS_COMMAND_TYPES.reparentElement, elementId, parentId, rank },
            ...(Object.keys(properties ?? {}).length > 0 || (unsetProperties ?? []).length > 0
              ? [
                  {
                    type: CANVAS_COMMAND_TYPES.updateElement,
                    elementId,
                    properties: (properties ?? {}) as ElementProperties,
                    unsetProperties: unsetProperties ?? [],
                  },
                ]
              : []),
          ]),
        }));
      }}
      onUpdateElement={(canvasId, elementId, properties, unsetProperties) => {
        if (canvasId !== artboard.canvasId) return;
        setArtboard((current) => ({
          ...current,
          canvas: applyCanvasEdits(current.canvas, [
            {
              type: CANVAS_COMMAND_TYPES.updateElement,
              elementId,
              properties: properties as ElementProperties,
              unsetProperties: unsetProperties ?? [],
            },
          ]),
        }));
      }}
    />
  );
}

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
const reviewArtboards: CanvasArtboardDocument[] = [
  ...artboards,
  {
    canvasId: "canvas-scene-nested",
    artId: "scene-nested",
    kind: "scene",
    name: "Nested Auto",
    canvas: { kind: "scene", root: nestedAutoRoot("Nested") },
    position: { x: 80, y: 680 },
  },
];

const noOp = () => {};
const meta: Meta<typeof CanvasWorkspaceEditor> = {
  title: "studio/CanvasWorkspaceEditor",
  component: CanvasWorkspaceEditor,
  parameters: { layout: "fullscreen" },
  // The editor contributes its Layers panel, Properties panel and toolbar to the
  // Editor Chrome's slots, so it needs Chrome around it to render them at all.
  // `sidebarsOpen` on a story's parameters sets the starting state.
  decorators: [
    (Story, context) => (
      <MockEditorChrome
        activeEditor="canvas"
        sidebarsOpen={(context.parameters.sidebarsOpen as boolean | undefined) ?? true}
      >
        <Story />
      </MockEditorChrome>
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
/** The Layers navigator as a tree: nested Frames, disclosure, icons, and drag targets (#222). */
export const LayersNestedTree: Story = {
  args: {
    artboards: [reparentReviewArtboard, ...artboards],
    focusedArtId: "reparent-review",
    selectedArtId: "reparent-review",
    selectedElementIds: ["reparent-source"],
    onUpdateElement: noOp,
    onMoveElement: noOp,
  },
};

export const LayersSearchAndNestedTree: Story = {
  args: {
    selectedArtId: "scene-lobby",
    selectedElementIds: ["Lobby-title"],
    onUpdateElement: noOp,
  },
};
export const InspectorControls: Story = {
  args: {
    selectedArtId: "scene-lobby",
    selectedElementIds: ["Lobby-title"],
    onUpdateElement: noOp,
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

export const SidebarsCollapsed: Story = {
  parameters: { sidebarsOpen: false },
};
export const StatefulReparentReviewStory: Story = {
  render: () => <StatefulReparentReview />,
};

export const SelectionAndLayerDragReview: Story = {
  render: () => <StatefulSelectionReview />,
};

export const NarrowMainPanel: Story = {
  // Below the `md` breakpoint the sidebars are not rendered at all, so the
  // Editable Area is the whole viewport.
  parameters: { viewport: { defaultViewport: "mobile1" } },
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

export const CrossCuttingReviewMatrix: Story = {
  args: {
    artboards: reviewArtboards,
    focusedArtId: "scene-nested",
    selectedArtId: "scene-nested",
    selectedElementIds: ["Nested-copy"],
    onCreateElement: noOp,
    onMoveElement: noOp,
    onUpdateElement: noOp,
  },
};

export const NestedAutoLayoutAndAbsoluteChildren: Story = {
  args: {
    artboards: [reviewArtboards[2]!],
    focusedArtId: "scene-nested",
  },
};

export const ManyReviewArtboards: Story = {
  args: {
    artboards: Array.from({ length: 16 }, (_, index) => {
      const template = reviewArtboards[index % reviewArtboards.length]!;
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
