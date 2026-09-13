import { describe, expect, it } from "vitest";
import type { GraphEdge } from "@mechane/domain";
import {
  FLOW_HEADER_HEIGHT,
  FLOW_NODE_TYPE,
  FLOW_PADDING,
  NODE_HEIGHT,
  NODE_TYPE_BY_KIND,
  NODE_WIDTH,
} from "./graph/graph-to-flow";
import type { ShowFlowNode } from "./graph/graph-to-flow";
import {
  childrenPushedInside,
  clampIntoFlow,
  clearOfFlows,
  compactRootSceneAtDrop,
  flowDimensionsForChildren,
  compactRootScenePair,
  flowAtPoint,
  flowContentBox,
  moveOutPositions,
  nextChildPosition,
  relativeToFlow,
  sizeOf,
  tidyLayout,
} from "./show-graph-layout";

function flowNode(
  id: string,
  position: { x: number; y: number },
  size: { width: number; height: number },
  defaultSceneId: string | null = null,
): ShowFlowNode {
  return {
    id,
    type: FLOW_NODE_TYPE,
    position,
    style: size,
    data: { kind: "flow", name: id, defaultSceneId } as ShowFlowNode["data"],
  };
}

function childNode(
  id: string,
  parentId: string,
  position: { x: number; y: number },
  measuredHeight?: number,
): ShowFlowNode {
  return {
    id,
    type: NODE_TYPE_BY_KIND.scene,
    position,
    parentId,
    // What the projection emits for a Scene: a width, and a *minimum* height
    // the rows grow past. React Flow fills in `measured`.
    style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT },
    ...(measuredHeight === undefined
      ? {}
      : { measured: { width: NODE_WIDTH, height: measuredHeight } }),
    data: { kind: "scene", name: id } as ShowFlowNode["data"],
  };
}
function deviceNode(id: string, position: { x: number; y: number }): ShowFlowNode {
  return {
    id,
    type: NODE_TYPE_BY_KIND.device,
    position,
    style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT },
    data: { kind: "device", name: id } as ShowFlowNode["data"],
  };
}

const FLOW = flowNode("flow_1", { x: 100, y: 100 }, { width: 600, height: 400 });
const OTHER = flowNode("flow_2", { x: 1000, y: 0 }, { width: 400, height: 300 });

describe("flowAtPoint", () => {
  it("finds the Flow whose box covers the point", () => {
    expect(flowAtPoint({ x: 200, y: 200 }, [FLOW, OTHER])?.id).toBe(FLOW.id);
    expect(flowAtPoint({ x: 1100, y: 100 }, [FLOW, OTHER])?.id).toBe(OTHER.id);
  });

  it("answers nothing for the bare canvas", () => {
    expect(flowAtPoint({ x: 50, y: 50 }, [FLOW, OTHER])).toBe(null);
  });

  // A node being dragged is not somewhere it can be dropped into.
  it("skips excluded Flows", () => {
    expect(flowAtPoint({ x: 200, y: 200 }, [FLOW, OTHER], new Set([FLOW.id]))).toBe(null);
  });
});

describe("clampIntoFlow", () => {
  const size = { width: NODE_WIDTH, height: NODE_HEIGHT };

  it("leaves a position that is already inside alone", () => {
    expect(clampIntoFlow(FLOW, { x: 40, y: 120 }, size)).toEqual({ x: 40, y: 120 });
  });

  // #508: a Flow-owned node is inside its Flow's box, no exceptions —
  // otherwise placement and containment tell the director different stories.
  it("pulls a node dropped past the right or bottom edge back inside", () => {
    expect(clampIntoFlow(FLOW, { x: 590, y: 390 }, size)).toEqual({
      x: 600 - FLOW_PADDING - NODE_WIDTH,
      y: 400 - FLOW_PADDING - NODE_HEIGHT,
    });
  });

  it("keeps a node clear of the header and the padding", () => {
    expect(clampIntoFlow(FLOW, { x: -100, y: 0 }, size)).toEqual({
      x: FLOW_PADDING,
      y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
    });
  });

  it("never inverts the box when the Flow is too small for the node", () => {
    const tiny = flowNode("flow_tiny", { x: 0, y: 0 }, { width: 80, height: 80 });
    const box = flowContentBox({ width: 80, height: 80 });
    expect(clampIntoFlow(tiny, { x: 500, y: 500 }, size)).toEqual({ x: box.left, y: box.top });
  });
});

describe("sizeOf", () => {
  // A Scene's rows make it taller than the one-header minimum the projection
  // gives it, and only `measured` knows by how much.
  it("prefers the measured height over the projected minimum", () => {
    expect(sizeOf(childNode("scene_1", FLOW.id, { x: 0, y: 0 }, 190)).height).toBe(190);
  });

  it("falls back to the projected minimum before a node is measured", () => {
    expect(sizeOf(childNode("scene_1", FLOW.id, { x: 0, y: 0 })).height).toBe(NODE_HEIGHT);
  });
});

describe("childrenPushedInside", () => {
  const size = { width: 400, height: 300 };

  it("leaves children a shrunk Flow still contains alone", () => {
    const child = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    expect(childrenPushedInside(size, [child])).toEqual([]);
  });

  // #508: the box wins and the children move to suit. Refusing to shrink
  // instead is a resize handle that stops working.
  it("names the children a shrunk Flow no longer holds, and where they go", () => {
    const inside = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    const crowded = childNode("scene_2", FLOW.id, { x: 500, y: 260 });
    expect(childrenPushedInside(size, [inside, crowded])).toEqual([
      {
        id: "scene_2",
        position: { x: 400 - FLOW_PADDING - NODE_WIDTH, y: 300 - FLOW_PADDING - NODE_HEIGHT },
      },
    ]);
  });

  // Clamping a tall Scene by the 56px default lands its *top* inside the box
  // and leaves its Cue rows hanging out the bottom.
  it("clamps a Scene by its measured height, rows included", () => {
    const tall = childNode("scene_1", FLOW.id, { x: 24, y: 200 }, 190);
    expect(childrenPushedInside(size, [tall])).toEqual([
      { id: "scene_1", position: { x: 24, y: 300 - FLOW_PADDING - 190 } },
    ]);
  });

  it("stops at the content origin rather than inverting a too-small box", () => {
    const child = childNode("scene_1", FLOW.id, { x: 500, y: 500 });
    expect(childrenPushedInside({ width: 80, height: 80 }, [child])).toEqual([
      { id: "scene_1", position: { x: FLOW_PADDING, y: FLOW_HEADER_HEIGHT + FLOW_PADDING } },
    ]);
  });
});

describe("relativeToFlow", () => {
  it("rebases a canvas point onto the Flow that will own it", () => {
    const byId = new Map([[FLOW.id, FLOW]]);
    expect(relativeToFlow({ x: 250, y: 300 }, FLOW, byId)).toEqual({ x: 150, y: 200 });
  });
});

describe("nextChildPosition", () => {
  it("starts at the content origin in an empty Flow", () => {
    expect(nextChildPosition(FLOW, [])).toEqual({
      x: FLOW_PADDING,
      y: FLOW_HEADER_HEIGHT + FLOW_PADDING,
    });
  });

  it("drops below whatever is already in there", () => {
    const existing = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    expect(nextChildPosition(FLOW, [existing]).y).toBeGreaterThan(74 + NODE_HEIGHT);
  });

  it("stays inside the box even when the column runs out of room", () => {
    const low = childNode("scene_1", FLOW.id, { x: 24, y: 380 });
    const position = nextChildPosition(FLOW, [low]);
    expect(position.y).toBeLessThanOrEqual(400 - FLOW_PADDING - NODE_HEIGHT);
  });
});

describe("clearOfFlows", () => {
  const size = { width: NODE_WIDTH, height: NODE_HEIGHT };

  it("leaves a point on open canvas where it is", () => {
    expect(clearOfFlows({ x: 20, y: 700 }, size, [FLOW, OTHER])).toEqual({ x: 20, y: 700 });
  });

  // #508: a Show-level node inside a Flow's box would read as belonging to it.
  it("moves a Show-level node off the Flow it landed on", () => {
    const position = clearOfFlows({ x: 300, y: 250 }, size, [FLOW, OTHER]);
    const covered =
      position.x < 700 &&
      position.x + NODE_WIDTH > 100 &&
      position.y < 500 &&
      position.y + NODE_HEIGHT > 100;
    expect(covered).toBe(false);
  });
});

describe("moveOutPositions", () => {
  it("lands an extracted node outside the Flow it came from", () => {
    const child = childNode("scene_1", FLOW.id, { x: 24, y: 74 });
    const [position] = moveOutPositions([child.id], [FLOW, child]);
    const stillInside =
      position!.x < 700 &&
      position!.x + NODE_WIDTH > 100 &&
      position!.y < 500 &&
      position!.y + NODE_HEIGHT > 100;
    expect(stillInside).toBe(false);
  });
});
describe("tidyLayout", () => {
  it("keeps root Flows in a spacious vertical lane", () => {
    const first = flowNode("first", { x: 480, y: 120 }, { width: 200, height: 180 });
    const second = flowNode("second", { x: 80, y: 600 }, { width: 300, height: 220 });
    const [firstPosition, secondPosition] = tidyLayout([first, second]).positions;

    expect(firstPosition).toBeDefined();
    expect(secondPosition?.position.x).toBe(80);
    expect(secondPosition?.position.y).toBeGreaterThan(
      (firstPosition?.position.y ?? 0) + sizeOf(first).height + 80,
    );
  });

  it("orders Flow Scenes by navigation and resizes the Flow around them", () => {
    const flow = flowNode("flow", { x: 0, y: 0 }, { width: 300, height: 200 }, "first");
    const first = childNode("first", flow.id, { x: 180, y: 220 });
    const second = childNode("second", flow.id, { x: 12, y: 4 });
    const edges = [
      {
        id: "first-second",
        kind: "navigate",
        sourceId: first.id,
        targetId: second.id,
        sourcePath: [],
        targetPath: [],
        cueId: "cue-1",
        actionId: "action-1",
      },
    ] satisfies GraphEdge[];

    expect(tidyLayout([flow, first, second], edges)).toEqual({
      positions: [
        { id: "first", position: { x: 64, y: 114 } },
        { id: "second", position: { x: 400, y: 114 } },
        { id: "flow", position: { x: 0, y: 0 } },
      ],
      flowSizes: [{ id: "flow", size: { width: 704, height: 234 } }],
    });
  });

  it("puts Devices in a lane right of every root Flow", () => {
    const flow = flowNode("flow", { x: 0, y: 0 }, { width: 300, height: 200 });
    const scene = childNode("scene", flow.id, { x: 0, y: 0 });
    const device = deviceNode("device", { x: -500, y: -500 });
    const edges = [
      {
        id: "flow-device",
        kind: "device",
        sourceId: flow.id,
        targetId: device.id,
        sourcePath: [],
        targetPath: [],
      },
    ] satisfies GraphEdge[];

    const plan = tidyLayout([flow, scene, device], edges);
    const flowPosition = plan.positions.find((position) => position.id === flow.id);
    const devicePosition = plan.positions.find((position) => position.id === device.id);
    const flowSize = plan.flowSizes.find((size) => size.id === flow.id);
    expect(devicePosition?.position.x).toBeGreaterThan(
      (flowPosition?.position.x ?? 0) + (flowSize?.size.width ?? 0),
    );
  });
});

describe("flowDimensionsForChildren", () => {
  it("calculates explicit dimensions from rendered child bounds", () => {
    const flow = flowNode("flow_1", { x: 0, y: 0 }, { width: 400, height: 300 });
    const child = childNode("scene_1", flow.id, { x: 24, y: 74 }, 190);
    expect(flowDimensionsForChildren([child])).toEqual({
      width: 288,
      height: 288,
    });
  });

  it("does not change an existing Flow when child membership moves", () => {
    const flow = flowNode("flow_1", { x: 0, y: 0 }, { width: 400, height: 300 });
    expect(flow.style).toEqual({ width: 400, height: 300 });
    expect(flowDimensionsForChildren([childNode("scene_1", flow.id, { x: 600, y: 600 })])).toEqual({
      width: 864,
      height: 680,
    });
    expect(flow.style).toEqual({ width: 400, height: 300 });
  });
});

describe("compact scene navigation layout", () => {
  it("lays the destination to the right and sizes the new Flow", () => {
    const source = childNode("scene_source", "root", { x: 100, y: 100 });
    const destination = childNode("scene_destination", "root", { x: 500, y: 100 });
    const pair = compactRootScenePair(source, destination, { x: 400, y: 150 }, [
      source,
      destination,
    ]);
    expect(pair.destinationPosition.x).toBeGreaterThan(pair.sourcePosition.x);
    expect(pair.dimensions).toEqual({ width: 560, height: 154 });
  });

  it("moves the new Flow off an existing obstacle", () => {
    const source = childNode("scene_source", "root", { x: 100, y: 100 });
    const obstacle = flowNode("flow_obstacle", { x: 0, y: 0 }, { width: 560, height: 130 });
    const pair = compactRootSceneAtDrop(source, { x: 100, y: 20 }, [source, obstacle]);
    expect(pair.flowPosition).not.toEqual({ x: 100 - 296, y: 20 - 74 });
  });
});
