import {
  buttonVariants,
  cn,
  CopyButton,
  ExternalLinkIcon,
  QrCode,
  variableTypeIcon,
} from "@mechane/design-system";
import { DEVICE_SOURCE_HANDLES } from "@mechane/domain";
import { Position, type HandleProps } from "@xyflow/react";
import type { ComponentType } from "react";
import { playerSessionUrl } from "../../../../api/client";
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
        const Icon = variableTypeIcon(field.type);
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
            <Icon className="size-4 shrink-0 justify-self-center ml-2 text-(--flow-muted-foreground)" />
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
        const Icon = variableTypeIcon(variable.type);
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
            <Icon className="size-4 inline-block justify-self-center ml-2" />
            <div className="flex items-center gap-2 w-full justify-between pr-2">
              <div className="truncate">{variable.name}</div>
            </div>
          </div>
        );
      })}
    </div>
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
  connectedHandleIds?: ReadonlySet<string>;
  handle?: ComponentType<HandleProps>;
}

export function DevicePairing({
  pairingCode,
  connectedHandleIds,
  handle: HandleComponent = DummyHandle,
}: DevicePairingProps) {
  if (!pairingCode) return null;

  const qrCodeHandleId = handleFor({ kind: "deviceSource", name: DEVICE_SOURCE_HANDLES.qrCode });
  const pairingCodeHandleId = handleFor({
    kind: "deviceSource",
    name: DEVICE_SOURCE_HANDLES.pairingCode,
  });

  return (
    <div className="pt-2 pb-4">
      <div className="flex items-center justify-center relative">
        <QrCode
          value={pairingCode}
          className="size-24"
          label={`QR code for pairing code ${pairingCode}`}
        />
        <a
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "absolute right-4 top-1/2 -translate-y-1/2",
          )}
          href={playerSessionUrl(pairingCode)}
          target="_blank"
          rel="noopener noreferrer"
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
