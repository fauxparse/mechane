import type { GraphEdit, Gesture } from "@mechane/commands";
import { setSourceFieldDefault } from "@mechane/commands";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Section,
  SectionRow,
  Switch,
  Textarea,
  Trash2Icon,
} from "@mechane/design-system";
import {
  defaultSourceValues,
  defaultValueForType,
  fieldsForType,
  setValueAtPath,
  type Shape,
  type ShowGraph,
  type SourceNode,
  type Type,
  valueAtPath,
} from "@mechane/domain";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GraphEditing } from "../../commands/use-graph-editing";

const INLINE_STRING_LIMIT = 200;

type SourceValueRow = {
  label: string;
  fieldPath: readonly string[];
  type: Type;
  value: unknown;
  hasOverride: boolean;
};

type ErrorPath = readonly (string | number)[];
type SourceValueGesture = Gesture<ShowGraph, GraphEdit>;
type ValueEditorProps = {
  type: Type;
  value: unknown;
  shapes: readonly Shape[];
  path: ErrorPath;
  onChange: (value: unknown) => void;
  onValidityChange: (path: ErrorPath, error: string | null) => void;
};

function pathKey(path: ErrorPath): string {
  return path.join(".");
}

function hasGraphOverride(
  graph: GraphEditing["graph"],
  nodeId: string,
  fieldPath: readonly string[],
): boolean {
  return (graph.sourceFieldDefaults ?? []).some(
    (override) =>
      override.nodeId === nodeId &&
      override.fieldPath.length === fieldPath.length &&
      override.fieldPath.every((segment, index) => segment === fieldPath[index]),
  );
}

function sourceValueRows(node: SourceNode, editing: GraphEditing): SourceValueRow[] {
  const value = defaultSourceValues(editing.graph)[node.id];
  const shapes = editing.graph.shapes ?? [];
  const fields = fieldsForType(node.type, shapes);
  if (fields.length === 0) {
    return [
      {
        label: "Value",
        fieldPath: [],
        type: node.type,
        value,
        hasOverride: hasGraphOverride(editing.graph, node.id, []),
      },
    ];
  }
  return fields.map((field) => ({
    label: field.name,
    fieldPath: [field.id],
    type: field.type,
    value: valueAtPath(value, [field.id]),
    hasOverride: hasGraphOverride(editing.graph, node.id, [field.id]),
  }));
}

function typeLabel(type: Type): string {
  if (typeof type === "string") return type;
  if (type.kind === "array") return `${typeLabel(type.of)}[]`;
  if (type.kind === "shape") return "shape";
  return "object";
}

function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "No value";
  if (typeof value === "string") return value.length === 0 ? "Empty text" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object")
    return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  return "Unsupported value";
}

function usesModal(type: Type, value: unknown): boolean {
  if (typeof type !== "string") return true;
  if (value === null || typeof value === "number" || typeof value === "boolean") return false;
  return typeof value !== "string" || value.length > INLINE_STRING_LIMIT || value.includes("\n");
}

function primitiveDraft(type: string, value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (type === "boolean") return "false";
  return "";
}

function parsePrimitive(type: string, draft: string): { value: unknown } | { error: string } {
  if (type === "number") {
    const value = Number(draft);
    return Number.isFinite(value) ? { value } : { error: "Enter a finite number." };
  }
  if (type === "boolean") {
    if (draft === "true") return { value: true };
    if (draft === "false") return { value: false };
    return { error: "Choose true or false." };
  }
  return { value: draft };
}

function PrimitiveEditor({
  type,
  value,
  path,
  onChange,
  onValidityChange,
}: ValueEditorProps & { type: string }) {
  const [draft, setDraft] = useState(() => primitiveDraft(type, value));
  useEffect(() => setDraft(primitiveDraft(type, value)), [type, value]);

  if (type === "boolean") {
    return (
      <Switch
        checked={value === true}
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") onChange(checked);
        }}
        aria-label="Boolean value"
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        value={draft}
        type={type === "number" ? "number" : "text"}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = parsePrimitive(type, draft);
          if ("error" in parsed) {
            onValidityChange(path, parsed.error);
          } else {
            onValidityChange(path, null);
            onChange(parsed.value);
          }
        }}
        aria-label={`${type} value`}
      />
    </div>
  );
}

function ArrayEditor({
  type,
  value,
  shapes,
  path,
  onChange,
  onValidityChange,
}: ValueEditorProps & { type: Extract<Type, { kind: "array" }> }) {
  const values = Array.isArray(value) ? value : [];
  return (
    <div className="flex flex-col gap-2">
      {values.map((item, index) => (
        <div className="flex items-start gap-2" key={`${pathKey(path)}-${index}`}>
          <ValueEditor
            type={type.of}
            value={item}
            shapes={shapes}
            path={[...path, index]}
            onChange={(next) =>
              onChange(
                values.map((current, currentIndex) => (currentIndex === index ? next : current)),
              )
            }
            onValidityChange={onValidityChange}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove item ${index + 1}`}
            onClick={() => onChange(values.filter((_, currentIndex) => currentIndex !== index))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => onChange([...values, defaultValueForType(type.of, shapes)])}
      >
        <PlusIcon />
        Add item
      </Button>
    </div>
  );
}

function ObjectEditor({
  value,
  shapes,
  path,
  onChange,
  onValidityChange,
}: ValueEditorProps & { type: Extract<Type, { kind: "object" }> }) {
  const values: Record<string, unknown> =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : {};
  const entries = Object.entries(values);
  return (
    <div className="flex flex-col gap-2">
      {entries.map(([key, item]) => (
        <div className="flex items-start gap-2" key={`${pathKey(path)}-${key}`}>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              defaultValue={key}
              aria-label="Object property name"
              onBlur={(event) => {
                const nextKey = event.target.value.trim();
                if (!nextKey || nextKey === key || nextKey in values) return;
                const next = { ...values };
                delete next[key];
                next[nextKey] = item;
                onChange(next);
              }}
            />
            <ValueEditor
              type={inferredType(item)}
              value={item}
              shapes={shapes}
              path={[...path, key]}
              onChange={(next) => onChange({ ...values, [key]: next })}
              onValidityChange={onValidityChange}
            />
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${key}`}
            onClick={() => {
              const next = { ...values };
              delete next[key];
              onChange(next);
            }}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => onChange({ ...values, [`property${entries.length + 1}`]: "" })}
      >
        <PlusIcon />
        Add property
      </Button>
    </div>
  );
}

function ShapeEditor({
  type,
  value,
  shapes,
  path,
  onChange,
  onValidityChange,
}: ValueEditorProps & { type: Extract<Type, { kind: "shape" }> }) {
  const shape = shapes.find((candidate) => candidate.id === type.shapeId);
  if (!shape) return <p className="text-sm text-destructive">Shape definition is unavailable.</p>;
  const objectValue: Record<string, unknown> =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value))
      : {};
  return (
    <div className="flex flex-col gap-3">
      {shape.fields.map((field) => (
        <div className="flex flex-col gap-1" key={field.id}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{field.name}</span>
            <span className="text-xs text-muted-foreground">{typeLabel(field.type)}</span>
          </div>
          <ValueEditor
            type={field.type}
            value={Reflect.get(objectValue, field.id)}
            shapes={shapes}
            path={[...path, field.id]}
            onChange={(next) => onChange(setValueAtPath(objectValue, [field.id], next))}
            onValidityChange={onValidityChange}
          />
        </div>
      ))}
    </div>
  );
}

function inferredType(value: unknown): Type {
  if (typeof value === "string") return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value))
    return { kind: "array", of: value.length > 0 ? inferredType(value[0]) : "text" };
  return { kind: "object" };
}

function ValueEditor(props: ValueEditorProps) {
  const { type, value, shapes, onChange } = props;
  if (typeof type === "string") {
    return <PrimitiveEditor {...props} type={type} />;
  }
  if (value === null) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange(defaultValueForType(type, shapes))}
      >
        Use {typeLabel(type)} value
      </Button>
    );
  }
  if (type.kind === "array") {
    return <ArrayEditor {...props} type={type} />;
  }
  if (type.kind === "object") {
    return <ObjectEditor {...props} type={type} />;
  }
  if (type.kind === "shape") {
    return <ShapeEditor {...props} type={type} />;
  }
  const exhaustive: never = type;
  return exhaustive;
}

function SourceValueDialog({
  row,
  shapes,
  open,
  onOpenChange,
  onSave,
}: {
  row: SourceValueRow;
  shapes: readonly Shape[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(row.value);
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const isLongText =
    typeof row.type === "string" &&
    typeof row.value === "string" &&
    (row.value.includes("\n") || row.value.length > INLINE_STRING_LIMIT);

  useEffect(() => {
    if (!open) return;
    setDraft(row.value);
    setErrors(new Map());
  }, [open, row]);

  const updateDraft = (next: unknown) => {
    setErrors(new Map());
    setDraft(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label={`Edit ${row.label}`}>
        <DialogTitle>Edit {row.label}</DialogTitle>
        <DialogDescription>
          Changes are applied as one undoable source-value edit.
        </DialogDescription>
        {isLongText ? (
          <Textarea
            autoFocus
            value={typeof draft === "string" ? draft : ""}
            aria-label={`${row.label} value`}
            className="min-h-40 resize-y"
            onChange={(event) => updateDraft(event.target.value)}
          />
        ) : (
          <ValueEditor
            type={row.type}
            value={draft}
            shapes={shapes}
            path={[]}
            onChange={updateDraft}
            onValidityChange={(path, error) => {
              setErrors((current) => {
                const next = new Map(current);
                const key = pathKey(path);
                if (error) next.set(key, error);
                else next.delete(key);
                return next;
              });
            }}
          />
        )}
        {errors.size > 0 ? (
          <p className="text-sm text-destructive">{[...errors.values()][0]}</p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={errors.size > 0}
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InlineValue({
  row,
  nodeId,
  editing,
}: {
  row: SourceValueRow;
  nodeId: string;
  editing: GraphEditing;
}) {
  const gesture = useRef<SourceValueGesture | null>(null);
  const commitTimer = useRef<number | null>(null);
  const primitiveType = typeof row.type === "string" ? row.type : "text";
  const [draft, setDraft] = useState(() => primitiveDraft(primitiveType, row.value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(primitiveDraft(primitiveType, row.value));
    setError(null);
  }, [primitiveType, row.value]);

  const finishGesture = () => {
    if (commitTimer.current !== null) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    gesture.current?.commit();
    gesture.current = null;
  };

  const cancelGesture = () => {
    if (commitTimer.current !== null) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    gesture.current?.abort();
    gesture.current = null;
  };

  const updateValue = (value: unknown) => {
    gesture.current ??= editing.commands.beginGesture({
      key: `sourceFieldDefault:${nodeId}:${row.fieldPath.join(".")}`,
      label: `Edit ${row.label}`,
    });
    gesture.current.update(setSourceFieldDefault(nodeId, row.fieldPath, value));
    if (commitTimer.current !== null) clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(finishGesture, 400);
  };

  if (primitiveType === "boolean") {
    return (
      <Switch
        checked={row.value === true}
        onCheckedChange={(checked) => {
          if (typeof checked === "boolean") {
            updateValue(checked);
            finishGesture();
          }
        }}
        aria-label={`${row.label} value`}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        value={draft}
        type={primitiveType === "number" ? "number" : "text"}
        placeholder={row.value === null ? "No value" : undefined}
        aria-invalid={error ? true : undefined}
        aria-label={`${row.label} value`}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const parsed = parsePrimitive(primitiveType, nextDraft);
          if ("error" in parsed) {
            setError(parsed.error);
          } else {
            setError(null);
            updateValue(parsed.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(primitiveDraft(primitiveType, row.value));
            setError(null);
            cancelGesture();
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          const parsed = parsePrimitive(primitiveType, draft);
          if ("error" in parsed) setError(parsed.error);
          else {
            setError(null);
            updateValue(parsed.value);
            finishGesture();
          }
        }}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function SourceValues({ node, editing }: { node: SourceNode; editing: GraphEditing }) {
  const rows = useMemo(() => sourceValueRows(node, editing), [editing, node]);
  const shapes = editing.graph.shapes ?? [];
  const [activeRow, setActiveRow] = useState<SourceValueRow | null>(null);

  return (
    <Section label="Source values">
      {rows.map((row) => {
        const modal = usesModal(row.type, row.value);
        return (
          <SectionRow key={row.fieldPath.join(".") || "root"}>
            <div className="col-span-2 flex min-w-0 items-center gap-2">
              <span className="w-24 shrink-0 truncate text-sm" title={row.label}>
                {row.label}
              </span>
              {modal ? (
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded-sm px-2 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setActiveRow(row)}
                  aria-label={`Edit ${row.label}`}
                >
                  {previewValue(row.value)}
                </button>
              ) : (
                <InlineValue row={row} nodeId={node.id} editing={editing} />
              )}
              {modal ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Edit ${row.label}`}
                  onClick={() => setActiveRow(row)}
                >
                  <PencilIcon />
                </Button>
              ) : null}
              {row.hasOverride ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Reset ${row.label}`}
                  title="Reset to default"
                  onClick={() => editing.setSourceFieldDefault(node.id, row.fieldPath, null)}
                >
                  <RotateCcwIcon />
                </Button>
              ) : null}
            </div>
            <span className="col-span-2 text-xs text-muted-foreground">{typeLabel(row.type)}</span>
          </SectionRow>
        );
      })}
      {activeRow ? (
        <SourceValueDialog
          row={activeRow}
          shapes={shapes}
          open
          onOpenChange={(open) => {
            if (!open) setActiveRow(null);
          }}
          onSave={(value) => editing.setSourceFieldDefault(node.id, activeRow.fieldPath, value)}
        />
      ) : null}
    </Section>
  );
}

export const sourceValueEditor = {
  inlineStringLimit: INLINE_STRING_LIMIT,
  usesModal,
  parsePrimitive,
};
