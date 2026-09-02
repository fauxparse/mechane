import { Meta, StoryObj } from "@storybook/react-vite";
import { FLOW_COLORS, type FlowColor } from "@mechane/domain";
import { ComponentProps } from "react";

import { BaseNode } from "./BaseNode";

import "../show-graph-editor.css";

type BaseNodeStoryArgs = ComponentProps<typeof BaseNode> & {
  color: FlowColor;
};

const meta: Meta<BaseNodeStoryArgs> = {
  title: "studio/graph/nodes",
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
  render: ({ color, data, ...args }: BaseNodeStoryArgs) => (
    <div className="mechane-show-graph" data-flow-theme="neutral">
      <BaseNode {...args} data={{ ...data, color }} />
    </div>
  ),
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
