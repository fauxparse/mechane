import { InspectorProvider } from "@mechane/design-system";
import type {
  GraphEdge,
  ShowGraph,
  UpdateOperand as UpdateOperandType,
  UpdateOperation as UpdateOperationType,
} from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";

import type { GraphInspectorEditing } from "../../commands/use-graph-editing";
import { SingleEdge } from "./SingleEdge";

const edge: GraphEdge = {
  id: "update-edge",
  kind: "update",
  sourceId: "scene-red",
  targetId: "source-score",
  sourcePath: [],
  targetPath: [],
  cueId: "cue-update",
  actionId: "action-update",
};

const initialGraph: ShowGraph = {
  nodes: [
    {
      id: "scene-red",
      kind: "scene",
      name: "Red",
      position: { x: 0, y: 0 },
      parentId: "flow",
      variables: [],
    },
    {
      id: "source-score",
      kind: "source",
      name: "Score",
      position: { x: 0, y: 0 },
      parentId: null,
      type: "number",
    },
  ],
  edges: [edge],
  actions: [
    {
      id: "action-update",
      cueId: "cue-update",
      kind: "update",
      target: { sourceId: "source-score", fieldPath: [] },
      operation: {
        kind: "set",
        operand: { kind: "literal", value: { kind: "number", value: 1 } },
      },
    },
  ],
};

function UpdateEdgeStory() {
  const [graph, setGraph] = useState(initialGraph);
  const editing = useMemo(
    () =>
      ({
        graph,
        setUpdateOperation: (actionId: string, operation: UpdateOperationType) =>
          setGraph((current) => ({
            ...current,
            actions: current.actions?.map((action) =>
              action.id === actionId && action.kind === "update"
                ? { ...action, operation }
                : action,
            ),
          })),
        setUpdateOperand: (actionId: string, operand: UpdateOperandType) =>
          setGraph((current) => ({
            ...current,
            actions: current.actions?.map((action) =>
              action.id === actionId && action.kind === "update"
                ? {
                    ...action,
                    operation:
                      action.operation.kind === "reset"
                        ? { kind: "set", operand }
                        : { ...action.operation, operand },
                  }
                : action,
            ),
          })),
      }) as unknown as GraphInspectorEditing,
    [graph],
  );

  return (
    <InspectorProvider>
      <div className="w-80">
        <SingleEdge edge={edge} graph={graph} editing={editing} />
      </div>
    </InspectorProvider>
  );
}

const meta = {
  title: "studio/SingleEdge",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const UpdateOperation: Story = { render: () => <UpdateEdgeStory /> };
