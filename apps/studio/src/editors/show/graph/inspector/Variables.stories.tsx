import type { SceneNode, SceneVariable, Type } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { GraphEditing } from "../../commands/use-graph-editing";
import { Variables } from "./Variables";

const meta = {
  title: "studio/Variables",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const INITIAL_VARIABLES: SceneVariable[] = [
  { id: "headline", name: "Headline", type: "text" },
  { id: "score", name: "Score", type: "number" },
  { id: "accent", name: "Accent", type: "color" },
];

const nodeFor = (variables: SceneVariable[]): SceneNode => ({
  id: "scene-story",
  kind: "scene",
  name: "Story Scene",
  position: { x: 0, y: 0 },
  parentId: null,
  variables,
});

function VariablesStory() {
  const [variables, setVariables] = useState(INITIAL_VARIABLES);
  const editing = {
    addVariable: () => {},
    renameVariable: (_sceneId: string, variableId: string, name: string) =>
      setVariables((current) =>
        current.map((variable) => (variable.id === variableId ? { ...variable, name } : variable)),
      ),
    setVariableType: (_sceneId: string, variableId: string, type: Type) =>
      setVariables((current) =>
        current.map((variable) => (variable.id === variableId ? { ...variable, type } : variable)),
      ),
    reorderVariables: (_sceneId: string, variableIds: readonly string[]) =>
      setVariables((current) =>
        variableIds.map((id) => current.find((variable) => variable.id === id)!),
      ),
    removeVariable: (_sceneId: string, variableId: string) =>
      setVariables((current) => current.filter((variable) => variable.id !== variableId)),
  } as unknown as GraphEditing;

  return <Variables node={nodeFor(variables)} editing={editing} />;
}

export const Default: Story = {
  render: () => <VariablesStory />,
};
