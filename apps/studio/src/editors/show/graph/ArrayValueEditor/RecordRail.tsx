import { Button, ChevronRight, Grid2X2, Plus } from "@mechane/design-system";

import { previewValue } from "../inspector/source-values-helpers";
import type { ShapeRecord } from "./types";

export function RecordRail({
  records,
  selectedId,
  onSelect,
  onAdd,
  editMode,
}: {
  records: ShapeRecord[];
  selectedId: string;
  onSelect(id: string): void;
  onAdd(): void;
  editMode: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/15 p-2">
      <div className="mb-2 flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground">
        <Grid2X2 className="size-3.5" /> Records
      </div>
      <div className="space-y-1">
        {records.map((record, index) => (
          <button
            type="button"
            key={record.id}
            onClick={() => onSelect(record.id)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left ${record.id === selectedId ? "bg-primary/10 text-foreground ring-1 ring-primary/20" : "hover:bg-muted"}`}
          >
            <span className="font-mono text-[10px] text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {previewValue(record.fields[Object.keys(record.fields)[0] ?? ""])}
            </span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full border border-dashed border-border"
        onClick={onAdd}
        disabled={!editMode}
      >
        <Plus /> Add
      </Button>
    </div>
  );
}
