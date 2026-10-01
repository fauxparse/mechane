import {
  buttonVariants,
  cn,
  CopyButton,
  ExternalLinkIcon,
  QrCode,
  VariableTypeIcon,
} from "@mechane/design-system";
import { deviceAddress } from "@mechane/domain/device-address";
import { DEVICE_SOURCE_HANDLES, type TransformerInputPort } from "@mechane/domain/graph";
import { Position, type HandleProps } from "@xyflow/react";
import { useState, type ComponentType } from "react";
import { PLAYER_BASE_URL } from "../../../../api/client";
import type { ShowFlowNode } from "../graph-to-flow";
import { handleFor } from "../handle-ids";
import { HANDLE_CLASS } from "../handle-styles";
import { DummyHandle } from "./DummyHandle";

export interface NodeFieldListProps {
  fields: ShowFlowNode["data"]["fields"];
  fieldIds?: ReadonlySet<string>;
  connectedHandleIds?: ReadonlySet<string>;
  handle?: ComponentType<HandleProps>;
  isConnectable?: boolean;
}

export function NodeFieldList({
  fields,
  fieldIds,
  connectedHandleIds,
  handle: HandleComponent = DummyHandle,
  isConnectable = false,
}: NodeFieldListProps) {
  if (fields.length === 0) return null;

  return (
    <div className="grid grid-cols-[2.5rem_1fr] gap-x-2">
      {fields.map((field) => {
        const handleId = handleFor({ kind: "field", id: field.id });
        return (
          <div
            key={field.id}
            className="border-t first:border-t-0 border-(--flow-border)/50 relative grid col-span-full grid-cols-subgrid items-center py-2"
          >
            <HandleComponent
              id={handleId}
              type="target"
              position={Position.Left}
              className={HANDLE_CLASS}
              data-targetable={fieldIds?.has(field.id) ?? false}
              data-connected={connectedHandleIds?.has(handleId) ?? false}
              isConnectable={isConnectable}
            />
            <VariableTypeIcon
              type={field.type}
              className="size-4 shrink-0 justify-self-center ml-2 text-(--flow-muted-foreground)"
            />
            <div className="flex min-w-0 items-baseline justify-between gap-2 pr-4">
              <div className="min-w-0 truncate">
                {field.value === undefined || field.value === null ? (
                  <span className="text-(--flow-muted-foreground) opacity-50">(empty)</span>
                ) : (
                  formatValue(field.value)
                )}
              </div>
              <span className="truncate text-xs text-(--flow-muted-foreground)">{field.name}</span>
            </div>
            <HandleComponent
              id={handleId}
              type="source"
              position={Position.Right}
              className={HANDLE_CLASS}
              data-connected={connectedHandleIds?.has(handleId) ?? false}
              isConnectableEnd={false}
            />
          </div>
        );
      })}
    </div>
  );
}

export interface NodeVariableListProps {
  variables: ShowFlowNode["data"]["variables"];
  variableIds?: ReadonlySet<string>;
  connectedHandleIds?: ReadonlySet<string>;
  handle?: ComponentType<HandleProps>;
}

export function NodeVariableList({
  variables,
  variableIds,
  connectedHandleIds,
  handle: HandleComponent = DummyHandle,
}: NodeVariableListProps) {
  if (variables.length === 0) return null;

  return (
    <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 gap-y-0">
      {variables.map((variable) => {
        const handleId = handleFor({ kind: "variable", id: variable.id });
        return (
          <div
            key={variable.id}
            className="border-t first:border-t-0 border-(--flow-border)/50 relative grid col-span-full grid-cols-subgrid items-center py-2"
          >
            <HandleComponent
              id={handleId}
              type="target"
              position={Position.Left}
              className={HANDLE_CLASS}
              data-targetable={variableIds?.has(variable.id) ?? false}
              data-connected={connectedHandleIds?.has(handleId) ?? false}
              isConnectableStart={false}
            />
            <VariableTypeIcon
              type={variable.type}
              className="size-4 inline-block justify-self-center ml-2"
            />
            <div className="flex items-center gap-2 w-full justify-between pr-2">
              <div className="truncate">{variable.name}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface NodeInputListProps {
  ports: readonly TransformerInputPort[];
  targetable?: boolean;
  connectedHandleIds?: ReadonlySet<string>;
  handle?: ComponentType<HandleProps>;
  /**
   * Makes each name editable in place (double-click, like the node's own
   * name). Absent where the name is fixed: Filter and Shuffle read `input`.
   */
  onRename?(portId: string, name: string): void;
}

export function NodeInputList({
  ports,
  targetable = false,
  connectedHandleIds,
  handle: HandleComponent = DummyHandle,
  onRename,
}: NodeInputListProps) {
  return (
    <div className="grid grid-cols-[2.5rem_1fr] gap-x-2">
      {ports.map((port) => {
        const handleId = handleFor({ kind: "field", id: port.id });
        return (
          <div
            key={port.id}
            className="relative col-span-full grid grid-cols-subgrid items-center border-t border-(--flow-border)/50 py-1.5"
          >
            <HandleComponent
              id={handleId}
              type="target"
              position={Position.Left}
              className={HANDLE_CLASS}
              data-targetable={targetable}
              data-connected={connectedHandleIds?.has(handleId) ?? false}
              isConnectableStart={false}
            />
            <div className="col-start-2 flex min-w-0 items-baseline justify-between gap-2 pr-3">
              <InputName
                name={port.name}
                onRename={onRename ? (name) => onRename(port.id, name) : undefined}
              />
              <span className="truncate text-[10px] text-(--flow-muted-foreground)">input</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InputName({ name, onRename }: { name: string; onRename?(name: string): void }) {
  const [editing, setEditing] = useState(false);

  if (!onRename || !editing) {
    return (
      <span
        className="truncate font-mono text-xs"
        title={onRename ? "Double-click to rename" : undefined}
        onDoubleClick={
          onRename
            ? (event) => {
                // Rename this input, not the node the row sits in.
                event.stopPropagation();
                setEditing(true);
              }
            : undefined
        }
      >
        {name}
      </span>
    );
  }

  return (
    <input
      className="nodrag nokey min-w-0 flex-1 rounded-sm border-0 bg-transparent px-1 -ml-1 font-mono text-xs outline-0 focus-visible:border-0"
      defaultValue={name}
      aria-label={`Input name ${name}`}
      autoFocus
      onFocus={(event) => event.target.select()}
      onBlur={(event) => {
        setEditing(false);
        // A blank name would orphan the Formula's references; keep the old one.
        const next = event.target.value.trim();
        if (next && next !== name) onRename(next);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = name;
          event.currentTarget.blur();
        }
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}

export interface NodeCueListProps {
  cues: ShowFlowNode["data"]["cues"];
  connectedHandleIds?: ReadonlySet<string>;
  handle?: ComponentType<HandleProps>;
}

export function NodeCueList({
  cues,
  connectedHandleIds,
  handle: HandleComponent = DummyHandle,
}: NodeCueListProps) {
  if (cues.length === 0) return null;

  return (
    <div className="border-t border-(--flow-border)/50">
      {cues.map((cue) => {
        const handleId = handleFor({ kind: "cue", id: cue.id });
        return (
          <div key={cue.id} className="relative flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{cue.name}</div>
              <div className="text-[10px] text-(--flow-muted-foreground)">
                {cue.actionCount} {cue.actionCount === 1 ? "Action" : "Actions"}
              </div>
            </div>
            <HandleComponent
              id={handleId}
              type="source"
              position={Position.Right}
              className={HANDLE_CLASS}
              data-connected={connectedHandleIds?.has(handleId) ?? false}
              isConnectableEnd={false}
            />
          </div>
        );
      })}
    </div>
  );
}

export interface DevicePairingProps {
  pairingCode: string | null;
  /** The hostname of the Device's live Custom Domain, which its QR code and Address use. */
  liveDomain?: string | null;
  connectedHandleIds?: ReadonlySet<string>;
  handle?: ComponentType<HandleProps>;
}

export function DevicePairing({
  pairingCode,
  liveDomain = null,
  connectedHandleIds,
  handle: HandleComponent = DummyHandle,
}: DevicePairingProps) {
  if (!pairingCode) return null;
  const address = deviceAddress({ pairingCode, liveDomain }, PLAYER_BASE_URL);
  const playerUrl = address.url;

  const qrCodeHandleId = handleFor({ kind: "deviceSource", name: DEVICE_SOURCE_HANDLES.qrCode });
  const pairingCodeHandleId = handleFor({
    kind: "deviceSource",
    name: DEVICE_SOURCE_HANDLES.pairingCode,
  });
  const addressHandleId = handleFor({ kind: "deviceSource", name: DEVICE_SOURCE_HANDLES.address });

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-center relative">
        <QrCode value={playerUrl} className="size-24" label={`QR code for ${address.text}`} />
        <a
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "absolute right-4 top-1/2 -translate-y-1/2",
          )}
          href={playerUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open player session"
        >
          <ExternalLinkIcon />
        </a>
        <HandleComponent
          id={qrCodeHandleId}
          type="source"
          position={Position.Right}
          className={HANDLE_CLASS}
          data-connected={connectedHandleIds?.has(qrCodeHandleId) ?? false}
          isConnectableEnd={false}
        />
      </div>
      <div className="relative flex items-center justify-center">
        <span className="font-mono text-2xl font-medium tracking-widest">{pairingCode}</span>
        <CopyButton value={pairingCode} className="absolute right-4 top-1/2 -translate-y-1/2" />
        <HandleComponent
          id={pairingCodeHandleId}
          type="source"
          position={Position.Right}
          className={HANDLE_CLASS}
          style={{ zIndex: 10 }}
          data-connected={connectedHandleIds?.has(pairingCodeHandleId) ?? false}
          isConnectableEnd={false}
        />
      </div>
      <div className="relative flex items-center justify-center px-10">
        <span className="truncate font-mono text-xs text-muted-foreground" title={address.url}>
          {address.text}
        </span>
        <HandleComponent
          id={addressHandleId}
          type="source"
          position={Position.Right}
          className={HANDLE_CLASS}
          style={{ zIndex: 10 }}
          data-connected={connectedHandleIds?.has(addressHandleId) ?? false}
          isConnectableEnd={false}
        />
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value.includes("\n") ? "text" : value || "empty";
  if (value === null || value === undefined) return "No value";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  return "{…}";
}
