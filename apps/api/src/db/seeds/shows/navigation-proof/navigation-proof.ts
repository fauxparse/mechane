import {
  projectNavigateEdges,
  type Canvas,
  type Cue,
  type EventBinding,
  type FrameElement,
  type NavigateAction,
  type ShowGraph,
  type TextElement,
} from "@mechane/domain";
import { seedShowData, type SeedCanvases, type SeedShow } from "../../utils/seed-utils";

export const NAVIGATION_FLOW_ID = "flow_navigation";
export const NAVIGATION_SCENE_IDS = ["scene_red", "scene_green", "scene_blue"] as const;
export const NAVIGATION_DEVICE_ID = "device_navigation";
export const NAVIGATION_AUDIENCE_DEVICE_ID = "device_navigation_audience";

const SCENE_NAMES = {
  scene_red: "Red",
  scene_green: "Green",
  scene_blue: "Blue",
} as const;
const SCENE_COLORS = {
  scene_red: "red",
  scene_green: "green",
  scene_blue: "blue",
} as const;
const CANVAS_IDS = {
  scene_red: "canvas_navigation_red",
  scene_green: "canvas_navigation_green",
  scene_blue: "canvas_navigation_blue",
} as const;
const SCENE_POSITIONS = {
  scene_red: { x: 240, y: 120 },
  scene_green: { x: 1040, y: 120 },
  scene_blue: { x: 640, y: 813 },
} as const;

type NavigationSceneId = (typeof NAVIGATION_SCENE_IDS)[number];
type NavigationColor = (typeof SCENE_COLORS)[NavigationSceneId];

const destinationsByScene: Record<NavigationSceneId, readonly NavigationSceneId[]> = {
  scene_red: ["scene_green", "scene_blue"],
  scene_green: ["scene_red", "scene_blue"],
  scene_blue: ["scene_red", "scene_green"],
};

function text(
  id: string,
  content: string,
  name: string,
  fontSize: number,
  color: string,
): TextElement {
  return {
    id,
    type: "text",
    rank: "a",
    name,
    content,
    fontSize,
    textAlign: "center",
    textVerticalAlign: "center",
    sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
    color,
  };
}

function button(sceneId: NavigationSceneId, destinationId: NavigationSceneId): FrameElement {
  const destination = SCENE_NAMES[destinationId];
  return {
    id: `button_${sceneId}_${destinationId}`,
    type: "frame",
    name: `Go to ${destination}`,
    fill: "#ffffff",
    cornerRadius: 16,
    layoutMode: "auto",
    direction: "horizontal",
    padding: 12,
    alignCounter: "center",
    sizing: { width: { mode: "fill" }, height: { mode: "fixed", value: 72 } },
    children: [
      text(
        `button_${sceneId}_${destinationId}_label`,
        `Go to ${destination}`,
        `${destination} button label`,
        28,
        SCENE_COLORS[destinationId],
      ),
    ],
  };
}

function canvas(sceneId: NavigationSceneId): Canvas & { id: string } {
  const sceneName = SCENE_NAMES[sceneId];
  const children = destinationsByScene[sceneId].map((destinationId, index) => ({
    ...button(sceneId, destinationId),
    rank: String.fromCharCode(98 + index),
  }));
  return {
    id: CANVAS_IDS[sceneId],
    kind: "scene",
    root: {
      id: `${sceneId}_root`,
      type: "frame",
      name: `${sceneName} root`,
      rank: "a",
      layoutMode: "auto",
      direction: "vertical",
      gap: 24,
      padding: 48,
      fill: `#${SCENE_COLORS[sceneId] === "red" ? "7f1d1d" : SCENE_COLORS[sceneId] === "green" ? "14532d" : "1e3a8a"}`,
      sizing: { width: { mode: "fixed", value: 720 }, height: { mode: "fixed", value: 480 } },
      children: [
        text(`${sceneId}_title`, sceneName, `${sceneName} title`, 56, "white"),
        ...children,
      ],
    },
  };
}

function cue(sceneId: NavigationSceneId, destinationId: NavigationSceneId): Cue {
  return {
    id: `cue_${sceneId}_${destinationId}`,
    name: `Go to ${SCENE_NAMES[destinationId]}`,
    owner: { kind: "scene", sceneId },
    actionIds: [`action_${sceneId}_${destinationId}`],
  };
}

function action(sceneId: NavigationSceneId, destinationId: NavigationSceneId): NavigateAction {
  return {
    id: `action_${sceneId}_${destinationId}`,
    cueId: `cue_${sceneId}_${destinationId}`,
    kind: "navigate",
    targetSceneId: destinationId,
  };
}

function binding(sceneId: NavigationSceneId, destinationId: NavigationSceneId): EventBinding {
  return {
    id: `binding_${sceneId}_${destinationId}`,
    canvasId: CANVAS_IDS[sceneId],
    elementId: `button_${sceneId}_${destinationId}`,
    eventKind: "tap",
    cueId: `cue_${sceneId}_${destinationId}`,
  };
}

export function navigationProofGraph(): ShowGraph {
  const scenes = NAVIGATION_SCENE_IDS.map((sceneId) => ({
    id: sceneId,
    kind: "scene" as const,
    name: SCENE_NAMES[sceneId],
    parentId: NAVIGATION_FLOW_ID,
    position: SCENE_POSITIONS[sceneId],
    color: SCENE_COLORS[sceneId] satisfies NavigationColor,
    variables: [],
  }));
  const cues = NAVIGATION_SCENE_IDS.flatMap((sceneId) =>
    destinationsByScene[sceneId].map((destinationId) => cue(sceneId, destinationId)),
  );
  const actions = NAVIGATION_SCENE_IDS.flatMap((sceneId) =>
    destinationsByScene[sceneId].map((destinationId) => action(sceneId, destinationId)),
  );
  const eventBindings = NAVIGATION_SCENE_IDS.flatMap((sceneId) =>
    destinationsByScene[sceneId].map((destinationId) => binding(sceneId, destinationId)),
  );
  const nodes = [
    {
      id: NAVIGATION_FLOW_ID,
      kind: "flow" as const,
      name: "Navigation",
      parentId: null,
      position: { x: 0, y: 0 },
      defaultSceneId: "scene_red",
    },
    ...scenes,
    {
      id: NAVIGATION_DEVICE_ID,
      kind: "device" as const,
      name: "Navigation Proof Device",
      parentId: null,
      position: { x: 1840, y: 466 },
      perConnection: false,
      pairingCode: null,
    },
    {
      id: NAVIGATION_AUDIENCE_DEVICE_ID,
      kind: "device" as const,
      name: "Navigation Proof Audience",
      parentId: null,
      position: { x: 1840, y: 760 },
      perConnection: true,
      pairingCode: null,
    },
  ];
  const navigateEdges = projectNavigateEdges({ nodes, cues, actions });
  return {
    nodes,
    edges: [
      {
        id: "edge_navigation_device",
        kind: "device",
        sourceId: NAVIGATION_FLOW_ID,
        targetId: NAVIGATION_DEVICE_ID,
        sourcePath: [],
        targetPath: [],
      },
      {
        id: "edge_navigation_audience",
        kind: "device",
        sourceId: NAVIGATION_FLOW_ID,
        targetId: NAVIGATION_AUDIENCE_DEVICE_ID,
        sourcePath: [],
        targetPath: [],
      },
      ...navigateEdges,
    ],
    cues,
    actions,
    eventBindings,
  };
}

export function navigationProofCanvases(): SeedCanvases {
  return {
    scene_red: canvas("scene_red"),
    scene_green: canvas("scene_green"),
    scene_blue: canvas("scene_blue"),
  };
}

async function seedNavigationProof(showId: string): Promise<void> {
  await seedShowData(showId, navigationProofGraph, navigationProofCanvases);
}

export const seedShow = {
  name: "Navigation Proof",
  seed: seedNavigationProof,
} satisfies SeedShow;
