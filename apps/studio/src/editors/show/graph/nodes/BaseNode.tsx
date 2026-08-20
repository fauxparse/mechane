import { Handle, Position, type HandleProps, type NodeProps } from "@xyflow/react";
import { INPUT_HANDLE, OUTPUT_HANDLE, type ShowFlowNode } from "../graph-to-flow";
import {
  AlertCircleIcon,
  Button,
  cn,
  SettingsIcon,
  variableTypeIcon,
} from "@mechane/design-system";
import { nodeIcon, NODE_KIND_META, typeLabel } from "../node-kinds";
import { upperFirst } from "es-toolkit";
import type { ComponentType, MouseEventHandler } from "react";
import { useDragState } from "../ShowGraphNodes";
import { useNodeInteraction } from "../node-interaction";

const HANDLE_CLASS =
  "h-4! w-4! border! border-(--flow-border)! bg-(--background)! after:content-[''] after:absolute after:inset-0.5 after:rounded-full after:bg-(--flow-connected) after:scale-0 after:transition-transform [&.connectionindicator]:after:scale-100";

export interface BaseNodeProps {
  id: string;
  data: ShowFlowNode["data"];
  selected?: boolean;
  targetable?: boolean;
  dimmed?: boolean;
  variableIds?: ReadonlySet<string>;
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
  renaming = false,
  onDoubleClick,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  ariaLabel,
  handle: HandleComponent = DummyHandle,
}: BaseNodeProps) => {
  const Icon = nodeIcon(data.kind, {
    perConnection: data.perConnection,
    sourceType: data.kind === "source" && typeof data.type === "string" ? data.type : undefined,
  });
  const hasWarning =
    data.variables.some((variable) => !data.wiredVariableIds.includes(variable.id)) ||
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
      <div className="relative grid grid-cols-[2rem_1fr_auto] grid-rows-[1fr_auto] gap-x-2 gap-y-0 border-b last:border-b-0 border-(--flow-border)/20 px-2 bg-(--flow-background)/25 rounded-t-[calc(var(--radius-md)-1px)] last:rounded-b-[calc(var(--radius-md)-1px)] items-center grid-flow-row-dense">
        <Icon className="row-span-2 justify-self-center text-(--flow-muted-foreground) size-5" />
        <div className="col-start-2 pt-1 flex min-w-0">
          {renaming ? (
            <input
              className="nokey col-start-2 min-w-0 rounded-sm bg-transparent border-0 focus-visible:border-0 px-1 text-md font-medium outline-0 -ml-1"
              defaultValue={data.name}
              aria-label="Name"
              autoFocus
              onChange={(event) => onRenameChange?.(event.target.value)}
              onFocus={(event) => event.target.select()}
              onBlur={onRenameCommit}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") onRenameCommit?.();
                if (event.key === "Escape") onRenameCancel?.();
              }}
              onDoubleClick={(event) => event.stopPropagation()}
            />
          ) : (
            <div className="text-(--flow-foreground) text-md font-medium truncate">{data.name}</div>
          )}
        </div>
        <div className="col-start-2 text-xs text-(--flow-muted-foreground) truncate uppercase tracking-wide leading-none pb-2">
          {typeLabel(data.type) ?? upperFirst(data.kind)}
        </div>
        <div className="row-span-2 flex items-center gap-1">
          {hasWarning ? <AlertCircleIcon className="size-5 text-destructive" /> : null}
          <Button
            variant="ghost"
            size="icon"
            className="text-(--flow-muted-foreground) hover:text-(--flow-muted-foreground) bg-transparent hover:bg-transparent opacity-50 hover:opacity-100"
          >
            <SettingsIcon />
          </Button>
        </div>

        <HandleComponent
          id={INPUT_HANDLE}
          type="target"
          position={Position.Left}
          className={cn(HANDLE_CLASS)}
          data-targetable={targetable}
          isConnectableStart={false}
        />
        <HandleComponent
          id={OUTPUT_HANDLE}
          type="source"
          position={Position.Right}
          className={cn(HANDLE_CLASS)}
          isConnectableEnd={false}
        />
      </div>

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

/**
 * React Flow adapter for the presentation-only BaseNode.
 *
 * Keep React Flow hooks and the real Handle implementation here so BaseNode
 * can render in Storybook and other non-canvas contexts without a provider.
 */
export function ReactFlowBaseNode({ id, data, selected }: NodeProps<ShowFlowNode>) {
  const { targetable, dimmed, variableIds } = useDragState(id);
  const { renaming, beginRename, renameTo, commitRename, cancelRename } = useNodeInteraction();
  return (
    <BaseNode
      id={id}
      data={data}
      selected={selected}
      targetable={targetable}
      dimmed={dimmed}
      variableIds={variableIds}
      renaming={renaming === id}
      onDoubleClick={() => beginRename(id)}
      onRenameChange={renameTo}
      onRenameCommit={commitRename}
      onRenameCancel={cancelRename}
      ariaLabel={`${NODE_KIND_META[data.kind].label}: ${data.name}`}
      handle={Handle}
    />
  );
}

export const DummyHandle = ({ id, position }: HandleProps) => {
  return (
    <div
      className={cn(HANDLE_CLASS, "react-flow__handle", `react-flow__handle-${position}`)}
      data-id={id}
      data-position={position}
    />
  );
};
