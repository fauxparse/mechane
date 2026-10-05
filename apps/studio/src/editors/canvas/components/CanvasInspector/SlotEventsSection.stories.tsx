import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  InspectorProvider,
  Sidebar,
  SidebarContent,
  SidebarProvider,
} from "@mechane/design-system";
import { removeSlotEventBinding, setSlotEventBinding } from "@mechane/commands";
import type { ShowGraph } from "@mechane/domain/graph";
import type { Cue, SlotEventBinding } from "@mechane/domain/interactions";
import { useState } from "react";
import type { CanvasArtboardDocument } from "../../../../api/canvas";
import { slotCueBindingCommand } from "../../commands/slot-cue-binding";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { InteractionSection } from "./InteractionSection";
import { SlotEventsSection } from "./SlotEventsSection";
import { useCanvasInspectorModel } from "./use-canvas-inspector-model";

const sceneId = "scene_candidate_list";
const slotId = "candidate-list-slot";
const candidateType = { kind: "shape", shapeId: "candidate" } as const;
const source: Cue = {
  id: "selected",
  name: "Selected",
  owner: { kind: "block", blockId: "button" },
  actionIds: [],
  parameters: [{ id: "candidate", name: "Candidate", type: candidateType, position: 0 }],
};
const target: Cue = {
  id: "choose",
  name: "Choose candidate",
  owner: { kind: "scene", sceneId },
  actionIds: [],
  parameters: [{ id: "selection", name: "Candidate", type: candidateType, position: 0 }],
};
const savedBinding: SlotEventBinding = {
  id: "selected-link",
  slotElementId: slotId,
  sourceCueId: source.id,
  targetCueId: target.id,
  position: 0,
  parameterMappings: [{ sourceParameterId: "candidate", targetParameterId: "selection" }],
};
const focused: CanvasArtboardDocument = {
  canvasId: "scene-canvas",
  artId: sceneId,
  kind: "scene",
  name: "Candidate list",
  position: { x: 0, y: 0 },
  canvas: {
    kind: "scene",
    root: {
      id: "scene-root",
      type: "frame",
      children: [{ id: slotId, type: "slot", name: "Candidates", blockId: "button" }],
    },
  },
};
const initialGraph: ShowGraph = {
  nodes: [
    {
      id: sceneId,
      kind: "scene",
      name: "Candidate list",
      parentId: null,
      position: { x: 0, y: 0 },
      variables: [],
    },
  ],
  edges: [],
  shapes: [
    {
      id: "candidate",
      name: "Candidate",
      fields: [{ id: "name", name: "name", type: "text", required: true, defaultValue: null }],
    },
  ],
  blocks: [
    {
      id: "button",
      name: "CandidateButton",
      variables: [],
      states: [],
      canvas: { id: "block-canvas", kind: "block", root: { id: "button-root", type: "frame" } },
    },
  ],
  cues: [source, target, { ...target, id: "confirm", name: "Confirm candidate" }],
  slotEventBindings: [savedBinding],
};

function SlotEventsStory({ initial }: { initial: ShowGraph }) {
  const [graph, setGraph] = useState(initial);
  const model = useCanvasInspectorModel({
    focused,
    artboards: [focused],
    selection: { artId: sceneId, elementIds: [slotId] },
    blocks: graph.blocks,
    shapes: graph.shapes,
    cues: graph.cues,
    slotEventBindings: graph.slotEventBindings,
    onSetSlotEventBinding: (binding) =>
      setGraph((current) => setSlotEventBinding(binding).apply(current).state),
    onRemoveSlotEventBinding: (bindingId) =>
      setGraph((current) => removeSlotEventBinding(bindingId).apply(current).state),
    onAddSlotCueBinding: (sourceCueId, slotElementId) =>
      setGraph(
        (current) =>
          slotCueBindingCommand({ graph: current, focused, sourceCueId, slotElementId }).apply(
            current,
          ).state,
      ),
    onCreateSlotCueBinding: (sourceCueId, slotElementId, bindingId) =>
      setGraph(
        (current) =>
          slotCueBindingCommand({
            graph: current,
            focused,
            sourceCueId,
            slotElementId,
            bindingId,
            createNew: true,
          }).apply(current).state,
      ),
  });
  return (
    <SidebarProvider className="min-h-screen w-full bg-background">
      <div className="min-h-screen flex-1 bg-background" />
      <Sidebar collapsible="offcanvas" variant="floating" side="right" aria-label="Interactions">
        <InspectorProvider>
          {model && (
            <CanvasInspectorProvider value={model}>
              <SidebarContent className="gap-0">
                <InteractionSection />
              </SidebarContent>
            </CanvasInspectorProvider>
          )}
        </InspectorProvider>
      </Sidebar>
    </SidebarProvider>
  );
}

const meta = {
  title: "studio/Editors/Canvas/Components/CanvasInspector/SlotEventsSection",
  component: SlotEventsSection,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SlotEventsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SavedRelay: Story = {
  render: () => <SlotEventsStory initial={initialGraph} />,
};
export const UnhandledSlot: Story = {
  render: () => (
    <SlotEventsStory initial={{ ...initialGraph, cues: [source], slotEventBindings: [] }} />
  ),
};
export const MultipleSavedRelays: Story = {
  render: () => (
    <SlotEventsStory
      initial={{
        ...initialGraph,
        cues: [...(initialGraph.cues ?? []), { ...source, id: "cancel", name: "Canceled" }],
        slotEventBindings: [
          savedBinding,
          { ...savedBinding, id: "cancel-link", sourceCueId: "cancel", position: 1 },
        ],
      }}
    />
  ),
};
