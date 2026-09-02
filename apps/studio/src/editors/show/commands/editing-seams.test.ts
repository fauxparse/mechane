import { describe, expect, it } from "vitest";
import type { ShowGraph } from "@mechane/domain";

import type {
  GraphGestureEditing,
  GraphInspectorNodeEditing,
  SourceValueEditing,
  VariableEditing,
} from "./use-graph-editing";
import { graphInspectorEditing } from "./use-graph-editing";

const graph: ShowGraph = { nodes: [], edges: [] };

const gestures: GraphGestureEditing = {
  renaming: null,
  beginRename: () => {},
  renameTo: () => {},
  commitRename: () => {},
  cancelRename: () => {},
};

const variables: VariableEditing = {
  addVariable: () => {},
  renameVariable: () => {},
  setVariableType: () => {},
  setVariableDefault: () => {},
  reorderVariables: () => {},
  removeVariable: () => {},
};

const sourceValues = {
  graph,
  commands: {
    beginGesture: () => {
      throw new Error("unused");
    },
  },
  setSourceFieldDefault: () => {},
} as unknown as SourceValueEditing;

const nodeEditing: GraphInspectorNodeEditing = {
  setNodeColor: () => {},
  setDevicePerConnection: () => {},
  setSourceType: () => null,
};
const interaction = {
  addCue: () => {},
  renameCue: () => {},
};

describe("Show Editor editing seams", () => {
  it("assembles inspector capabilities without connection or shape routes", () => {
    const inspector = graphInspectorEditing(
      graph,
      gestures,
      variables,
      sourceValues,
      nodeEditing,
      interaction,
    );
    expect(inspector).toMatchObject({
      graph,
      renaming: null,
      setNodeColor: expect.any(Function),
      addVariable: expect.any(Function),
      setSourceFieldDefault: expect.any(Function),
    });
    expect("connect" in inspector).toBe(false);
    expect("addShape" in inspector).toBe(false);
  });
});
