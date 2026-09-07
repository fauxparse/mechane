import { AlertTriangleIcon, Button, cn, SettingsIcon } from "@mechane/design-system";
import type { HandleProps } from "@xyflow/react";
import type { ComponentType, MouseEventHandler, ReactNode } from "react";

import type { ShowFlowNode } from "../graph-to-flow";
import { DummyHandle } from "./DummyHandle";
import { NodeHeader } from "./NodeHeader";

export interface BaseNodeProps {
  id: string;
  data: ShowFlowNode["data"];
  selected?: boolean;
  targetable?: boolean;
  dimmed?: boolean;
  connectedHandleIds?: ReadonlySet<string>;
  renaming?: boolean;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
  onRenameChange?(name: string): void;
  onRenameCommit?(): void;
  onRenameCancel?(): void;
  ariaLabel?: string;
  warning?: boolean;
  showOutputHandle?: boolean;
  handle?: ComponentType<HandleProps>;
  children?: ReactNode;
}

export function BaseNode({
  id,
  data,
  selected,
  targetable = false,
  dimmed = false,
  connectedHandleIds,
  renaming = false,
  onDoubleClick,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  ariaLabel,
  warning = false,
  showOutputHandle = true,
  handle: HandleComponent = DummyHandle,
  children,
}: BaseNodeProps) {
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
        showOutputHandle={showOutputHandle}
        handle={HandleComponent}
        actions={
          <>
            {warning ? <AlertTriangleIcon className="size-5 text-destructive" /> : null}
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
      {children}
    </div>
  );
}
