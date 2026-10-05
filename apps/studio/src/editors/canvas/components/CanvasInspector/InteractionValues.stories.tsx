import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorProvider } from "@mechane/design-system";
import type { ShowGraph } from "@mechane/domain/graph";
import { useState } from "react";
import type { CanvasArtboardDocument } from "../../../../api/canvas";
import { passCueValueCommand } from "../../commands/cue-value-binding";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { InteractionValues } from "./InteractionValues";
import { useCanvasInspectorModel } from "./use-canvas-inspector-model";

const focused: CanvasArtboardDocument = {
  artId: "button",
  canvasId: "button-canvas",
  kind: "block",
  name: "Candidate button",
  position: { x: 0, y: 0 },
  canvas: { kind: "block", root: { id: "button-root", type: "frame" } },
};
const scene: CanvasArtboardDocument = {
  artId: "scene",
  canvasId: "scene-canvas",
  kind: "scene",
  name: "Candidates",
  position: { x: 0, y: 0 },
  canvas: {
    kind: "scene",
    root: {
      id: "scene-root",
      type: "frame",
      children: [
        {
          id: "slot",
          type: "slot",
          blockId: "button",
          expansion: { source: { kind: "variable", variableId: "candidates" } },
        },
      ],
    },
  },
};
const initialGraph: ShowGraph = {
  nodes: [
    {
      id: "scene",
      name: "Candidates",
      kind: "scene",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [
        {
          id: "candidates",
          name: "Candidates",
          type: { kind: "array", of: { kind: "shape", shapeId: "candidate" } },
        },
      ],
    },
  ],
  edges: [],
  shapes: [
    {
      id: "candidate",
      name: "Candidate",
      fields: [{ id: "name", name: "Name", type: "text", required: true, defaultValue: null }],
    },
  ],
  cues: [
    {
      id: "selected",
      name: "Selected",
      owner: { kind: "block", blockId: "button" },
      actionIds: [],
    },
    { id: "vote", name: "Vote", owner: { kind: "scene", sceneId: "scene" }, actionIds: [] },
  ],
  eventBindings: [
    {
      id: "tap",
      canvasId: "button-canvas",
      elementId: "button-root",
      cueId: "selected",
      eventKind: "tap",
      position: 0,
    },
  ],
  slotEventBindings: [
    {
      id: "relay",
      slotElementId: "slot",
      sourceCueId: "selected",
      targetCueId: "vote",
      parameterMappings: [],
      position: 0,
    },
  ],
};
function ValuesStory() {
  const [graph, setGraph] = useState(initialGraph);
  const model = useCanvasInspectorModel({
    focused,
    artboards: [focused, scene],
    graph,
    cues: graph.cues,
    selection: { artId: "button", elementIds: ["button-root"] },
    shapes: graph.shapes,
    onPassCueValue: (bindingId, value, parameterId) =>
      setGraph(
        (current) =>
          passCueValueCommand(current, bindingId, value, parameterId).apply(current).state,
      ),
  });
  const binding = graph.eventBindings?.[0];
  return (
    <InspectorProvider>
      {model && binding && (
        <CanvasInspectorProvider value={model}>
          <div className="w-80 p-3">
            <InteractionValues binding={binding} />
          </div>
        </CanvasInspectorProvider>
      )}
    </InspectorProvider>
  );
}
const meta = {
  title: "studio/Editors/Canvas/Components/CanvasInspector/InteractionValues",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentItem: Story = { render: () => <ValuesStory /> };
