import { Position, type HandleProps } from "@xyflow/react";
import type { ReactNode, ComponentType } from "react";

import { cn } from "@mechane/design-system";

import { INPUT_HANDLE, OUTPUT_HANDLE, type ShowFlowNode } from "../graph-to-flow";
import { HANDLE_CLASS } from "../handle-styles";
import { nodeIcon, typeLabel } from "../node-kinds";
import { upperFirst } from "es-toolkit";
import { DummyHandle } from "./DummyHandle";

export interface NodeHeaderProps {
  data: ShowFlowNode["data"];
  renaming?: boolean;
  onRenameChange?(name: string): void;
  onRenameCommit?(): void;
  onRenameCancel?(): void;
  targetable?: boolean;
  showInputHandle?: boolean;
  connectedHandleIds?: ReadonlySet<string>;
  subtitleAddon?: ReactNode;
  actions?: ReactNode;
  handle?: ComponentType<HandleProps>;
}

export function NodeHeader({
  data,
  renaming = false,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  targetable = false,
  showInputHandle = true,
  connectedHandleIds,
  subtitleAddon,
  actions,
  handle: HandleComponent = DummyHandle,
}: NodeHeaderProps) {
  const Icon = nodeIcon(data.kind, {
    perConnection: data.perConnection,
    sourceType: data.kind === "source" && typeof data.type === "string" ? data.type : undefined,
  });

  return (
    <div className="relative grid grid-cols-[2rem_1fr_auto] grid-rows-[1fr_auto] gap-x-2 gap-y-0 border-b border-(--flow-border)/20 px-2 bg-(--flow-background)/25 items-center grid-flow-row-dense rounded-t-[calc(var(--radius-md)-1px)]">
      <Icon className="row-span-2 justify-self-center text-(--flow-muted-foreground) size-5" />
      <div className="col-start-2 pt-1 flex min-w-0">
        {renaming ? (
          <input
            className="nokey min-w-0 flex-1 rounded-sm bg-transparent border-0 focus-visible:border-0 px-1 text-md font-medium outline-0 -ml-1"
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
        {subtitleAddon}
      </div>
      <div className="row-span-2 flex items-center gap-1">{actions}</div>

      {showInputHandle ? (
        <HandleComponent
          id={INPUT_HANDLE}
          type="target"
          position={Position.Left}
          className={cn(HANDLE_CLASS)}
          data-targetable={targetable}
          data-connected={connectedHandleIds?.has(INPUT_HANDLE) ?? false}
          isConnectableStart={false}
        />
      ) : null}
      <HandleComponent
        id={OUTPUT_HANDLE}
        type="source"
        position={Position.Right}
        className={cn(HANDLE_CLASS)}
        data-connected={connectedHandleIds?.has(OUTPUT_HANDLE) ?? false}
        isConnectableEnd={false}
      />
    </div>
  );
}
