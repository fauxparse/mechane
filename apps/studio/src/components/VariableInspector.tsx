import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EllipsisIcon,
  GripVerticalIcon,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  PlusIcon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  PropertyInput,
  Section,
  Trash2Icon,
  TypeSelect,
  variableTypeIcon,
  type PropertyInputValue,
} from "@mechane/design-system";
import type { Shape, Type } from "@mechane/domain";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { reorderVariableIndices } from "./variable-order";
export type VariableInspectorVariable = {
  readonly id: string;
  readonly name: string;
  readonly type?: Type | null;
  readonly defaultValue?: unknown;
};

export type VariableInspectorEditing = {
  addVariable(): void;
  renameVariable(variableId: string, name: string): void;
  setVariableType(variableId: string, type: Type): void;
  setVariableDefault(variableId: string, defaultValue: unknown): void;
  reorderVariables(variableIds: readonly string[]): void;
  removeVariable(variableId: string): void;
};

type VariableInspectorProps<TVariable extends VariableInspectorVariable> = {
  variables: readonly TVariable[];
  editing: VariableInspectorEditing;
  shapes?: readonly Shape[];
  label?: string;
  addLabel?: string;
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

export function VariableInspector<TVariable extends VariableInspectorVariable>({
  variables,
  editing,
  shapes = [],
  label = "Inputs",
  addLabel = "Add Input",
}: VariableInspectorProps<TVariable>) {
  const finishDrag = (event: DragEndEvent) => {
    if (event.canceled) return;
    const source = event.operation.source;
    const target = event.operation.target;
    if (!source || !target || !isSortable(source) || !isSortable(target)) return;
    if (typeof source.id !== "string" || typeof target.id !== "string") return;
    const variableIds = variables.map((variable) => variable.id);
    const sourceIndex = variableIds.indexOf(source.id);
    if (variableIds.indexOf(target.id) === -1) return;
    const next = reorderVariableIndices(variableIds, sourceIndex, source.index);
    if (next) editing.reorderVariables(next);
  };

  return (
    <Section
      label={label}
      buttons={
        <Button size="icon-sm" variant="ghost" aria-label={addLabel} onClick={editing.addVariable}>
          <PlusIcon />
        </Button>
      }
    >
      <DragDropProvider sensors={variableSensors} onDragEnd={finishDrag}>
        <div className="grid grid-cols-subgrid gap-2 col-span-full">
          {variables.map((variable, index) => (
            <VariableRow
              key={variable.id}
              variable={variable}
              index={index}
              group={label}
              shapes={shapes}
              onRename={editing.renameVariable}
              onChangeType={editing.setVariableType}
              onSetDefault={editing.setVariableDefault}
              onRemove={editing.removeVariable}
            />
          ))}
        </div>
      </DragDropProvider>
    </Section>
  );
}

const defaultInputType = (type: Type | null | undefined): "text" | "number" | "color" | null => {
  if (type === "number") return "number";
  if (type === "color") return "color";
  if (type === "text" || type === "date" || type === "datetime") return "text";
  return null;
};

const defaultInputValue = (variable: VariableInspectorVariable): PropertyInputValue | null => {
  const type = defaultInputType(variable.type);
  const value = variable.defaultValue;
  if (!type || value === undefined || value === null) return null;
  if (type === "number" && typeof value === "number") return { kind: "number", value };
  if (type === "color" && typeof value === "string") return { kind: "color", value };
  if (type === "text" && typeof value === "string") return { kind: "text", value };
  return null;
};

const defaultLabel = (value: unknown): string => {
  if (value === undefined || value === null) return "Unset";
  if (typeof value === "string") return value.length > 0 ? value : "(Empty)";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "Unset";
  } catch {
    return "Unset";
  }
};
function VariableDefaultPopover({
  variable,
  open,
  onOpenChange,
  onSetDefault,
}: {
  variable: VariableInspectorVariable;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSetDefault: (variableId: string, defaultValue: unknown) => void;
}) {
  const inputType = defaultInputType(variable.type);
  const originalDefault = useRef(variable.defaultValue);

  useEffect(() => {
    if (open) originalDefault.current = variable.defaultValue;
  }, [open, variable.defaultValue]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onOpenChange(false);
      return;
    }
    if (event.key === "Escape") {
      onSetDefault(variable.id, originalDefault.current ?? null);
      onOpenChange(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        nativeButton={false}
        render={<span aria-hidden="true" className="absolute right-0 top-1/2 size-px" />}
      />
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={4}
        className="w-56"
        onBlur={(event) => {
          const target = event.relatedTarget;
          if (!(target instanceof Node) || !event.currentTarget.contains(target)) {
            onOpenChange(false);
          }
        }}
      >
        <PropertyInput
          type={inputType ?? "text"}
          icon={variableTypeIcon(variable.type)}
          value={defaultInputValue(variable)}
          allowLink={false}
          placeholder="Default value"
          onKeyDown={handleKeyDown}
          onChange={(next: PropertyInputValue | null) => {
            if (next !== null && "value" in next) onSetDefault(variable.id, next.value);
            else onSetDefault(variable.id, null);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type VariableRowProps = {
  variable: VariableInspectorVariable;
  index: number;
  group: string;
  shapes: readonly Shape[];
  onRename: (variableId: string, name: string) => void;
  onChangeType: (variableId: string, type: Type) => void;
  onSetDefault: (variableId: string, defaultValue: unknown) => void;
  onRemove: (variableId: string) => void;
};

function VariableRow({
  variable,
  index,
  group,
  shapes,
  onRename,
  onChangeType,
  onSetDefault,
  onRemove,
}: VariableRowProps) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({
    id: variable.id,
    index,
    group,
  });
  const [defaultPopoverOpen, setDefaultPopoverOpen] = useState(false);
  return (
    <div
      ref={ref}
      className={cn(
        "relative col-span-full grid grid-cols-(--section-columns) gap-2 items-center rounded-sm",
        isDragging ? "opacity-50" : "",
        isDropTarget ? "ring-2 ring-primary" : "",
      )}
    >
      <InputGroup className="col-span-2 grid grid-cols-[auto_auto_1fr] pl-0 items-center">
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
            value={variable.type ?? null}
            shapes={shapes}
            includeArray
            showLabel={false}
            aria-label={`Type for ${variable.name}`}
            triggerClassName="hover:text-foreground dark:hover:text-foreground"
            onValueChange={(type) => onChangeType(variable.id, type)}
          />
        </InputGroupAddon>
        <InputGroupInput
          value={variable.name}
          onChange={(event) => onRename(variable.id, event.target.value)}
        />
      </InputGroup>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="bg-transparent hover:bg-transparent opacity-50 hover:opacity-100"
              size="icon-sm"
              variant="ghost"
              aria-label={`Actions for ${variable.name}`}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={defaultInputType(variable.type) === null}
            onClick={() => setDefaultPopoverOpen(true)}
          >
            <span>Set default</span>
            <span className="ml-auto max-w-28 truncate text-muted-foreground">
              {defaultLabel(variable.defaultValue)}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => onRemove(variable.id)}>
            <Trash2Icon />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <VariableDefaultPopover
        variable={variable}
        open={defaultPopoverOpen}
        onOpenChange={setDefaultPopoverOpen}
        onSetDefault={onSetDefault}
      />
    </div>
  );
}
