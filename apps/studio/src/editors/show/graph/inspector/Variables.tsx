import type { SceneNode, Shape, Type } from "@mechane/domain";
import { useMemo } from "react";

import {
  VariableInspector,
  type VariableInspectorEditing,
} from "../../../../components/VariableInspector";
import type { VariableEditing } from "../../commands/use-graph-editing";

const EMPTY_SHAPES: readonly Shape[] = [];

type VariablesProps = {
  node: SceneNode;
  editing: VariableEditing;
  shapes?: readonly Shape[];
};

export const Variables = ({ node, editing, shapes }: VariablesProps) => {
  const variableEditing = useMemo<VariableInspectorEditing>(
    () => ({
      addVariable: () => editing.addVariable(node.id),
      renameVariable: (variableId, name) => editing.renameVariable(node.id, variableId, name),
      setVariableType: (variableId, type: Type) =>
        editing.setVariableType(node.id, variableId, type),
      setVariableDefault: (variableId, defaultValue) =>
        editing.setVariableDefault(node.id, variableId, defaultValue),
      reorderVariables: (variableIds) => editing.reorderVariables(node.id, variableIds),
      removeVariable: (variableId) => editing.removeVariable(node.id, variableId),
    }),
    [editing, node.id],
  );
  return (
    <VariableInspector
      variables={node.variables}
      editing={variableEditing}
      shapes={shapes ?? EMPTY_SHAPES}
    />
  );
};
