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
  VariableTypeIcon,
} from "@mechane/design-system";
import { formatValuePath, type SourceNode } from "@mechane/domain/graph";
import { useMemo } from "react";

import type { SourceValueEditing } from "../../commands/use-graph-editing";
import { useNodeInteraction } from "../node-interaction";
import { InlineValue, SourceImagePreview } from "../SourceValueDialog/ValueEditor";
import type { SourceImageAsset, SourceValueRow } from "./source-value-types";
import { previewValue, sourceValueRows, usesModal } from "./source-values-helpers";
const EMPTY_SOURCE_IMAGE_ASSETS: readonly SourceImageAsset[] = [];
function SourceValueActions({
  row,
  nodeId,
  editing,
  onEdit,
}: {
  row: SourceValueRow;
  nodeId: string;
  editing: SourceValueEditing;
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
export const SourceValues = ({
  node,
  editing,
  imageAssets = EMPTY_SOURCE_IMAGE_ASSETS,
}: {
  node: SourceNode;
  editing: SourceValueEditing;
  imageAssets?: readonly SourceImageAsset[];
}) => {
  const rows = useMemo(() => sourceValueRows(node, editing), [editing, node]);
  const { openSourceValueEditor } = useNodeInteraction();
  const openRow = (row: SourceValueRow) =>
    openSourceValueEditor({ nodeId: node.id, fieldPath: row.fieldPath });
  return (
    <Section label="Source values">
      {rows.map((row) => {
        const modal = usesModal(row.type, row.value);
        const actions = (
          <SourceValueActions
            row={row}
            nodeId={node.id}
            editing={editing}
            onEdit={() => openRow(row)}
          />
        );
        return (
          <SectionRow key={formatValuePath([...row.fieldPath]) || "root"}>
            <span className="flex items-center gap-2" title={row.label}>
              <VariableTypeIcon type={row.type} className="size-4 text-muted-foreground" />
              <span className="truncate">{row.label}</span>
            </span>
            <div className="col-span-2 min-w-0">
              {modal ? (
                <div className="flex min-w-0 h-8 p-1 items-center rounded-sm bg-muted/50">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded-sm bg-transparent px-2 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => openRow(row)}
                    aria-label={`Edit ${row.label}`}
                  >
                    {row.type === "image" ? (
                      <SourceImagePreview value={row.value} imageAssets={imageAssets} />
                    ) : (
                      previewValue(row.value)
                    )}
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
    </Section>
  );
};
