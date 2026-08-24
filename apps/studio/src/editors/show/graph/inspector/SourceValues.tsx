import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EllipsisIcon,
  PencilIcon,
  RotateCcwIcon,
  Section,
  SectionRow,
  variableTypeIcon,
} from "@mechane/design-system";
import {
  defaultSourceValues,
  fieldsForType,
  formatValuePath,
  type SourceNode,
  valueAtPath,
} from "@mechane/domain";
import { useMemo, useState } from "react";

import type { GraphEditing } from "../../commands/use-graph-editing";
import { InlineValue } from "./ValueEditor";
import { SourceValueDialog } from "./SourceValueDialog";
import type { SourceValueRow } from "./source-value-types";
import { previewValue, sourceValuesEqual, usesModal } from "./source-values-helpers";

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
function SourceValueActions({
  row,
  nodeId,
  editing,
  onEdit,
}: {
  row: SourceValueRow;
  nodeId: string;
  editing: GraphEditing;
  onEdit: () => void;
}) {
  const modal = usesModal(row.type, row.value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="text-muted-foreground"
            aria-label={`More options for ${row.label}`}
          >
            <EllipsisIcon />
          </Button>
        }
      />
      <DropdownMenuContent>
        {modal && (
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon /> Edit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => editing.setSourceFieldDefault(nodeId, row.fieldPath, null)}
          disabled={!row.hasOverride}
        >
          <RotateCcwIcon /> Reset to default
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const SourceValues = ({ node, editing }: { node: SourceNode; editing: GraphEditing }) => {
  const rows = useMemo(() => sourceValueRows(node, editing), [editing, node]);
  const shapes = editing.graph.shapes ?? [];
  const [activeRow, setActiveRow] = useState<SourceValueRow | null>(null);
  return (
    <Section label="Source values">
      {rows.map((row) => {
        const Icon = variableTypeIcon(row.type);
        const modal = usesModal(row.type, row.value);
        const actions = (
          <SourceValueActions
            row={row}
            nodeId={node.id}
            editing={editing}
            onEdit={() => setActiveRow(row)}
          />
        );
        return (
          <SectionRow key={formatValuePath([...row.fieldPath]) || "root"}>
            <span className="flex items-center gap-2" title={row.label}>
              <Icon className="size-4 text-muted-foreground" />
              <span className="truncate">{row.label}</span>
            </span>
            <div className="col-span-2 min-w-0">
              {modal ? (
                <div className="flex min-w-0 h-8 p-1 items-center rounded-sm bg-muted/50">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded-sm bg-transparent px-2 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setActiveRow(row)}
                    aria-label={`Edit ${row.label}`}
                  >
                    {previewValue(row.value)}
                  </button>
                  {actions}
                </div>
              ) : (
                <InlineValue row={row} nodeId={node.id} editing={editing} actions={actions} />
              )}
            </div>
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
          onSave={(value) => {
            const currentValue = valueAtPath(
              defaultSourceValues(editing.graph)[node.id],
              activeRow.fieldPath,
            );
            if (!sourceValuesEqual(currentValue, activeRow.value)) {
              return "This value changed elsewhere. Cancel and reopen it before applying.";
            }
            editing.setSourceFieldDefault(node.id, activeRow.fieldPath, value);
            return null;
          }}
        />
      ) : null}
    </Section>
  );
};
