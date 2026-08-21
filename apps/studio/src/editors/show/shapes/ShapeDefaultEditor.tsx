import { PlusIcon, Trash2Icon } from "@mechane/design-system";
import type { Shape, ShapeField, Type } from "@mechane/domain";
import { defaultValueForType } from "@mechane/domain";

export type ShapeDefaultEditorProps = {
  field: ShapeField;
  shapes: readonly Shape[];
  onChange(update: Partial<ShapeField>): void;
  onOpenShape(shapeId: string): void;
};

export function ShapeDefaultEditor({ field, shapes, onChange, onOpenShape }: ShapeDefaultEditorProps) {
  if (!field.required && (field.defaultValue === null || field.defaultValue === undefined)) {
    return <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No starting value. This Field is optional.</div>;
  }
  return <ValueEditor type={field.type} value={field.defaultValue} shapes={shapes} label={`Default ${typeLabel(field.type)}`} onChange={(value) => onChange({ defaultValue: value })} onOpenShape={onOpenShape} />;
}

function ValueEditor({ type, value, shapes, label, onChange, onOpenShape }: { type: Type; value: unknown; shapes: readonly Shape[]; label: string; onChange(value: unknown): void; onOpenShape(shapeId: string): void }) {
  if (typeof type === "string") return <PrimitiveEditor type={type} value={value} label={label} onChange={onChange} />;
  if (type.kind === "array") return <ArrayEditor type={type.of} value={value} shapes={shapes} label={label} onChange={onChange} onOpenShape={onOpenShape} />;
  if (type.kind === "shape") {
    const shape = shapes.find((candidate) => candidate.id === type.shapeId);
    if (!shape) return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">The referenced Shape is unavailable.</div>;
    const objectValue =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    return <section className="rounded-lg border border-border p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{shape.name}</p></div><button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onOpenShape(shape.id)}>Open Shape</button></div><div className="mt-4 grid gap-4">{shape.fields.map((field) => <ValueEditor key={field.id} type={field.type} value={objectValue[field.id] ?? defaultValueForType(field.type, shapes)} shapes={shapes} label={field.name} onChange={(next) => onChange({ ...objectValue, [field.id]: next })} onOpenShape={onOpenShape} />)}</div></section>;
  }
  return null;
}

function ArrayEditor({ type, value, shapes, label, onChange, onOpenShape }: { type: Type; value: unknown; shapes: readonly Shape[]; label: string; onChange(value: unknown): void; onOpenShape(shapeId: string): void }) {
  const items = Array.isArray(value) ? value : [];
  return <section className="rounded-lg border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{label}</p><button type="button" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted" onClick={() => onChange([...items, defaultValueForType(type, shapes)])}><PlusIcon className="size-3" />Add item</button></div><div className="mt-4 grid gap-3">{items.map((item, index) => <div key={index} className="rounded-md border border-border bg-muted/20 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Item {index + 1}</span><button type="button" aria-label={`Remove item ${index + 1}`} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Trash2Icon className="size-3" /></button></div><ValueEditor type={type} value={item} shapes={shapes} label={`Item ${index + 1}`} onChange={(next) => onChange(items.map((candidate, itemIndex) => itemIndex === index ? next : candidate))} onOpenShape={onOpenShape} /></div>)}</div></section>;
}

function PrimitiveEditor({ type, value, label, onChange }: { type: Extract<Type, string>; value: unknown; label: string; onChange(value: unknown): void }) {
  if (type === "boolean") return <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm font-medium">{label}<input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /></label>;
  const inputType = type === "number" ? "number" : type === "date" ? "date" : type === "datetime" ? "datetime-local" : "text";
  return <label className="grid gap-2 text-sm font-medium">{label}<input type={inputType} value={value === null || value === undefined ? "" : String(value)} className="h-9 rounded-md border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)} /></label>;
}


function typeLabel(type: Type): string {
  if (typeof type === "string") return type === "datetime" ? "date/time" : type;
  if (type.kind === "array") return `Array of ${typeLabel(type.of)}`;
  if (type.kind === "shape") return "Shape";
  return "Object";
}
