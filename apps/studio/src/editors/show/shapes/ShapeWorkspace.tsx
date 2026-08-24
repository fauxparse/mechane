import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  ChevronLeftIcon,
  cn,
  GripVerticalIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ShapesIcon,
  Trash2Icon,
  TypeSelect,
} from "@mechane/design-system";
import type { Shape, ShapeField, ShowGraph, Type } from "@mechane/domain";
import { assertValidShapes, defaultValueForType } from "@mechane/domain";
import { useForm } from "@tanstack/react-form";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import type { GraphEditing } from "../commands/use-graph-editing";
import { ShapeDefaultEditor } from "./ShapeDefaultEditor";
import { setShapeEditorStatus } from "./shape-editor-status";

const shapeNameSchema = z.string().trim().min(1, "Shape name is required.");
const fieldNameSchema = z
  .string()
  .trim()
  .min(1, "Field name is required.")
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use letters, numbers, and underscores.");

const sensors = (defaults: typeof defaultPreset.sensors) =>
  defaults.map((sensor) =>
    sensor === PointerSensor
      ? PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
          preventActivation: (event) =>
            event.target instanceof Element &&
            Boolean(event.target.closest("input, textarea, button, a, select")),
        })
      : sensor,
  );

type ShapeWorkspaceProps = {
  graph: ShowGraph;
  shapeId: string | null;
  editing: GraphEditing;
  saving: boolean;
  saveError: Error | null;
  retrySave(): void;
  runActive: boolean;
  onOpenShape(shapeId: string): void;
  onBack(): void;
};

function makeId(prefix: "shape" | "field"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function nextName(existing: readonly string[], base: string): string {
  if (!existing.includes(base)) return base;
  const names = new Set(existing);
  let suffix = 2;
  while (names.has(`${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

function shapeUsesShape(shape: Shape, targetId: string): boolean {
  return shape.fields.some((field) => typeUsesShape(field.type, targetId));
}

function typeUsesShape(type: Type, targetId: string): boolean {
  if (typeof type === "string") return false;
  if (type.kind === "shape") return type.shapeId === targetId;
  if (type.kind === "array") return typeUsesShape(type.of, targetId);
  return false;
}

function shapeReferences(shapes: readonly Shape[], sourceId: string, targetId: string): boolean {
  const source = shapes.find((shape) => shape.id === sourceId);
  if (!source) return false;
  const visited = new Set<string>();
  const visit = (shapeId: string): boolean => {
    if (shapeId === targetId) return true;
    if (visited.has(shapeId)) return false;
    visited.add(shapeId);
    const shape = shapes.find((candidate) => candidate.id === shapeId);
    return (
      shape?.fields.some((field) => {
        if (typeof field.type === "string") return false;
        if (field.type.kind === "shape") return visit(field.type.shapeId);
        return visitType(field.type.of);
      }) ?? false
    );
  };
  const visitType = (type: Type): boolean => {
    if (typeof type === "string") return false;
    if (type.kind === "shape") return visit(type.shapeId);
    return visitType(type.of);
  };
  return visit(source.id);
}

function updateShape(
  shapes: readonly Shape[],
  shapeId: string,
  update: (shape: Shape) => Shape,
): Shape[] {
  return shapes.map((shape) => (shape.id === shapeId ? update(shape) : shape));
}

function cloneShape(shape: Shape, shapes: readonly Shape[]): Shape {
  const names = shapes.map((candidate) => candidate.name);
  const fieldIds = new Set(
    shapes.flatMap((candidate) => candidate.fields.map((field) => field.id)),
  );
  const copyFieldId = () => {
    let id = makeId("field");
    while (fieldIds.has(id)) id = makeId("field");
    fieldIds.add(id);
    return id;
  };
  return {
    id: makeId("shape"),
    name: nextName(names, `${shape.name} copy`),
    fields: shape.fields.map((field) => ({ ...field, id: copyFieldId() })),
  };
}

export function ShapeWorkspace({
  graph,
  shapeId,
  editing,
  saving,
  saveError,
  retrySave,
  runActive,
  onOpenShape,
  onBack,
}: ShapeWorkspaceProps) {
  const shapes = useMemo(() => graph.shapes ?? [], [graph.shapes]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "recent">("name");
  const selected = shapes.find((shape) => shape.id === shapeId) ?? null;
  const invalidReason = useMemo(() => {
    try {
      assertValidShapes(shapes);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "This Shape draft is invalid.";
    }
  }, [shapes]);
  useEffect(() => {
    setShapeEditorStatus({ invalidReason, activeRunWarning: runActive && selected !== null });
    return () => setShapeEditorStatus({ invalidReason: null, activeRunWarning: false });
  }, [invalidReason, runActive, selected]);
  const filtered = useMemo(
    () =>
      shapes
        .filter((shape) => shape.name.toLowerCase().includes(query.toLowerCase()))
        .sort((left, right) =>
          sort === "name" ? left.name.localeCompare(right.name) : right.id.localeCompare(left.id),
        ),
    [query, shapes, sort],
  );
  if (shapeId !== null && selected === null) {
    return (
      <main className="flex min-h-full items-center justify-center bg-background px-6 pt-20">
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">That Shape no longer exists.</p>
          <button
            type="button"
            className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={onBack}
          >
            Back to Shapes
          </button>
        </div>
      </main>
    );
  }

  const createShape = () => {
    const shape: Shape = {
      id: makeId("shape"),
      name: nextName(
        shapes.map((item) => item.name),
        "New Shape",
      ),
      fields: [],
    };
    editing.setShapes([...shapes, shape]);
    onOpenShape(shape.id);
  };

  const duplicateShape = (shape: Shape) => {
    const copy = cloneShape(shape, shapes);
    editing.setShapes([...shapes, copy]);
    onOpenShape(copy.id);
  };

  const deleteShape = (shape: Shape) => {
    const usedBy = shapes.filter(
      (candidate) => candidate.id !== shape.id && shapeUsesShape(candidate, shape.id),
    );
    if (usedBy.length > 0) return;
    if (!window.confirm(`Delete Shape “${shape.name}”?`)) return;
    editing.setShapes(shapes.filter((candidate) => candidate.id !== shape.id));
    if (shape.id === shapeId) onBack();
  };

  return (
    <main className="min-h-full bg-background px-6 pb-10 pt-24 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {!selected ? (
          <ShapeCollection
            shapes={filtered}
            total={shapes.length}
            query={query}
            sort={sort}
            onQueryChange={setQuery}
            onSortChange={setSort}
            onCreate={createShape}
            onOpen={onOpenShape}
            onDuplicate={duplicateShape}
            onDelete={deleteShape}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <SaveStatus saving={saving} error={saveError} retry={retrySave} />
            {invalidReason ? <ValidationSummary reason={invalidReason} /> : null}
            <ShapeEditor
              key={selected.id}
              shape={selected}
              shapes={shapes}
              editing={editing}
              onBack={onBack}
              onOpenShape={onOpenShape}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function SaveStatus({
  saving,
  error,
  retry,
}: {
  saving: boolean;
  error: Error | null;
  retry(): void;
}) {
  if (saving)
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Saving…
      </p>
    );
  if (error)
    return (
      <p
        className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        role="alert"
      >
        <span>Couldn’t save your changes: {error.message}</span>
        <button type="button" className="font-medium underline" onClick={retry}>
          Retry
        </button>
      </p>
    );
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      Saved as draft
    </p>
  );
}

function ValidationSummary({ reason }: { reason: string }) {
  return (
    <div
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      role="alert"
    >
      <strong>Publish unavailable.</strong> {reason}
    </div>
  );
}

type ShapeCollectionProps = {
  shapes: Shape[];
  total: number;
  query: string;
  sort: "name" | "recent";
  onQueryChange(value: string): void;
  onSortChange(value: "name" | "recent"): void;
  onCreate(): void;
  onOpen(shapeId: string): void;
  onDuplicate(shape: Shape): void;
  onDelete(shape: Shape): void;
};

function ShapeCollection({
  shapes,
  total,
  query,
  sort,
  onQueryChange,
  onSortChange,
  onCreate,
  onOpen,
  onDuplicate,
  onDelete,
}: ShapeCollectionProps) {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Show data
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Shapes</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reusable structured Types for this Show.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm"
          onClick={onCreate}
        >
          <PlusIcon className="size-4" />
          Create Shape
        </button>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-60 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            aria-label="Search Shapes"
            placeholder="Search Shapes"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            value={sort}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            onChange={(event) => onSortChange(event.target.value as "name" | "recent")}
          >
            <option value="name">Name</option>
            <option value="recent">Recently changed</option>
          </select>
        </label>
        <span className="text-sm text-muted-foreground">
          {total} {total === 1 ? "Shape" : "Shapes"}
        </span>
      </div>
      {total === 0 ? (
        <EmptyShapes hasQuery={query.length > 0} onCreate={onCreate} />
      ) : shapes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No Shapes match “{query}”.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shapes.map((shape) => (
            <ShapeCard
              key={shape.id}
              shape={shape}
              shapes={shapes}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}

function EmptyShapes({ hasQuery, onCreate }: { hasQuery: boolean; onCreate(): void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-20 text-center">
      <ShapesIcon className="size-10 text-muted-foreground/60" />
      <h2 className="mt-4 text-lg font-semibold">
        {hasQuery ? "No matching Shapes" : "No Shapes yet"}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {hasQuery
          ? "Try a different search."
          : "Create a Shape when you need a reusable structured value."}
      </p>
      {!hasQuery ? (
        <button
          type="button"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={onCreate}
        >
          <PlusIcon className="size-4" />
          Create Shape
        </button>
      ) : null}
    </div>
  );
}

function ShapeCard({
  shape,
  shapes,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  shape: Shape;
  shapes: readonly Shape[];
  onOpen(id: string): void;
  onDuplicate(shape: Shape): void;
  onDelete(shape: Shape): void;
}) {
  const usedBy = shapes.filter(
    (candidate) => candidate.id !== shape.id && shapeUsesShape(candidate, shape.id),
  );
  return (
    <article className="group rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md">
      <button type="button" className="block w-full text-left" onClick={() => onOpen(shape.id)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{shape.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {shape.fields.length} {shape.fields.length === 1 ? "Field" : "Fields"}
            </p>
          </div>
          <ShapesIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {shape.fields.slice(0, 3).map((field) => (
            <span
              key={field.id}
              className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              {field.name}
            </span>
          ))}
          {shape.fields.length > 3 ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              +{shape.fields.length - 3}
            </span>
          ) : null}
        </div>
      </button>
      <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {usedBy.length > 0 ? `Used by ${usedBy.length}` : "Not used yet"}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`Duplicate ${shape.name}`}
            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => onDuplicate(shape)}
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${shape.name}`}
            disabled={usedBy.length > 0}
            title={usedBy.length > 0 ? "This Shape is used by another Shape." : undefined}
            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => onDelete(shape)}
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function ShapeEditor({
  shape,
  shapes,
  editing,
  onBack,
  onOpenShape,
}: {
  shape: Shape;
  shapes: readonly Shape[];
  editing: GraphEditing;
  onBack(): void;
  onOpenShape(shapeId: string): void;
}) {
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(
    shape.fields[0]?.id ?? null,
  );
  const selectedField = shape.fields.find((field) => field.id === selectedFieldId) ?? null;
  const replaceShape = useCallback(
    (update: (current: Shape) => Shape) => editing.setShapes(updateShape(shapes, shape.id, update)),
    [editing, shape.id, shapes],
  );
  const renameShape = (name: string) => replaceShape((current) => ({ ...current, name }));
  const addField = () => {
    const name = nextName(
      shape.fields.map((field) => field.name),
      "newField",
    );
    const field: ShapeField = {
      id: makeId("field"),
      name,
      type: "text",
      required: false,
      defaultValue: null,
    };
    replaceShape((current) => ({ ...current, fields: [...current.fields, field] }));
    setSelectedFieldId(field.id);
  };
  const duplicateField = (field: ShapeField) => {
    const copy: ShapeField = {
      ...field,
      id: makeNameId(shape.fields),
      name: nextName(
        shape.fields.map((candidate) => candidate.name),
        `${field.name}Copy`,
      ),
    };
    replaceShape((current) => ({ ...current, fields: [...current.fields, copy] }));
    setSelectedFieldId(copy.id);
  };
  const deleteField = (field: ShapeField) => {
    if (!window.confirm(`Delete Field “${field.name}”?`)) return;
    replaceShape((current) => ({
      ...current,
      fields: current.fields.filter((candidate) => candidate.id !== field.id),
    }));
    setSelectedFieldId((current) => (current === field.id ? null : current));
  };
  const updateField = (fieldId: string, update: Partial<ShapeField>) =>
    replaceShape((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? { ...field, ...update } : field,
      ),
    }));
  const reorderFields = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) return;
      const source = event.operation.source;
      const target = event.operation.target;
      if (
        !source ||
        !target ||
        !isSortable(source) ||
        !isSortable(target) ||
        typeof source.id !== "string" ||
        typeof target.id !== "string"
      )
        return;
      replaceShape((current) => {
        const from = current.fields.findIndex((field) => field.id === source.id);
        const to = current.fields.findIndex((field) => field.id === target.id);
        if (from < 0 || to < 0 || from === to) return current;
        const fields = [...current.fields];
        const [moved] = fields.splice(from, 1);
        if (!moved) return current;
        fields.splice(to, 0, moved);
        return { ...current, fields };
      });
    },
    [replaceShape],
  );
  const nameForm = useForm({
    defaultValues: { name: shape.name },
    onSubmit: ({ value }) => renameShape(value.name),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label="Back to Shapes"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted"
          onClick={onBack}
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void nameForm.handleSubmit();
            }}
          >
            <nameForm.Field
              name="name"
              validators={{
                onChange: ({ value }) =>
                  shapeNameSchema.safeParse(value).success
                    ? undefined
                    : shapeNameSchema.safeParse(value).error?.issues[0]?.message,
              }}
            >
              {(field) => (
                <input
                  aria-label="Shape name"
                  value={field.state.value}
                  className="w-full max-w-md bg-transparent text-2xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={() => {
                    field.handleBlur();
                    void nameForm.handleSubmit();
                  }}
                />
              )}
            </nameForm.Field>
          </form>
          <p className="mt-1 text-sm text-muted-foreground">
            {shape.fields.length} {shape.fields.length === 1 ? "Field" : "Fields"} · Draft autosaved
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          onClick={addField}
        >
          <PlusIcon className="size-4" />
          Add Field
        </button>
      </div>
      <div className="grid min-h-128 gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-border bg-muted/30 p-3 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ordered Fields
            </span>
            <span className="text-xs text-muted-foreground">{shape.fields.length}</span>
          </div>
          <DragDropProvider sensors={sensors} onDragEnd={reorderFields}>
            <div className="flex flex-col gap-1">
              {shape.fields.map((field, index) => (
                <FieldRailItem
                  key={field.id}
                  field={field}
                  index={index}
                  selected={field.id === selectedFieldId}
                  onSelect={setSelectedFieldId}
                />
              ))}
            </div>
          </DragDropProvider>
          {shape.fields.length === 0 ? (
            <button
              type="button"
              className="mt-3 w-full rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:bg-background"
              onClick={addField}
            >
              Add your first Field
            </button>
          ) : null}
        </aside>
        <section className="p-6 sm:p-8">
          {selectedField ? (
            <FieldDetails
              key={selectedField.id}
              field={selectedField}
              shapes={shapes}
              currentShapeId={shape.id}
              onChange={(update) => updateField(selectedField.id, update)}
              onDuplicate={() => duplicateField(selectedField)}
              onDelete={() => deleteField(selectedField)}
              onOpenShape={onOpenShape}
            />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center text-center text-sm text-muted-foreground">
              Select a Field to edit it.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function makeNameId(fields: readonly ShapeField[]): string {
  let id = makeId("field");
  while (fields.some((field) => field.id === id)) id = makeId("field");
  return id;
}

function FieldRailItem({
  field,
  index,
  selected,
  onSelect,
}: {
  field: ShapeField;
  index: number;
  selected: boolean;
  onSelect(id: string): void;
}) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({
    id: field.id,
    index,
    group: "shape-fields",
  });
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2",
        selected ? "bg-background shadow-sm ring-1 ring-border" : "hover:bg-background/70",
        isDragging ? "opacity-50" : "",
        isDropTarget ? "ring-2 ring-primary" : "",
      )}
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Reorder ${field.name}`}
        aria-roledescription="sortable"
        className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm font-medium"
        onClick={() => onSelect(field.id)}
      >
        {field.name}
      </button>
      <span className="text-[10px] text-muted-foreground">{typeLabel(field.type)}</span>
    </div>
  );
}

function FieldDetails({
  field,
  shapes,
  currentShapeId,
  onChange,
  onDuplicate,
  onDelete,
  onOpenShape,
}: {
  field: ShapeField;
  shapes: readonly Shape[];
  currentShapeId: string;
  onChange(update: Partial<ShapeField>): void;
  onDuplicate(): void;
  onDelete(): void;
  onOpenShape(shapeId: string): void;
}) {
  const form = useForm({
    defaultValues: { name: field.name },
    onSubmit: ({ value }) => onChange({ name: value.name }),
  });
  const referencesCycle = (type: Type) => {
    if (typeof type === "string") return false;
    const target = referencedShapeId(type);
    return target ? shapeReferences(shapes, target, currentShapeId) : false;
  };
  const arrayItemType =
    typeof field.type === "object" && field.type.kind === "array" ? field.type.of : null;
  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Field details
          </p>
          <h2 className="mt-1 text-xl font-semibold">{field.name}</h2>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`Duplicate ${field.name}`}
            className="rounded p-2 text-muted-foreground hover:bg-muted"
            onClick={onDuplicate}
          >
            <MoreHorizontalIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${field.name}`}
            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-8 grid gap-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) =>
                fieldNameSchema.safeParse(value).success
                  ? undefined
                  : fieldNameSchema.safeParse(value).error?.issues[0]?.message,
            }}
          >
            {(nameField) => (
              <label className="grid gap-2 text-sm font-medium">
                Name
                <input
                  value={nameField.state.value}
                  aria-invalid={nameField.state.meta.errors.length > 0}
                  className="h-10 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
                  onChange={(event) => {
                    nameField.handleChange(event.target.value);
                    onChange({ name: event.target.value });
                  }}
                  onBlur={nameField.handleBlur}
                />
                {nameField.state.meta.errors[0] ? (
                  <span className="text-xs text-destructive">{nameField.state.meta.errors[0]}</span>
                ) : null}
              </label>
            )}
          </form.Field>
        </form>
        <label className="grid gap-2 text-sm font-medium">
          Type
          <TypeSelect
            value={field.type}
            shapes={shapes}
            includeArray
            triggerClassName="w-full"
            onValueChange={(type) => {
              if (!referencesCycle(type))
                onChange({ type, defaultValue: defaultValueForType(type, shapes) });
            }}
            optionDisabled={(option) => referencesCycle(option.value)}
          />
        </label>
        {arrayItemType ? (
          <label className="grid gap-2 text-sm font-medium">
            Array item Type
            <TypeSelect
              value={arrayItemType}
              shapes={shapes}
              includeArray={false}
              triggerClassName="w-full"
              onValueChange={(type) => {
                const nextType = { kind: "array" as const, of: type };
                if (!referencesCycle(nextType))
                  onChange({ type: nextType, defaultValue: defaultValueForType(nextType, shapes) });
              }}
              optionDisabled={(option) => referencesCycle({ kind: "array", of: option.value })}
            />
          </label>
        ) : null}
        <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 text-sm font-medium">
          <span>
            <span className="block">Required</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Required Fields must always have a starting value.
            </span>
          </span>
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => {
              const required = event.target.checked;
              onChange({
                required,
                defaultValue:
                  required && (field.defaultValue === null || field.defaultValue === undefined)
                    ? defaultValueForType(field.type, shapes)
                    : field.defaultValue,
              });
            }}
          />
        </label>
        <ShapeDefaultEditor
          field={field}
          onChange={onChange}
          shapes={shapes}
          onOpenShape={onOpenShape}
        />
      </div>
    </div>
  );
}

function typeLabel(type: Type): string {
  if (typeof type === "string") return type === "datetime" ? "date/time" : type;
  if (type.kind === "array") return "array";
  return "Shape";
}

function referencedShapeId(type: Type): string | null {
  if (typeof type === "string") return null;
  if (type.kind === "shape") return type.shapeId;
  return typeof type.of === "object" && type.of.kind === "shape" ? type.of.shapeId : null;
}
