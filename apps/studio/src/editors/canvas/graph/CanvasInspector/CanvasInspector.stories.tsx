import { applyCanvasEdits, CANVAS_COMMAND_TYPES } from "@mechane/commands";
import type { CanvasEdit } from "@mechane/commands";
import { hasCornerRadius } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useState } from "react";

import type { CanvasArtboardDocument as ApiCanvasArtboardDocument } from "../../../../api/canvas";
import { MockEditorChrome } from "../../../../components/EditorLayout/MockEditorChrome";
import type { CanvasSelection } from "../canvas-selection";
import { CanvasInspector } from "../CanvasInspector/CanvasInspector";
import { EditorSlot } from "../../../../components/EditorLayout/editor-slots";

const CANVAS_ID = "canvas-inspector-story";
const ART_ID = "scene-inspector-story";

const variables: SceneVariable[] = [
  { id: "opacity-variable", name: "Opacity / Default", type: "number" },
  { id: "accent-variable", name: "Color / Accent", type: "color" },
  { id: "copy-variable", name: "Copy / Headline", type: "text" },
];

const variable = (variableId: string) => ({ kind: "variable" as const, variableId });

function artboard(
  root: FrameElement,
  kind: ApiCanvasArtboardDocument["kind"] = "scene",
): ApiCanvasArtboardDocument {
  return {
    canvasId: CANVAS_ID,
    artId: ART_ID,
    kind,
    name: kind === "scene" ? "Inspector review" : "Block review",
    canvas: { kind, root },
    position: { x: 0, y: 0 },
  };
}

const absoluteRoot: FrameElement = {
  id: "absolute-root",
  type: "frame",
  name: "Absolute root",
  layoutMode: "absolute",
  width: { mode: "fixed", value: 720 },
  height: { mode: "fixed", value: 480 },
  cornerRadius: 24,
  children: [
    {
      id: "headline",
      type: "text",
      name: "Headline",
      rank: "a",
      content: "Canvas Inspector",
      color: "#f8fafc",
      fontSize: 32,
      width: { mode: "hug" },
      height: { mode: "hug" },
      anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 28 },
    },
    {
      id: "card",
      type: "rect",
      name: "Card",
      rank: "b",
      opacity: 0.72,
      fill: "#38bdf8",
      cornerRadius: 12,
      width: { mode: "fixed", value: 280 },
      height: { mode: "fixed", value: 160 },
      anchor: { horizontal: "left", vertical: "top", offsetX: 32, offsetY: 120 },
    },
  ],
};
const asymmetricRadiusRoot: FrameElement = {
  ...absoluteRoot,
  id: "asymmetric-radius-root",
  name: "Asymmetric corner radius",
  children: absoluteRoot.children?.map((child) =>
    child.id === "card" && hasCornerRadius(child)
      ? {
          ...child,
          cornerRadius: { topLeft: 8, topRight: 12, bottomRight: 16, bottomLeft: 20 },
        }
      : child,
  ),
};

const connectedRoot: FrameElement = {
  id: "connected-root",
  type: "frame",
  name: "Connected root",
  layoutMode: "auto",
  direction: "vertical",
  gap: 16,
  width: { mode: "fixed", value: 640 },
  height: { mode: "fixed", value: 360 },
  fill: "#0f172a",
  children: [
    {
      id: "connected-card",
      type: "rect",
      name: "Connected card",
      rank: "a",
      opacity: variable("opacity-variable"),
      fill: variable("accent-variable"),
      width: { mode: "fill" },
      height: { mode: "fixed", value: 120 },
      cornerRadius: 16,
    },
    {
      id: "connected-copy",
      type: "text",
      name: "Connected copy",
      rank: "b",
      content: variable("copy-variable"),
      color: "#e2e8f0",
      width: { mode: "fill" },
      height: { mode: "hug" },
    },
  ],
};
const autoGapRoot: FrameElement = {
  ...connectedRoot,
  id: "auto-gap-root",
  name: "Auto gap",
  gap: "auto",
};
const paddingRoot: FrameElement = {
  ...connectedRoot,
  id: "padding-root",
  name: "Padding",
  padding: 16,
};
const asymmetricPaddingRoot: FrameElement = {
  ...connectedRoot,
  id: "asymmetric-padding-root",
  name: "Asymmetric padding",
  padding: { top: 8, right: 16, bottom: 12, left: 24 },
};

const multiSelectionRoot: FrameElement = {
  id: "multi-root",
  type: "frame",
  name: "Multi-selection root",
  layoutMode: "absolute",
  width: { mode: "fixed", value: 640 },
  height: { mode: "fixed", value: 360 },
  fill: "#334155",
  children: [
    {
      id: "multi-one",
      type: "rect",
      name: "First card",
      rank: "a",
      opacity: 0.5,
      fill: "#f8fafc",
      width: { mode: "fixed", value: 120 },
      height: { mode: "fixed", value: 80 },
      anchor: { horizontal: "left", vertical: "top", offsetX: 24, offsetY: 24 },
    },
    {
      id: "multi-two",
      type: "rect",
      name: "Second card",
      rank: "b",
      opacity: 0.5,
      fill: "#f8fafc",
      width: { mode: "fixed", value: 120 },
      height: { mode: "fixed", value: 80 },
      anchor: { horizontal: "left", vertical: "top", offsetX: 180, offsetY: 24 },
    },
  ],
};

function applyUpdates(
  current: ApiCanvasArtboardDocument,
  updates: readonly {
    readonly elementId: string;
    readonly properties: Record<string, unknown>;
    readonly unsetProperties?: readonly string[];
  }[],
): ApiCanvasArtboardDocument {
  const edits: CanvasEdit[] = updates.map((update) => ({
    type: CANVAS_COMMAND_TYPES.updateElement,
    elementId: update.elementId,
    properties: update.properties,
    unsetProperties: update.unsetProperties,
  }));
  return { ...current, canvas: applyCanvasEdits(current.canvas, edits) };
}

function InspectorStory({
  initialArtboard,
  initialSelection,
  storyVariables = [],
}: {
  initialArtboard: ApiCanvasArtboardDocument;
  initialSelection: CanvasSelection;
  storyVariables?: readonly SceneVariable[];
}) {
  const [current, setCurrent] = useState(initialArtboard);
  const onUpdateElements = useCallback(
    (
      _canvasId: string,
      updates: readonly {
        readonly elementId: string;
        readonly properties: Record<string, unknown>;
        readonly unsetProperties?: readonly string[];
      }[],
    ) => setCurrent((previous) => applyUpdates(previous, updates)),
    [],
  );

  return (
    <MockEditorChrome activeEditor="canvas">
      <div className="size-full bg-background" />
      <EditorSlot name="right">
        <CanvasInspector
          focused={current}
          selection={initialSelection}
          variables={storyVariables}
          onUpdateElements={onUpdateElements}
        />
      </EditorSlot>
    </MockEditorChrome>
  );
}

const meta: Meta<typeof CanvasInspector> = {
  title: "studio/CanvasInspector",
  component: CanvasInspector,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof CanvasInspector>;

export const EmptySelection: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(absoluteRoot)}
      initialSelection={{ artId: null, elementIds: [] }}
    />
  ),
};

export const CanvasRoot: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(absoluteRoot)}
      initialSelection={{ artId: ART_ID, elementIds: [] }}
    />
  ),
};
export const CanvasBlockRoot: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(absoluteRoot, "block")}
      initialSelection={{ artId: ART_ID, elementIds: [] }}
    />
  ),
};

export const TextElement: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(absoluteRoot)}
      initialSelection={{ artId: ART_ID, elementIds: ["headline"] }}
    />
  ),
};

export const AbsoluteRectangle: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(absoluteRoot)}
      initialSelection={{ artId: ART_ID, elementIds: ["card"] }}
    />
  ),
};

export const AsymmetricCornerRadius: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(asymmetricRadiusRoot)}
      initialSelection={{ artId: ART_ID, elementIds: ["card"] }}
    />
  ),
};

export const ConnectedProperties: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(connectedRoot)}
      initialSelection={{ artId: ART_ID, elementIds: ["connected-card"] }}
      storyVariables={variables}
    />
  ),
};

export const AutoGap: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(autoGapRoot)}
      initialSelection={{ artId: ART_ID, elementIds: [] }}
    />
  ),
};

export const NumericGap: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(connectedRoot)}
      initialSelection={{ artId: ART_ID, elementIds: [] }}
    />
  ),
};
export const Padding: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(paddingRoot)}
      initialSelection={{ artId: ART_ID, elementIds: [] }}
    />
  ),
};

export const AsymmetricPadding: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(asymmetricPaddingRoot)}
      initialSelection={{ artId: ART_ID, elementIds: [] }}
    />
  ),
};
export const MultiSelection: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(multiSelectionRoot)}
      initialSelection={{ artId: ART_ID, elementIds: ["multi-one", "multi-two"] }}
    />
  ),
};

export const InteractiveUpdates: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(connectedRoot)}
      initialSelection={{ artId: ART_ID, elementIds: ["connected-copy"] }}
      storyVariables={variables}
    />
  ),
};

export const UnsetOpacityDefaultsTo100Percent: Story = {
  render: () => (
    <InspectorStory
      initialArtboard={artboard(absoluteRoot)}
      initialSelection={{ artId: ART_ID, elementIds: ["headline"] }}
    />
  ),
};
