// PROTOTYPE — throwaway UI exploration for issue #322.
// Question: which Shape Field editing layout makes ordering and field details
// easiest to scan? Variants are switchable with ?variant=A|B|C.
import { defaultPreset, PointerActivationConstraints } from "@dnd-kit/dom";
import type { DragEndEvent } from "@dnd-kit/react";
import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  XIcon,
} from "@mechane/design-system";
import { useCallback, useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/prototype/shape-fields")({
  component: ShapeFieldsPrototype,
});

type Variant = "A" | "B" | "C";
type FieldType = "Text" | "Number" | "Boolean" | "Date" | "Shape" | "List";

type Field = {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  defaultValue: string;
};

const VARIANTS: Record<Variant, string> = {
  A: "Rows + inspector",
  B: "Field cards",
  C: "Split workspace",
};

const INITIAL_FIELDS: Field[] = [
  { id: "name", name: "name", type: "Text", required: true, defaultValue: '"Macbeth"' },
  { id: "score", name: "score", type: "Number", required: true, defaultValue: "0" },
  { id: "opening", name: "openingDate", type: "Date", required: false, defaultValue: "Absent" },
  { id: "featured", name: "featured", type: "Boolean", required: false, defaultValue: "false" },
];

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

function readVariant(): Variant {
  const value = new URLSearchParams(window.location.search).get("variant");
  return value === "B" || value === "C" ? value : "A";
}

function ShapeFieldsPrototype() {
  const [variant, setVariant] = useState<Variant>(readVariant);
  const [fields, setFields] = useState(INITIAL_FIELDS);
  const [selectedId, setSelectedId] = useState(INITIAL_FIELDS[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const onPopState = () => setVariant(readVariant());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectVariant = (next: Variant) => {
    const params = new URLSearchParams(window.location.search);
    params.set("variant", next);
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
    setVariant(next);
  };

  const addField = () => {
    const id = `field-${fields.length + 1}`;
    const field = {
      id,
      name: "newField",
      type: "Text" as const,
      required: false,
      defaultValue: "Absent",
    };
    setFields((current) => [...current, field]);
    setSelectedId(id);
    setAnnouncement("Added Field newField. Field name is focused in the editor.");
  };

  const updateField = (id: string, update: Partial<Field>) => {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...update } : field)));
  };

  const deleteField = (id: string) => {
    const deleted = fields.find((field) => field.id === id);
    setFields((current) => current.filter((field) => field.id !== id));
    setSelectedId((current) => (current === id ? null : current));
    if (deleted) setAnnouncement(`Deleted Field ${deleted.name}.`);
  };

  const finishDrag = useCallback(
    (event: DragEndEvent) => {
      if (event.canceled) return;
      const source = event.operation.source;
      const target = event.operation.target;
      if (!source || !target || !isSortable(source) || !isSortable(target)) return;
      if (typeof source.id !== "string" || typeof target.id !== "string" || source.id === target.id) return;

      setFields((current) => {
        const from = current.findIndex((field) => field.id === source.id);
        const to = current.findIndex((field) => field.id === target.id);
        if (from < 0 || to < 0 || from === to) return current;
        const next = [...current];
        const [moved] = next.splice(from, 1);
        if (!moved) return current;
        next.splice(to, 0, moved);
        setAnnouncement(`Moved Field ${moved.name} to position ${to + 1} of ${next.length}.`);
        return next;
      });
    },
    [],
  );

  const visibleFields = useMemo(
    () => fields.filter((field) => field.name.toLowerCase().includes(search.toLowerCase())),
    [fields, search],
  );
  const selected = fields.find((field) => field.id === selectedId) ?? null;

  return (
    <main className="min-h-full bg-background px-6 pb-28 pt-24 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <PrototypeHeader
          variant={variant}
          fieldsCount={fields.length}
          search={search}
          onSearch={setSearch}
          onAdd={addField}
        />
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
        {variant === "A" ? (
          <RowsAndInspector
            fields={visibleFields}
            selected={selected}
            onSelect={setSelectedId}
            onUpdate={updateField}
            onDelete={deleteField}
            onDragEnd={finishDrag}
          />
        ) : null}
        {variant === "B" ? (
          <FieldCards
            fields={visibleFields}
            selected={selected}
            onSelect={setSelectedId}
            onUpdate={updateField}
            onDelete={deleteField}
            onDragEnd={finishDrag}
          />
        ) : null}
        {variant === "C" ? (
          <SplitWorkspace
            fields={visibleFields}
            selected={selected}
            onSelect={setSelectedId}
            onUpdate={updateField}
            onDelete={deleteField}
            onDragEnd={finishDrag}
          />
        ) : null}
      </div>
      <PrototypeSwitcher variant={variant} onSelect={selectVariant} />
    </main>
  );
}

type PrototypeHeaderProps = {
  variant: Variant;
  fieldsCount: number;
  search: string;
  onSearch(value: string): void;
  onAdd(): void;
};

function PrototypeHeader({ variant, fieldsCount, search, onSearch, onAdd }: PrototypeHeaderProps) {
  return (
    <header className="flex flex-col gap-5 border-b border-border pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Prototype · Shape editor
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Audience member</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {VARIANTS[variant]} · Four ordered Fields · Draft saved just now
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Draft saved
          </span>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm"
          >
            Publish-ready
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative block min-w-64 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            aria-label="Search Fields"
            placeholder="Search Fields"
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
          onClick={onAdd}
        >
          <PlusIcon className="size-4" />
          Add Field
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-2 py-1 font-medium">Fields</span>
        <span>{fieldsCount} ordered values</span>
        <span aria-hidden="true">·</span>
        <span>Drag to reorder · Enter to inspect</span>
      </div>
    </header>
  );
}

type FieldListProps = {
  fields: Field[];
  selected: Field | null;
  onSelect(id: string): void;
  onUpdate(id: string, update: Partial<Field>): void;
  onDelete(id: string): void;
  onDragEnd(event: DragEndEvent): void;
};

function RowsAndInspector({ fields, selected, onSelect, onUpdate, onDelete, onDragEnd }: FieldListProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="mb-2 grid grid-cols-[2rem_minmax(8rem,1fr)_8rem_6rem_8rem_2rem] gap-3 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span />
          <span>Name</span>
          <span>Type</span>
          <span>Presence</span>
          <span>Default</span>
          <span />
        </div>
        <SortableFieldList
          fields={fields}
          selected={selected}
          selectedId={selected?.id ?? null}
          onSelect={onSelect}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDragEnd={onDragEnd}
        />
      </section>
      <FieldInspector field={selected} onUpdate={onUpdate} onClose={() => selected && onSelect(selected.id)} />
    </div>
  );
}

function FieldCards({ fields, selected, onSelect, onUpdate, onDelete, onDragEnd }: FieldListProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <DragDropProvider sensors={sensors} onDragEnd={onDragEnd}>
        {fields.map((field, index) => (
          <SortableFieldCard
            key={field.id}
            field={field}
            index={index}
            selected={field.id === selected?.id}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </DragDropProvider>
    </section>
  );
}

function SplitWorkspace({ fields, selected, onSelect, onUpdate, onDelete, onDragEnd }: FieldListProps) {
  return (
    <div className="grid min-h-[34rem] gap-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-muted/30 p-3 lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordered Fields</span>
          <span className="text-xs text-muted-foreground">{fields.length}</span>
        </div>
        <DragDropProvider sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex flex-col gap-1">
            {fields.map((field, index) => (
              <SortableFieldNav
                key={field.id}
                field={field}
                index={index}
                selected={field.id === selected?.id}
                onSelect={onSelect}
              />
            ))}
          </div>
        </DragDropProvider>
      </aside>
      <div className="p-6 sm:p-8">
        <FieldInspector field={selected} onUpdate={onUpdate} onClose={() => undefined} spacious />
        {selected ? (
          <div className="mt-8 border-t border-border pt-6">
            <h2 className="text-sm font-semibold">Preview in order</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The left rail keeps order visible while the right pane gives the selected Field room for detail.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type SortableFieldProps = {
  field: Field;
  index: number;
  selected?: boolean;
  onSelect(id: string): void;
  onUpdate(id: string, update: Partial<Field>): void;
  onDelete(id: string): void;
};

function SortableFieldList({ fields, selectedId, onSelect, onUpdate, onDelete, onDragEnd }: FieldListProps & { selectedId: string | null }) {
  return (
    <DragDropProvider sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-1">
        {fields.map((field, index) => (
          <SortableFieldRow
            key={field.id}
            field={field}
            index={index}
            group="rows"
            selected={field.id === selectedId}
            onSelect={onSelect}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

function SortableFieldRow({ field, index, group, selected, onSelect, onUpdate, onDelete }: SortableFieldProps & { group: string }) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({ id: field.id, index, group });
  return (
    <div
      ref={ref}
      className={`grid grid-cols-[2rem_minmax(8rem,1fr)_8rem_6rem_8rem_2rem] items-center gap-3 rounded-lg border px-3 py-2 transition ${
        selected ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"
      } ${isDragging ? "opacity-50" : ""} ${isDropTarget ? "ring-2 ring-primary" : ""}`}
    >
      <DragHandle name={field.name} handleRef={handleRef} />
      <button type="button" className="min-w-0 text-left" onClick={() => onSelect(field.id)}>
        <span className="block truncate text-sm font-medium">{field.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{field.id}</span>
      </button>
      <TypeBadge type={field.type} />
      <PresenceBadge required={field.required} />
      <span className="truncate text-xs text-muted-foreground">{field.defaultValue}</span>
      <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Delete ${field.name}`} onClick={() => onDelete(field.id)}>
        <Trash2Icon className="size-4" />
      </button>
      <InlineNameInput field={field} onUpdate={onUpdate} />
    </div>
  );
}

function SortableFieldCard({ field, index, selected, onSelect, onUpdate, onDelete }: SortableFieldProps) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({ id: field.id, index, group: "cards" });
  return (
    <article ref={ref} className={`rounded-xl border bg-card p-4 shadow-sm transition ${selected ? "border-primary ring-2 ring-primary/15" : "border-border"} ${isDragging ? "opacity-50" : ""} ${isDropTarget ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <DragHandle name={field.name} handleRef={handleRef} />
          <div className="min-w-0">
            <button type="button" className="truncate text-left text-base font-semibold" onClick={() => onSelect(field.id)}>{field.name}</button>
            <p className="mt-1 text-xs text-muted-foreground">{field.id}</p>
          </div>
        </div>
        <button type="button" aria-label={`More actions for ${field.name}`} className="rounded p-1 text-muted-foreground hover:bg-muted"><MoreHorizontalIcon className="size-4" /></button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <TypeBadge type={field.type} />
        <PresenceBadge required={field.required} />
      </div>
      <div className="mt-4 rounded-lg bg-muted/50 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Default</p>
        <p className="mt-1 truncate text-sm">{field.defaultValue}</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => onSelect(field.id)}>{selected ? "Editing details" : "Edit details"}</button>
        <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => onDelete(field.id)}>Delete Field</button>
      </div>
      {selected ? <InlineNameInput field={field} onUpdate={onUpdate} /> : null}
    </article>
  );
}

function SortableFieldNav({
  field,
  index,
  selected,
  onSelect,
}: Pick<SortableFieldProps, "field" | "index" | "selected" | "onSelect">) {
  const { isDragging, isDropTarget, ref, handleRef } = useSortable({ id: field.id, index, group: "nav" });
  return (
    <div ref={ref} className={`flex items-center gap-2 rounded-md px-2 py-2 ${selected ? "bg-background shadow-sm ring-1 ring-border" : "hover:bg-background/70"} ${isDragging ? "opacity-50" : ""} ${isDropTarget ? "ring-2 ring-primary" : ""}`}>
      <DragHandle name={field.name} handleRef={handleRef} />
      <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => onSelect(field.id)}>{field.name}</button>
      <TypeBadge type={field.type} compact />
    </div>
  );
}

function DragHandle({ name, handleRef }: { name: string; handleRef: (element: HTMLElement | null) => void }) {
  return (
    <button ref={handleRef} type="button" aria-label={`Reorder ${name}`} aria-roledescription="sortable" className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
      <GripVerticalIcon className="size-4" />
    </button>
  );
}

function InlineNameInput({ field, onUpdate }: { field: Field; onUpdate(id: string, update: Partial<Field>): void }) {
  return (
    <input
      aria-label={`Name for ${field.name}`}
      value={field.name}
      className="sr-only"
      onChange={(event) => onUpdate(field.id, { name: event.target.value })}
    />
  );
}

function FieldInspector({ field, onUpdate, onClose, spacious = false }: { field: Field | null; onUpdate(id: string, update: Partial<Field>): void; onClose(): void; spacious?: boolean }) {
  if (!field) {
    return <aside className={`rounded-xl border border-dashed border-border bg-muted/20 p-6 ${spacious ? "min-h-64" : "min-h-48"}`}><p className="text-sm text-muted-foreground">Select a Field to inspect its name, Type, presence, and default.</p></aside>;
  }
  return (
    <aside className={`rounded-xl border border-border bg-card p-5 shadow-sm ${spacious ? "max-w-xl" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Field details</p>
          <h2 className="mt-1 text-lg font-semibold">{field.name}</h2>
        </div>
        <button type="button" aria-label="Close Field details" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={onClose}><XIcon className="size-4" /></button>
      </div>
      <div className="mt-6 flex flex-col gap-5">
        <label className="grid gap-2 text-sm font-medium">Name<input value={field.name} className="h-9 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onUpdate(field.id, { name: event.target.value })} /></label>
        <label className="grid gap-2 text-sm font-medium">Type<select value={field.type} className="h-9 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onUpdate(field.id, { type: event.target.value as FieldType })}><option>Text</option><option>Number</option><option>Boolean</option><option>Date</option><option>Shape</option><option>List</option></select></label>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 text-sm font-medium">Required<input type="checkbox" checked={field.required} onChange={(event) => onUpdate(field.id, { required: event.target.checked })} /></label>
        <label className="grid gap-2 text-sm font-medium">Default<input value={field.defaultValue} className="h-9 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onUpdate(field.id, { defaultValue: event.target.value })} /></label>
      </div>
    </aside>
  );
}

function TypeBadge({ type, compact = false }: { type: FieldType; compact?: boolean }) {
  return <span className={`inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium ${compact ? "px-1.5 text-[10px]" : ""}`}>{type}</span>;
}

function PresenceBadge({ required }: { required: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{required ? <CheckIcon className="size-3" /> : null}{required ? "Required" : "Optional"}</span>;
}

function PrototypeSwitcher({ variant, onSelect }: { variant: Variant; onSelect(next: Variant): void }) {
  const variants = Object.keys(VARIANTS) as Variant[];
  const index = variants.indexOf(variant);
  const cycle = (offset: number) => onSelect(variants[(index + offset + variants.length) % variants.length]!);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  return (
    <nav aria-label="Prototype variants" className="fixed inset-x-0 bottom-5 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-background/95 px-2 py-2 shadow-lg backdrop-blur">
      <button type="button" aria-label="Previous variant" className="rounded-full p-2 hover:bg-muted" onClick={() => cycle(-1)}><ChevronLeftIcon className="size-4" /></button>
      <div className="min-w-44 px-3 text-center text-xs font-medium"><span className="text-muted-foreground">{variant}</span> · {VARIANTS[variant]}</div>
      <button type="button" aria-label="Next variant" className="rounded-full p-2 hover:bg-muted" onClick={() => cycle(1)}><ChevronRightIcon className="size-4" /></button>
    </nav>
  );
}
