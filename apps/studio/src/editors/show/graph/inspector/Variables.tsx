// For now, only SceneNodes have variables, but eventually Transformers will need them

import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  Button,
  cn,
  GripVerticalIcon,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  PlusIcon,
  Section,
  Trash2Icon,
  TypeSelect,
} from "@mechane/design-system";
import type { SceneNode, SceneVariable, Shape, Type } from "@mechane/domain";
import { useCallback } from "react";
import type { GraphEditing } from "../../commands/use-graph-editing";
import { reorderVariableIndices } from "./variable-order";

type VariablesProps = {
  node: SceneNode;
  editing: GraphEditing;
  shapes?: readonly Shape[];
};

const variableSensors = (defaults: typeof defaultPreset.sensors) =>
  defaults.map((sensor) =>
    sensor === PointerSensor
      ? PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
          preventActivation: (event) =>
            event.target instanceof Element &&
            Boolean(event.target.closest("input, textarea, button, a")),
        })
      : sensor,
  );

export const Variables = ({ node, editing, shapes = [] }: VariablesProps) => {
  const renameVariable = useCallback(
    (variableId: string, name: string) => {
      editing.renameVariable(node.id, variableId, name);
    },
    [editing, node.id],
  );
  const removeVariable = useCallback(
    (variableId: string) => {
      editing.removeVariable(node.id, variableId);
    },
    [editing, node.id],
  );
  const finishDrag = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) return;
      const operation = event.operation;
      const source = operation.source;
      const target = operation.target;
      if (!source || !target || !isSortable(source) || !isSortable(target)) return;
      if (typeof source.id !== "string" || typeof target.id !== "string") return;
      const variableIds = node.variables.map((variable) => variable.id);
      const sourceIndex = variableIds.indexOf(source.id);
      if (variableIds.indexOf(target.id) === -1) return;
      const next = reorderVariableIndices(variableIds, sourceIndex, source.index);
      if (next) editing.reorderVariables(node.id, next);
    },
    [editing, node.id, node.variables],
  );

  return (
    <Section
      label="Inputs"
      buttons={
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Add Input"
          onClick={() => editing.addVariable(node.id)}
        >
          <PlusIcon />
        </Button>
      }
    >
      <DragDropProvider sensors={variableSensors} onDragEnd={finishDrag}>
        <div className="grid grid-cols-subgrid gap-2 col-span-full">
          {node.variables.map((variable, index) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              index={index}
              group={node.id}
              onRename={renameVariable}
              onChangeType={(variableId, type) =>
                editing.setVariableType(node.id, variableId, type)
              }
              onRemove={removeVariable}
              shapes={shapes}
            />
          ))}
        </div>
      </DragDropProvider>
    </Section>
  );
};

type VariableRowProps = {
  variable: SceneVariable;
  index: number;
  group: string;
  shapes: readonly Shape[];
  onRename: (variableId: string, name: string) => void;
  onChangeType: (variableId: string, type: Type) => void;
  onRemove: (variableId: string) => void;
};

const VariableRow = ({
  variable,
  index,
  group,
  shapes,
  onRename,
  onChangeType,
  onRemove,
}: VariableRowProps) => {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({
    id: variable.id,
    index,
    group,
  });

  const currentType: Type | null = variable.type ?? null;

  return (
    <div
      ref={ref}
      className={cn(
        "col-span-full grid grid-cols-(--section-columns) gap-2 items-center rounded-sm",
        isDragging ? "opacity-50" : "",
        isDropTarget ? "ring-2 ring-primary" : "",
      )}
    >
      <InputGroup className="col-span-2 grid grid-cols-[auto_auto_1fr] bg-muted/50 border-0 rounded-sm pl-0 items-center">
        <InputGroupAddon className="p-0 ml-0!">
          <button
            ref={handleRef}
            type="button"
            aria-label={`Reorder ${variable.name}`}
            aria-roledescription="sortable"
            className="cursor-grab touch-none"
          >
            <GripVerticalIcon className="size-4 opacity-25" />
          </button>
        </InputGroupAddon>
        <InputGroupAddon className="py-0">
          <TypeSelect
            value={currentType}
            shapes={shapes}
            includeArray
            showLabel={false}
            triggerSize="sm"
            aria-label={`Type for ${variable.name}`}
            triggerClassName="border-0 bg-transparent dark:bg-transparent hover:text-foreground dark:hover:text-foreground"
            onValueChange={(next) => onChangeType(variable.id, next)}
          />
        </InputGroupAddon>
        <InputGroupInput
          value={variable.name}
          onChange={(e) => onRename(variable.id, e.target.value)}
        />
      </InputGroup>
      <Button
        className="bg-transparent hover:bg-transparent opacity-50 hover:opacity-100 hover:text-destructive"
        size="icon-sm"
        variant="ghost"
        aria-label="Delete Input"
        onClick={() => onRemove(variable.id)}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
};
