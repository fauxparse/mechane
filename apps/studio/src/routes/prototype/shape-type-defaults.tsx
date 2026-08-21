// PROTOTYPE — throwaway UI exploration for issue #323.
// Decision under test: a normal Field form, not a type builder.
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  PlusIcon,
  Trash2Icon,
} from "@mechane/design-system";
import { useState } from "react";

export const Route = createFileRoute("/prototype/shape-type-defaults")({
  component: ShapeTypeDefaultsPrototype,
});

type ItemType = "Text" | "Number" | "Boolean" | "Image" | "Color" | "Date" | "Date and time" | "Attendee" | "Vote";
type TypeMode = "single" | "array";

type ArrayItem = {
  id: number;
  name: string;
  role: string;
};

const TYPE_OPTIONS: Array<{ value: ItemType; label: string; group: "basic" | "shape" }> = [
  { value: "Text", label: "Text", group: "basic" },
  { value: "Number", label: "Number", group: "basic" },
  { value: "Boolean", label: "Boolean", group: "basic" },
  { value: "Image", label: "Image", group: "basic" },
  { value: "Color", label: "Color", group: "basic" },
  { value: "Date", label: "Date", group: "basic" },
  { value: "Date and time", label: "Date and time", group: "basic" },
  { value: "Attendee", label: "Attendee Shape", group: "shape" },
  { value: "Vote", label: "Vote Shape", group: "shape" },
];

function ShapeTypeDefaultsPrototype() {
  const [typeMode, setTypeMode] = useState<TypeMode>("array");
  const [itemType, setItemType] = useState<ItemType>("Attendee");
  const [required, setRequired] = useState(true);
  const [hasDefault, setHasDefault] = useState(true);
  const [simpleDefault, setSimpleDefault] = useState("Macbeth");
  const [arrayItems, setArrayItems] = useState<ArrayItem[]>([
    { id: 1, name: "Ada", role: "Director" },
    { id: 2, name: "Lin", role: "Stage manager" },
  ]);
  const [nextItemId, setNextItemId] = useState(3);

  const arrayLabel = `Array of ${itemLabel(itemType)}`;

  const setMode = (next: TypeMode) => {
    setTypeMode(next);
    if (next === "array") setRequired(false);
  };

  const addArrayItem = () => {
    setArrayItems((current) => [...current, { id: nextItemId, name: "New attendee", role: "" }]);
    setNextItemId((current) => current + 1);
  };

  const updateArrayItem = (id: number, update: Partial<ArrayItem>) => {
    setArrayItems((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)));
  };

  const removeArrayItem = (id: number) => {
    setArrayItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <main className="min-h-full bg-background px-6 pb-16 pt-24 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="border-b border-border pb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Prototype · Shape Field</p>
          <h1 className="text-3xl font-semibold tracking-tight">Create a Field</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use ordinary controls to describe the value this Field holds.</p>
        </header>

        <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()}>
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="grid gap-5">
              <label className="grid gap-2 text-sm font-medium">
                Field name
                <input defaultValue="attendees" className="h-10 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <span className="text-xs font-normal text-muted-foreground">Used in expressions. Use letters, numbers, and underscores.</span>
              </label>

              <div className="grid gap-2 text-sm font-medium">
                <span>Type</span>
                <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <label className="sr-only" htmlFor="type-mode">Value shape</label>
                  <select id="type-mode" value={typeMode} className="h-10 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setMode(event.target.value as TypeMode)}>
                    <option value="single">Single value</option>
                    <option value="array">Array of…</option>
                  </select>
                  <label className="sr-only" htmlFor="item-type">Value type</label>
                  <select id="item-type" value={itemType} className="h-10 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => setItemType(event.target.value as ItemType)}>
                    <optgroup label={typeMode === "array" ? "Array item type" : "Value type"}>
                      {TYPE_OPTIONS.filter((option) => option.group === "basic").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </optgroup>
                    <optgroup label="Existing Shapes">
                      {TYPE_OPTIONS.filter((option) => option.group === "shape").map((option) => <option key={option.value} value={option.value} disabled={option.value === "Attendee"}>{option.value === "Attendee" ? "Attendee Shape (cycle)" : option.label}</option>)}
                    </optgroup>
                  </select>
                </div>
                <span className="text-xs font-normal text-muted-foreground">{typeMode === "array" ? `This Field holds ${arrayLabel.toLowerCase()}.` : `This Field holds a ${itemLabel(itemType).toLowerCase()} value.`}</span>
                {typeMode === "array" ? <span className="text-xs font-normal text-muted-foreground">Arrays of arrays are not offered here; use a named Shape when the value needs more structure.</span> : null}
              </div>

              <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 text-sm font-medium">
                <span><span className="block">Required</span><span className="mt-1 block text-xs font-normal text-muted-foreground">Required Fields must have a starting value.</span></span>
                <input type="checkbox" checked={required} onChange={(event) => { setRequired(event.target.checked); if (event.target.checked) setHasDefault(true); }} />
              </label>
            </div>
          </section>

          <DefaultSection
            typeMode={typeMode}
            itemType={itemType}
            required={required}
            hasDefault={hasDefault}
            simpleDefault={simpleDefault}
            arrayItems={arrayItems}
            onHasDefault={setHasDefault}
            onSimpleDefault={setSimpleDefault}
            onAddArrayItem={addArrayItem}
            onUpdateArrayItem={updateArrayItem}
            onRemoveArrayItem={removeArrayItem}
          />

          <CycleNotice itemType={itemType} />

          <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
            <button type="button" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm">Done</button>
          </div>
        </form>
      </div>
    </main>
  );
}

type DefaultSectionProps = {
  typeMode: TypeMode;
  itemType: ItemType;
  required: boolean;
  hasDefault: boolean;
  simpleDefault: string;
  arrayItems: ArrayItem[];
  onHasDefault(value: boolean): void;
  onSimpleDefault(value: string): void;
  onAddArrayItem(): void;
  onUpdateArrayItem(id: number, update: Partial<ArrayItem>): void;
  onRemoveArrayItem(id: number): void;
};

function DefaultSection({ typeMode, itemType, required, hasDefault, simpleDefault, arrayItems, onHasDefault, onSimpleDefault, onAddArrayItem, onUpdateArrayItem, onRemoveArrayItem }: DefaultSectionProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold">Starting value</h2><p className="mt-1 text-sm text-muted-foreground">What should this Field contain when a Run starts?</p></div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{typeMode === "array" ? `Array of ${itemLabel(itemType)}` : itemLabel(itemType)}</span>
      </div>
      {!required ? <div className="mt-5 flex rounded-md bg-muted p-1 text-sm"><button type="button" className={`flex-1 rounded px-3 py-2 ${hasDefault ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`} onClick={() => onHasDefault(true)}>Give it a starting value</button><button type="button" className={`flex-1 rounded px-3 py-2 ${!hasDefault ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`} onClick={() => onHasDefault(false)}>Start with no value</button></div> : null}
      {!hasDefault && !required ? <div className="mt-5 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">This Field starts empty. Expressions that read it before a value arrives will report that it is absent.</div> : null}
      {hasDefault || required ? <div className="mt-5">{typeMode === "array" ? <ArrayDefault itemType={itemType} items={arrayItems} onAdd={onAddArrayItem} onUpdate={onUpdateArrayItem} onRemove={onRemoveArrayItem} /> : <SimpleDefault itemType={itemType} value={simpleDefault} onChange={onSimpleDefault} />}</div> : null}
    </section>
  );
}

function ArrayDefault({ itemType, items, onAdd, onUpdate, onRemove }: { itemType: ItemType; items: ArrayItem[]; onAdd(): void; onUpdate(id: number, update: Partial<ArrayItem>): void; onRemove(id: number): void }) {
  if (itemType === "Attendee") return <div className="grid gap-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">Attendee items</p><button type="button" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={onAdd}><PlusIcon className="size-4" />Add attendee</button></div>{items.map((item, index) => <div key={item.id} className="rounded-lg border border-border p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attendee {index + 1}</span><button type="button" aria-label={`Remove attendee ${index + 1}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => onRemove(item.id)}><Trash2Icon className="size-4" /></button></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium">Name<input value={item.name} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onUpdate(item.id, { name: event.target.value })} /></label><label className="grid gap-1 text-xs font-medium">Role<input value={item.role} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onUpdate(item.id, { role: event.target.value })} /></label></div></div>)}</div>;
  return <div className="grid gap-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">Items</p><button type="button" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted" onClick={onAdd}><PlusIcon className="size-4" />Add item</button></div>{items.map((item, index) => <div key={item.id} className="flex items-center gap-2"><span className="w-16 text-xs text-muted-foreground">Item {index + 1}</span><input value={item.name} className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onUpdate(item.id, { name: event.target.value })} /><button type="button" aria-label={`Remove item ${index + 1}`} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => onRemove(item.id)}><Trash2Icon className="size-4" /></button></div>)}</div>;
}

function SimpleDefault({ itemType, value, onChange }: { itemType: ItemType; value: string; onChange(value: string): void }) {
  return <label className="grid gap-2 text-sm font-medium">Default {itemLabel(itemType).toLowerCase()}<input value={value} className="h-10 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onChange(event.target.value)} /></label>;
}

function CycleNotice({ itemType }: { itemType: ItemType }) {
  if (itemType !== "Attendee") return null;
  return <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" /><div><p className="font-medium text-amber-900 dark:text-amber-200">Some Shapes are unavailable</p><p className="mt-1 text-xs text-amber-800/80 dark:text-amber-100/80">Shapes that would refer back to this Shape are disabled in the Shape list.</p></div></div>;
}

function itemLabel(type: ItemType): string {
  return TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}
