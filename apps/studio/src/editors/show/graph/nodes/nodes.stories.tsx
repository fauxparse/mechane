import { Meta, StoryObj } from "@storybook/react-vite";
import { FLOW_COLORS, type FlowColor, type TransformerInputPort } from "@mechane/domain/graph";
import { ComponentProps, useState } from "react";

import { BaseNode } from "./BaseNode";
import { NodeCueList, NodeInputList, NodeVariableList } from "./NodeContent";
// DummyHandle relies on React Flow's handle positioning; the canvas loads this CSS, the story must too.
import "@xyflow/react/dist/style.css";
import "../show-graph-editor.css";

type BaseNodeStoryArgs = ComponentProps<typeof BaseNode> & {
  color: FlowColor;
};

const meta: Meta<BaseNodeStoryArgs> = {
  title: "studio/Editors/Show/Graph/Nodes",
  component: BaseNode,
  args: {
    id: "1",
    color: "orange",
    data: {
      name: "Base Node",
      color: "orange",
      kind: "scene",
      type: null,
      fields: [],
      cues: [],
      variables: [],
      wiredVariableIds: [],
      defaultSceneId: null,
      isDefaultScene: false,
      childCount: 0,
      perConnection: false,
      driven: false,
      pairingCode: null,
    },
    selected: false,
  },
  argTypes: {
    color: {
      control: "select",
      options: FLOW_COLORS,
    },
    data: { control: false },
  },
  render: ({ color, data, ...args }: BaseNodeStoryArgs) => {
    const wiredVariableIds = new Set(data.wiredVariableIds);
    const warning = data.variables.some((variable) => !wiredVariableIds.has(variable.id));
    return (
      <div className="mechane-show-graph" data-flow-theme="neutral">
        <BaseNode {...args} data={{ ...data, color }} warning={warning}>
          <NodeVariableList variables={data.variables} />
          <NodeCueList cues={data.cues} />
        </BaseNode>
      </div>
    );
  },
};

export default meta;

type Story = StoryObj<BaseNodeStoryArgs>;

export const Default: Story = {};

export const WiredScene: Story = {
  args: {
    data: {
      color: "neutral",
      kind: "scene",
      name: "Scoreboard",
      fields: [],
      type: null,
      variables: [
        {
          id: "v87n8ezj",
          name: "count",
          type: "number",
        },
      ],
      cues: [{ id: "cue_score", name: "Advance", actionCount: 1 }],
      defaultSceneId: null,
      wiredVariableIds: ["v87n8ezj"],
      isDefaultScene: false,
      childCount: 0,
      perConnection: false,
      pairingCode: null,
      driven: false,
    },
  },
};

function CalculateTransformer({ color, data: _scene, ...args }: BaseNodeStoryArgs) {
  const [ports, setPorts] = useState<TransformerInputPort[]>([
    { id: "port_home", name: "home" },
    { id: "port_away", name: "away" },
  ]);
  return (
    <div className="mechane-show-graph" data-flow-theme="neutral">
      <BaseNode
        {...args}
        data={{
          kind: "transformer",
          name: "Total",
          color,
          type: "number",
          ports,
          transform: { kind: "calculate", formula: "home + away", outputType: "number" },
          fields: [],
          cues: [],
          variables: [],
          wiredVariableIds: [],
          defaultSceneId: null,
          isDefaultScene: false,
          childCount: 0,
          perConnection: false,
          driven: false,
          pairingCode: null,
        }}
      >
        <NodeInputList
          ports={ports}
          onRename={(portId, name) =>
            setPorts((current) =>
              current.map((port) => (port.id === portId ? { ...port, name } : port)),
            )
          }
        />
      </BaseNode>
    </div>
  );
}

/** Double-click an input's name to rename it in place. */
export const TransformerInputs: Story = {
  render: (args) => <CalculateTransformer {...args} />,
};
