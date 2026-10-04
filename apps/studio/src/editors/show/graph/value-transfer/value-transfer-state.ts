// Pure target/state logic for Show-editor value Copy/Paste (#896–#900).
//
// Everything here is deterministic and DOM-free: what an explicit target is,
// which nested Fields are addressable without crossing an array, when a
// target is unavailable rather than inferred, and how failures become the
// accepted actionable diagnostic shape (#877 diagnostics, #876 presentation).
// The React provider (./value-transfer-context.tsx) orchestrates these; the
// browser handoff lives in ./clipboard-handoff.ts.
import { ValueTransferRequestError, type SourceValueContext } from "../../../../api/value-transfer";
import { portableText, ValueTransferError } from "@mechane/domain/value-transfer";
import type { Shape, Type } from "@mechane/domain/shapes";
import { fieldsForType } from "@mechane/domain/shapes";
import type { ValueTarget, ValueTransferDiagnostic } from "@mechane/domain/value-transfer";

/** One explicit destination, captured before any clipboard read (#872). */
export interface ValueTransferSelection {
  showId: string;
  sourceId: string;
  plane: "default" | "current";
  /** Show-level Source, or Flow-local Source needing a Shared Instance. */
  scope: "show" | "flow";
  /** Stable Field IDs from the Source root; empty replaces the whole Source. */
  fieldPath: readonly string[];
  /** The explicitly chosen Shared Instance, for Flow-local Current targets. */
  instanceId: string | null;
  /** Client-side incoming-wiring fact; the server rechecks it at commit. */
  incomingWired: boolean;
}

/** Copy is prepared before it is written: one gesture each (#876, #890). */
export type CopyPreparation =
  | { kind: "idle" }
  | { kind: "preparing"; selection: ValueTransferSelection }
  | {
      kind: "ready";
      selection: ValueTransferSelection;
      /** Immutable snapshots from one chosen read; written without refetch. */
      typedText: string;
      plainText: string;
    };

/** Paste proceeds only while its captured target is still the chosen one. */
export type PastePhase =
  | { kind: "idle" }
  | { kind: "reading"; selection: ValueTransferSelection }
  | { kind: "preparing"; selection: ValueTransferSelection }
  | { kind: "confirming"; selection: ValueTransferSelection; prepared: PreparedWithTarget }
  | { kind: "submitting"; selection: ValueTransferSelection; prepared: PreparedWithTarget }
  | { kind: "unknown"; pinned: PinnedOperation }
  | { kind: "resolving"; pinned: PinnedOperation };

/** A preparation plus the exact target it was server-bound to. */
export interface PreparedWithTarget {
  target: ValueTarget;
  operationId: string;
  oldValue: unknown;
  replacementValue: unknown;
  representation: "typed" | "plain";
  showName: string;
  sourceLabel: string;
  scopeLabel: string;
  aliasEffects: string;
}

/**
 * A submitted operation whose outcome the transport could not establish.
 * Pinned to its captured target, it survives inspector unmounts and blocks
 * Paste and authored history until the exact outcome is looked up (#897).
 */
export interface PinnedOperation {
  selection: ValueTransferSelection;
  target: ValueTarget;
  operationId: string;
}

/** Actionable feedback beside the value controls (#876). */
export type ValueTransferFeedback =
  | { kind: "none" }
  | { kind: "copied"; selection: ValueTransferSelection; mode: "typed" | "plain" }
  | { kind: "committed"; summary: string }
  | { kind: "diagnostic"; diagnostic: ValueTransferDiagnostic };

export function sameSelection(
  a: ValueTransferSelection | null,
  b: ValueTransferSelection | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.showId === b.showId &&
    a.sourceId === b.sourceId &&
    a.plane === b.plane &&
    a.scope === b.scope &&
    a.instanceId === b.instanceId &&
    a.incomingWired === b.incomingWired &&
    a.fieldPath.length === b.fieldPath.length &&
    a.fieldPath.every((segment, index) => segment === b.fieldPath[index])
  );
}

export interface ValueFieldOption {
  fieldPath: readonly string[];
  label: string;
}

/**
 * Every Field explicitly selectable from this Source's root: whole Shapes
 * and their nested Fields, never inside an array — array-valued Fields are
 * replaced whole (#872 selection rules). Labels repeat the field names.
 */
export function selectableFieldPaths(type: Type, shapes: readonly Shape[]): ValueFieldOption[] {
  const options: ValueFieldOption[] = [];
  type FieldVisit =
    | {
        kind: "visit";
        type: Type;
        prefix: readonly string[];
        label: string;
        seen: ReadonlySet<string>;
      }
    | { kind: "emit"; fieldPath: readonly string[]; label: string };
  const pending: FieldVisit[] = [{ kind: "visit", type, prefix: [], label: "", seen: new Set() }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.kind === "emit") {
      options.push({ fieldPath: current.fieldPath, label: current.label });
      continue;
    }
    if (
      typeof current.type === "string" ||
      current.type.kind !== "shape" ||
      current.seen.has(current.type.shapeId)
    )
      continue;
    const seen = new Set(current.seen);
    seen.add(current.type.shapeId);
    const fields = fieldsForType(current.type, shapes);
    for (let index = fields.length - 1; index >= 0; index -= 1) {
      const field = fields[index]!;
      const fieldPath = [...current.prefix, field.id];
      const label = current.label ? `${current.label} › ${field.name}` : field.name;
      if (typeof field.type !== "string" && field.type.kind === "shape") {
        pending.push({ kind: "visit", type: field.type, prefix: fieldPath, label, seen });
      }
      pending.push({ kind: "emit", fieldPath, label });
    }
  }
  return options;
}

/**
 * The explicit server target for a selection, or null when the destination
 * does not exist yet — never a first Instance, newer Run or Default
 * fallback (#872, #900).
 */
export function targetForSelection(
  selection: ValueTransferSelection,
  context: SourceValueContext | null,
  draftVersion: number,
): ValueTarget | null {
  const fieldPath = [...selection.fieldPath];
  if (selection.plane === "default") {
    return {
      kind: "default",
      showId: selection.showId,
      sourceId: selection.sourceId,
      fieldPath,
      draftVersion,
    };
  }
  const run = context?.activeRun;
  if (!run) return null;
  if (selection.scope === "show") {
    return {
      kind: "current-show",
      showId: selection.showId,
      sourceId: selection.sourceId,
      fieldPath,
      runId: run.runId,
      publishedVersion: run.publishedVersion,
    };
  }
  const instance = context?.instances.find(
    (candidate) => candidate.instanceId === selection.instanceId,
  );
  if (!instance) return null;
  return {
    kind: "current-instance",
    showId: selection.showId,
    sourceId: selection.sourceId,
    fieldPath,
    runId: run.runId,
    publishedVersion: run.publishedVersion,
    deviceId: instance.deviceId,
    flowId: instance.flowId,
  };
}

export type ContextState = "idle" | "loading" | "ready" | "failed";

/**
 * Why a Current target cannot be used right now, as user-facing text — or
 * null when the target is addressable (or still loading).
 */
export function currentTargetUnavailableReason(
  selection: ValueTransferSelection,
  context: SourceValueContext | null,
  contextState: ContextState,
): string | null {
  if (selection.plane !== "current") return null;
  if (contextState === "loading" || contextState === "idle") return null;
  if (contextState === "failed") {
    return "Current is unavailable: this Show's Run state could not be read.";
  }
  if (!context?.activeRun) {
    return "Current needs the active Run. Start a Run to exchange live values.";
  }
  if (selection.scope === "flow") {
    if (context.instances.length === 0) {
      return "No eligible Shared Device Instance drives this Source's Flow.";
    }
    if (!selection.instanceId) {
      return "Select the Shared Device Instance to use.";
    }
    if (!context.instances.some((instance) => instance.instanceId === selection.instanceId)) {
      return "The selected Shared Device Instance is no longer eligible.";
    }
  }
  return null;
}

const PREVIEW_LIMIT = 160;

/** Compact JSON preview for old/replacement values; quoting stays visible. */
export function previewValue(value: unknown): string {
  if (value === undefined) return "—";
  const rendered = portableText(value);
  return rendered.length > PREVIEW_LIMIT ? `${rendered.slice(0, PREVIEW_LIMIT)}…` : rendered;
}

/** Confirmation previews show the complete already-expanded value, not a truncated prefix. */
export function previewTransferValue(value: unknown): string {
  return value === undefined ? "Value unavailable" : portableText(value);
}

function diagnostic(
  category: ValueTransferDiagnostic["category"],
  stage: string,
  code: string,
  message: string,
  nextAction: string,
): ValueTransferDiagnostic {
  return { category, stage, code, message, path: [], nextAction };
}

/** Clipboard read/write denial or unavailability (#890 adapter rules). */
export function browserFailure(stage: string, message: string, nextAction: string) {
  return diagnostic("browser-failure", stage, "clipboard-unavailable", message, nextAction);
}

/** The persistence barrier refused: unaccepted edits, rejected save (#879). */
export function persistenceFailure(message: string) {
  return diagnostic(
    "rejected-input",
    "persistence",
    "draft-not-persisted",
    message,
    "Let the draft finish saving, then start the action again.",
  );
}

/** The focused region is not a usable destination for the gesture. */
export function unaddressableTarget(reason: string) {
  return diagnostic(
    "rejected-input",
    "compatibility",
    "unaddressable-target",
    reason,
    "Choose an eligible explicit target before pasting.",
  );
}

/**
 * Classifies a failed request. Failures of unsubmitted reads/preparations
 * are actionable retries-by-gesture; a possibly-submitted commit/lookup is
 * an unknown outcome resolved only by exact lookup (#897).
 */
export function requestFailureDiagnostic(
  reason: unknown,
  stage: string,
  { submitted }: { submitted: boolean },
): ValueTransferDiagnostic {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (submitted) {
    return diagnostic(
      "outcome-unknown",
      stage,
      "result-unreadable",
      message,
      "Check the result of the submitted operation before pasting again.",
    );
  }
  if (reason instanceof ValueTransferRequestError && reason.diagnostic) return reason.diagnostic;
  if (reason instanceof ValueTransferError) return reason.diagnostic;
  return diagnostic(
    "rejected-input",
    stage,
    "request-failed",
    message,
    "Start the action again from its explicit gesture.",
  );
}

/** Saved-versus-published facts of a committed replacement, as text (#897). */
export function committedSummary(
  receipt:
    | { kind: "default"; version: number; published: null | { version: number } }
    | { kind: "current"; stateSequence: number },
): string {
  if (receipt.kind === "current") {
    return `Current updated (state sequence ${receipt.stateSequence}). Default is unchanged; live Undo is unavailable.`;
  }
  return receipt.published
    ? `Draft saved as version ${receipt.version} and published as version ${receipt.published.version}. Current is unchanged.`
    : `Draft saved as version ${receipt.version}. Current is unchanged.`;
}
