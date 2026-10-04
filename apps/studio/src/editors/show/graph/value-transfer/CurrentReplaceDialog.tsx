// The live-write confirmation modal (#899, #876's accepted interaction):
// every Current Paste opens this, bound to the captured target and the
// server's comparison snapshot. It names the exact Show, Run, Source/Field,
// Shared Device Instance and actual storage scope, shows old and replacement
// values and representation, and discloses alias effects before the one
// explicit submission — "Replace Current value". Cancel starts focused and
// the invoking value region's focus is restored after either outcome.
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@mechane/design-system";
import { useRef, type ReactNode } from "react";

import { previewTransferValue } from "./value-transfer-state";
import type { PreparedWithTarget } from "./value-transfer-state";

export interface CurrentReplaceDialogProps {
  open: boolean;
  prepared: PreparedWithTarget;
  returnFocus(): HTMLElement | false;
  submitting: boolean;
  onSubmit(): void;
  onCancel(): void;
}

function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function CurrentReplaceDialog({
  open,
  prepared,
  returnFocus,
  submitting,
  onSubmit,
  onCancel,
}: CurrentReplaceDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const target = prepared.target;
  if (target.kind === "default")
    throw new Error("A Current confirmation requires an explicit live target.");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onCancel();
      }}
    >
      <DialogContent initialFocus={cancelButton} finalFocus={returnFocus}>
        <DialogTitle>Replace Current value?</DialogTitle>
        <DialogDescription>
          This live replacement is bound to the exact target and value snapshot below. Current
          changes immediately, Default stays unchanged, and live Undo is unavailable.
        </DialogDescription>
        <dl className="flex flex-col gap-2">
          <FactRow label="Show">
            {prepared.showName} ({target.showId})
          </FactRow>
          <FactRow label="Run">
            {target.runId} (published graph version {target.publishedVersion})
          </FactRow>
          <FactRow label="Source / Field">
            {prepared.sourceLabel} ({target.sourceId};{" "}
            {target.fieldPath.length === 0 ? "whole Source" : target.fieldPath.join(" › ")})
          </FactRow>
          {target.kind === "current-instance" ? (
            <>
              <FactRow label="Shared Device">{target.deviceId}</FactRow>
              <FactRow label="Instance">
                {target.runId}:{target.deviceId}
              </FactRow>
              <FactRow label="Flow">{target.flowId}</FactRow>
            </>
          ) : null}
          <FactRow label="Storage scope">{prepared.scopeLabel}</FactRow>
          <FactRow label="Representation">
            {prepared.representation === "typed"
              ? "Typed (version-1 envelope, sharing preserved)"
              : "Plain JSON (expanded, no declared Types)"}
          </FactRow>
          <FactRow label="Current value">
            <pre className="max-h-32 overflow-auto rounded-sm bg-muted/50 p-2 font-mono text-xs whitespace-pre-wrap break-all">
              {previewTransferValue(prepared.oldValue)}
            </pre>
          </FactRow>
          <FactRow label="Replacement">
            <pre className="max-h-32 overflow-auto rounded-sm bg-muted/50 p-2 font-mono text-xs whitespace-pre-wrap break-all">
              {previewTransferValue(prepared.replacementValue)}
            </pre>
          </FactRow>
          <FactRow label="Alias effects">{prepared.aliasEffects}</FactRow>
        </dl>
        <DialogFooter>
          <Button
            ref={cancelButton}
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Replacing…" : "Replace Current value"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
