import type { Canvas, FrameElement, TextElement } from "@mechane/domain/canvas";
import { projectUpdateEdges } from "@mechane/domain/interactions";
import type { ShowGraph } from "@mechane/domain/graph";
import type { EventBinding, UpdateAction } from "@mechane/domain/interactions";
import { seedShowData, type SeedCanvases, type SeedShow } from "../../utils/seed-utils";

export const COUNTER_SOURCE_ID = "source_counter";
export const COUNTER_SCENE_ID = "scene_counter";
export const COUNTER_VARIABLE_ID = "variable_counter";
export const COUNTER_DEVICE_ID = "device_counter";
export const COUNTER_CUE_ID = "cue_increment_counter";
export const COUNTER_ACTION_ID = "action_increment_counter";
export const COUNTER_CANVAS_ID = "canvas_counter";
export const COUNTER_BUTTON_ID = "button_increment";

function counterText(): TextElement {
  return {
    id: "counter_value",
    type: "text",
    rank: "a",
    name: "Counter value",
    content: { kind: "variable", variableId: COUNTER_VARIABLE_ID },
    fontSize: 72,
    textAlign: "center",
    textVerticalAlign: "center",
    sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
  };
}

function incrementButton(): FrameElement {
  return {
    id: COUNTER_BUTTON_ID,
    type: "frame",
    rank: "b",
    name: "Increment button",
    fill: "#2563eb",
    cornerRadius: 16,
    layoutMode: "auto",
    direction: "horizontal",
    padding: 16,
    alignCounter: "center",
    sizing: { width: { mode: "fill" }, height: { mode: "fixed", value: 72 } },
    children: [
      {
        id: "increment_button_label",
        type: "text",
        rank: "a",
        name: "Increment button label",
        content: "Increment",
        color: "#ffffff",
        fontSize: 28,
        textAlign: "center",
        textVerticalAlign: "center",
        sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
      },
    ],
  };
}

export function counterCanvases(): SeedCanvases {
  const canvas: Canvas & { id: string } = {
    id: COUNTER_CANVAS_ID,
    kind: "scene",
    root: {
      id: "counter_root",
      type: "frame",
      name: "Counter root",
      rank: "a",
      fill: "#0f172a",
      layoutMode: "auto",
      direction: "vertical",
      gap: 32,
      padding: 48,
      alignCounter: "center",
      sizing: { width: { mode: "fixed", value: 480 }, height: { mode: "fixed", value: 360 } },
      children: [counterText(), incrementButton()],
    },
  };
  return { [COUNTER_SCENE_ID]: canvas };
}

function counterAction(): UpdateAction {
  return {
    id: COUNTER_ACTION_ID,
    cueId: COUNTER_CUE_ID,
    kind: "update",
    target: { sourceId: COUNTER_SOURCE_ID, fieldPath: [] },
    operation: {
      kind: "adjust",
      operand: { kind: "literal", value: { kind: "number", value: 1 } },
    },
  };
}

function counterBinding(canvasId: string): EventBinding {
  return {
    id: "binding_increment_counter",
    canvasId,
    elementId: COUNTER_BUTTON_ID,
    eventKind: "tap",
    cueId: COUNTER_CUE_ID,
    position: 0,
  };
}

export function counterGraph(): ShowGraph {
  const scene = {
    id: COUNTER_SCENE_ID,
    kind: "scene" as const,
    name: "Counter",
    parentId: null,
    position: { x: 320, y: 0 },
    variables: [{ id: COUNTER_VARIABLE_ID, name: "Counter", type: "number" as const }],
  };
  const source = {
    id: COUNTER_SOURCE_ID,
    kind: "source" as const,
    name: "Counter",
    parentId: null,
    position: { x: 0, y: 0 },
    type: "number" as const,
  };
  const device = {
    id: COUNTER_DEVICE_ID,
    kind: "device" as const,
    name: "Counter Display",
    parentId: null,
    position: { x: 700, y: 0 },
    perConnection: false,
    pairingCode: null,
  };
  const action = counterAction();
  const cue = {
    id: COUNTER_CUE_ID,
    name: "Increment",
    owner: { kind: "scene" as const, sceneId: COUNTER_SCENE_ID },
    actionIds: [COUNTER_ACTION_ID],
  };
  const nodes = [source, scene, device];
  return {
    sourceFieldDefaults: [{ nodeId: COUNTER_SOURCE_ID, fieldPath: [], value: 0 }],
    nodes,
    cues: [cue],
    actions: [action],
    eventBindings: [counterBinding(COUNTER_CANVAS_ID)],
    edges: [
      {
        id: "edge_counter_value",
        kind: "wiring" as const,
        sourceId: COUNTER_SOURCE_ID,
        targetId: COUNTER_SCENE_ID,
        sourcePath: [],
        targetPath: [COUNTER_VARIABLE_ID],
      },
      ...projectUpdateEdges({ nodes, cues: [cue], actions: [action] }),
      {
        id: "edge_counter_device",
        kind: "device" as const,
        sourceId: COUNTER_SCENE_ID,
        targetId: COUNTER_DEVICE_ID,
        sourcePath: [],
        targetPath: [],
      },
    ],
  };
}

async function seedSimpleCounter(showId: string): Promise<void> {
  await seedShowData(showId, counterGraph, counterCanvases);
}

export const seedShow = {
  name: "Simple Counter",
  seed: seedSimpleCounter,
} satisfies SeedShow;
