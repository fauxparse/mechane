import { Position, type HandleProps } from "@xyflow/react";
import type { ShowFlowNode } from "../graph-to-flow";
import {
  AlertCircleIcon,
  Button,
  cn,
  SettingsIcon,
  variableTypeIcon,
} from "@mechane/design-system";
import { typeLabel } from "../node-kinds";
import type { ComponentType, MouseEventHandler } from "react";
import { HANDLE_CLASS } from "../handle-styles";
import { NodeHeader } from "./NodeHeader";
import { DummyHandle } from "./DummyHandle";

export interface BaseNodeProps {
  id: string;
  data: ShowFlowNode["data"];
  selected?: boolean;
  targetable?: boolean;
  dimmed?: boolean;
  variableIds?: ReadonlySet<string>;
  connectedHandleIds?: ReadonlySet<string>;
  renaming?: boolean;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
  onRenameChange?(name: string): void;
  onRenameCommit?(): void;
  onRenameCancel?(): void;
  ariaLabel?: string;
  handle?: ComponentType<HandleProps>;
}

export const BaseNode = ({
  id,
  data,
  selected,
  targetable = false,
  dimmed = false,
  variableIds,
  connectedHandleIds,
  renaming = false,
  onDoubleClick,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  ariaLabel,
  handle: HandleComponent = DummyHandle,
}: BaseNodeProps) => {
  const wiredVariableIds = new Set(data.wiredVariableIds);
  const hasWarning =
    data.variables.some((variable) => !wiredVariableIds.has(variable.id)) ||
    (data.kind === "device" && !data.driven);

  return (
    <div
      className={cn(
        "group/node border border-(--flow-border) rounded-md bg-(--flow-background)/10 text-(--flow-foreground) shadow-md data-[selected=true]:ring-4 data-[selected=true]:ring-(--flow-border)/50",
        dimmed && "opacity-25",
      )}
      data-id={id}
      data-flow-theme={data.color ?? "neutral"}
      data-selected={selected ?? undefined}
      onDoubleClick={onDoubleClick}
      aria-label={ariaLabel}
    >
      <NodeHeader
        data={data}
        renaming={renaming}
        onRenameChange={onRenameChange}
        onRenameCommit={onRenameCommit}
        onRenameCancel={onRenameCancel}
        targetable={targetable}
        connectedHandleIds={connectedHandleIds}
        handle={HandleComponent}
        actions={
          <>
            {hasWarning ? <AlertCircleIcon className="size-5 text-destructive" /> : null}
            <Button
              variant="ghost"
              size="icon"
              className="text-(--flow-muted-foreground) hover:text-(--flow-muted-foreground) bg-transparent hover:bg-transparent opacity-50 hover:opacity-100"
            >
              <SettingsIcon />
            </Button>
          </>
        }
      />

      {data.variables?.length > 0 ? (
        <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-0">
          {data.variables.map((variable) => {
            const Icon = variableTypeIcon(
              typeof variable.type === "string"
                ? variable.type
                : variable.type?.kind === "array"
                  ? "array"
                  : variable.type
                    ? "object"
                    : undefined,
            );
            return (
              <div
                key={variable.id}
                className="border-t first:border-t-0 border-(--flow-border)/50 relative grid col-span-full grid-cols-subgrid items-center py-2"
              >
                <HandleComponent
                  id={variable.id}
                  type="target"
                  position={Position.Left}
                  className={HANDLE_CLASS}
                  data-targetable={variableIds?.has(variable.id) ?? false}
                  data-connected={connectedHandleIds?.has(variable.id) ?? false}
                  isConnectableStart={false}
                />
                <Icon className="size-4 inline-block justify-self-center ml-2" />
                <div className="flex items-center gap-2 w-full justify-between pr-2">
                  <div className="truncate">{variable.name}</div>
                  <div className="truncate text-right opacity-75 mr-2">
                    {typeLabel(variable.type ?? null)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
