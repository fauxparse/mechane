// The Source-value clipboard provider (#896–#900): one editor-level owner
// of explicit Copy/Paste state, mounted around the Show editor by the route
// (see ValueTransferBridge). The inspector consumes it through context, so
// an in-flight *submitted* operation stays pinned even when the inspector
// unmounts, while unsubmitted work is cancelled by the next target change
// (#872 fixed targets).
//
// Gesture policy (#876/#890): Copy prepares first and needs a second
// explicit gesture to write; nothing is written on readiness or focus
// return. Paste captures its target before the chosen clipboard read;
// native Paste uses only its event data. Current replacements pass through
// the live confirmation modal (./CurrentReplaceDialog); Default
// replacements commit directly as one authored operation delivered through
// the bridge. From submission until known settlement the bridge is blocked,
// so dependent edits and authored history cannot race the outcome (#897).
import {
  commitSourceValue,
  fetchSourceValueContext,
  lookupSourceValueOutcome,
  prepareSourceValue,
  readSourceValue,
  ValueTargetSchema,
  type DefaultValueReceipt,
  type PreparedSourceValue,
  type SourceValueContext,
  type SourceValueRead,
  type ValueOperationOutcome,
} from "../../../../api/value-transfer";
import { decodeValueHandoff } from "@mechane/commands";
import {
  canonicalValue,
  ValueTransferError,
  type ValueHandoff,
  type ValueTarget,
  type ValueTransferDiagnostic,
} from "@mechane/domain/value-transfer";
import { z } from "zod";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@mechane/design-system";

import {
  NATIVE_PASTE_AFTER_DENIAL,
  ClipboardReadDeniedError,
  handoffFromDataTransfer,
  readHandoffOnce,
  writeClipboardText,
} from "./clipboard-handoff";
import {
  browserFailure,
  committedSummary,
  currentTargetUnavailableReason,
  persistenceFailure,
  requestFailureDiagnostic,
  sameSelection,
  targetForSelection,
  unaddressableTarget,
  type ContextState,
  type CopyPreparation,
  type PastePhase,
  type PreparedWithTarget,
  type PinnedOperation,
  type ValueTransferFeedback,
  type ValueTransferSelection,
} from "./value-transfer-state";
import { CurrentReplaceDialog } from "./CurrentReplaceDialog";

/** The five owner-authorized operations the provider drives. */
export interface ValueTransferClient {
  context(showId: string, sourceId: string): Promise<SourceValueContext>;
  read(target: ValueTarget): Promise<SourceValueRead>;
  prepare(target: ValueTarget, handoff: ValueHandoff): Promise<PreparedSourceValue>;
  commit(operationId: string): Promise<ValueOperationOutcome>;
  lookup(showId: string, operationId: string): Promise<ValueOperationOutcome>;
}

/** The raw-fetch client over the API's value-transfer GraphQL slice. */
const apiValueTransferClient: ValueTransferClient = {
  context: fetchSourceValueContext,
  read: readSourceValue,
  prepare: prepareSourceValue,
  commit: commitSourceValue,
  lookup: lookupSourceValueOutcome,
};

/**
 * The editor seam this provider needs from its mount point: the accepted
 * persistence barrier, the committed-Default application as one authored
 * history entry, and the unknown-outcome guard over dependent edits and
 * authored history.
 */
export interface ValueTransferBridge {
  /** Flushes accepted edits through the cutoff; resolves with the acknowledged draft version. */
  persistDraft(): Promise<number>;
  /** Applies a committed server-accepted Default replacement without dispatching a new command. */
  acceptDefault(receipt: DefaultValueReceipt): void;
  /** Guards dependent edits and authored history while a submitted operation's outcome is unknown. */
  setBlocked(blocked: boolean): void;
}

export type SummaryState = "idle" | "loading" | "ready" | "failed" | "unavailable";

export interface SourceValueClipboardApi {
  showId: string | null;
  /** The currently chosen explicit destination, or null when none is chosen. */
  selection: ValueTransferSelection | null;
  select(selection: ValueTransferSelection | null): void;
  context: SourceValueContext | null;
  contextState: ContextState;
  contextFailure: string | null;
  summary: SourceValueRead | null;
  summaryState: SummaryState;
  summaryFailure: string | null;
  copyPreparation: CopyPreparation;
  pastePhase: PastePhase;
  feedback: ValueTransferFeedback;
  beginCopy(): void;
  writeCopy(mode: "typed" | "plain"): void;
  beginExplicitPaste(invoker: HTMLElement): void;
  handleNativeCopy(data: DataTransfer): void;
  handleNativePaste(data: DataTransfer, invoker: HTMLElement): void;
  confirmReplace(): void;
  cancelConfirm(): void;
  checkOutcome(): void;
  dismissFeedback(): void;
}

const ValueTransferContext = createContext<SourceValueClipboardApi | null>(null);

/** Read-only Current summary facts for the chosen destination. */
type Summary =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; read: SourceValueRead }
  | { state: "failed"; message: string }
  | { state: "unavailable"; reason: string };

/**
 * A submitted operation whose outcome the transport could not establish
 * outlives the route: only its untrusted identity and captured target are
 * kept in session storage, for an exact owner lookup after a remount —
 * never authority, outcomes, or an expiry that could read as rejection.
 */
const PENDING_OPERATION_PREFIX = "mechane.value-transfer.pending-operation:";
type TargetCapture =
  | { kind: "ready"; target: ValueTarget }
  | { kind: "failed"; diagnostic: ValueTransferDiagnostic };

const PinnedOperationSchema = z.object({
  showId: z.string(),
  operationId: z.string(),
  target: ValueTargetSchema,
  selection: z.object({
    showId: z.string(),
    sourceId: z.string(),
    plane: z.enum(["default", "current"]),
    scope: z.enum(["show", "flow"]),
    fieldPath: z.array(z.string()),
    instanceId: z.string().nullable(),
    incomingWired: z.boolean(),
  }),
});

function persistPinnedOperation(showId: string | null, pinned: PinnedOperation) {
  if (!showId) return;
  try {
    sessionStorage.setItem(
      `${PENDING_OPERATION_PREFIX}${showId}`,
      JSON.stringify({ showId, ...pinned, target: pinned.target }),
    );
  } catch {
    // Storage being unavailable only costs remount recovery, never correctness.
  }
}

function clearPinnedOperation(showId: string) {
  try {
    sessionStorage.removeItem(`${PENDING_OPERATION_PREFIX}${showId}`);
  } catch {
    /* The authoritative server outcome remains available without session storage. */
  }
}

function restorePinnedOperation(showId: string | null): PastePhase {
  if (!showId) return { kind: "idle" };
  try {
    const raw = sessionStorage.getItem(`${PENDING_OPERATION_PREFIX}${showId}`);
    if (!raw) return { kind: "idle" };
    const stored = PinnedOperationSchema.safeParse(JSON.parse(raw));
    if (!stored.success || stored.data.showId !== showId) return { kind: "idle" };
    return {
      kind: "unknown",
      pinned: {
        selection: stored.data.selection,
        target: stored.data.target,
        operationId: stored.data.operationId,
      },
    };
  } catch {
    return { kind: "idle" };
  }
}

// This session state machine keeps one epoch, pinned identity, and submission guard;
// splitting ownership would create competing mutation authorities.
// react-doctor-disable-next-line react-doctor/no-giant-component
export function SourceValueClipboardProvider({
  showId,
  bridge,
  client = apiValueTransferClient,
  children,
}: {
  showId: string | null;
  bridge: ValueTransferBridge;
  client?: ValueTransferClient;
  children: ReactNode;
}) {
  const [selection, setSelectionState] = useState<ValueTransferSelection | null>(null);
  const [contextData, setContextData] = useState<SourceValueContext | null>(null);
  const [contextState, setContextState] = useState<ContextState>("idle");
  const [contextFailure, setContextFailure] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary>({ state: "idle" });
  const [summaryRefresh, setSummaryRefresh] = useState(0);
  const [copyPreparation, setCopyPreparation] = useState<CopyPreparation>({ kind: "idle" });
  const [pastePhase, setPastePhase] = useState<PastePhase>(() => restorePinnedOperation(showId));
  const submitted = useRef(pastePhase.kind === "unknown");
  const [feedback, setFeedback] = useState<ValueTransferFeedback>({ kind: "none" });

  // Cancellation epochs: unsubmitted work dies on target change; submitted
  // work finalizes regardless, so nothing after `commit` checks this again.
  const epoch = useRef(0);
  const selectionRef = useRef<ValueTransferSelection | null>(null);
  const contextRef = useRef<SourceValueContext | null>(null);
  const bridgeRef = useRef(bridge);
  const clientRef = useRef(client);
  const invokingRegion = useRef<HTMLElement | null>(null);
  useEffect(() => {
    bridgeRef.current = bridge;
    clientRef.current = client;
  }, [bridge, client]);
  useEffect(() => {
    contextRef.current = contextData;
  }, [contextData]);

  const select = useCallback((next: ValueTransferSelection | null) => {
    const previous = selectionRef.current;
    if (sameSelection(previous, next)) return;
    selectionRef.current = next;
    if (
      previous?.sourceId !== next?.sourceId ||
      previous?.plane !== next?.plane ||
      previous?.showId !== next?.showId
    ) {
      contextRef.current = null;
      setContextData(null);
      setContextState("idle");
    }
    epoch.current += 1;
    setSelectionState(next);
    setPastePhase((phase) =>
      phase.kind === "reading" || phase.kind === "preparing" || phase.kind === "confirming"
        ? { kind: "idle" }
        : phase,
    );
    setCopyPreparation({ kind: "idle" });
    if (!submitted.current) {
      bridgeRef.current.setBlocked(false);
      setFeedback({ kind: "none" });
    }
  }, []);

  // The Run/Shared-Instance facts only a Current target needs.
  useEffect(() => {
    if (!showId || !selection || selection.plane !== "current") {
      setContextState("idle");
      setContextFailure(null);
      return;
    }
    let cancelled = false;
    setContextState("loading");
    setContextFailure(null);
    clientRef.current
      .context(showId, selection.sourceId)
      .then((data) => {
        if (cancelled) return;
        contextRef.current = data;
        setContextData(data);
        setContextState("ready");
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setContextData(null);
        setContextState("failed");
        setContextFailure(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [showId, selection?.sourceId, selection?.plane]);

  // The read-only Current summary, refreshed after a committed replacement.
  useEffect(() => {
    if (!selection || selection.plane !== "current" || contextState !== "ready") {
      setSummary({ state: "idle" });
      return;
    }
    const reason = currentTargetUnavailableReason(selection, contextData, contextState);
    const target = reason ? null : targetForSelection(selection, contextData, 0);
    if (reason || !target) {
      setSummary({ state: "unavailable", reason: reason ?? "Choose an eligible explicit target." });
      return;
    }
    let cancelled = false;
    setSummary({ state: "loading" });
    clientRef.current
      .read(target)
      .then((read) => {
        if (!cancelled) setSummary({ state: "ready", read });
      })
      .catch((reason: unknown) => {
        // An evaluation failure is reported, never converted into absence
        // or defaults (#872).
        if (!cancelled) {
          setSummary({
            state: "failed",
            message: reason instanceof Error ? reason.message : String(reason),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contextData, contextState, selection, summaryRefresh]);

  // From submission until known settlement, dependent edits and authored
  // history are blocked; an unknown outcome keeps the block until the exact
  // result is looked up (#897).
  useEffect(() => {
    bridgeRef.current.setBlocked(
      pastePhase.kind === "submitting" ||
        pastePhase.kind === "unknown" ||
        pastePhase.kind === "resolving" ||
        ("selection" in pastePhase && pastePhase.selection.plane === "default"),
    );
  }, [pastePhase]);

  const failCopy = useCallback((ticket: number, diagnostic: ValueTransferFeedback) => {
    if (ticket !== epoch.current) return;
    setCopyPreparation({ kind: "idle" });
    setFeedback(diagnostic);
  }, []);

  const captureTarget = useCallback((current: ValueTransferSelection): Promise<TargetCapture> => {
    if (current.plane === "default") {
      try {
        return bridgeRef.current.persistDraft().then(
          (version): TargetCapture => {
            const target = targetForSelection(current, null, version);
            return target
              ? { kind: "ready", target }
              : {
                  kind: "failed",
                  diagnostic: unaddressableTarget("The chosen Default is no longer addressable."),
                };
          },
          (reason: unknown): TargetCapture => ({
            kind: "failed",
            diagnostic: persistenceFailure(
              reason instanceof Error ? reason.message : String(reason),
            ),
          }),
        );
      } catch (reason: unknown) {
        return Promise.resolve({
          kind: "failed",
          diagnostic: persistenceFailure(reason instanceof Error ? reason.message : String(reason)),
        });
      }
    }
    const target = targetForSelection(current, contextRef.current, 0);
    return Promise.resolve(
      target
        ? { kind: "ready", target }
        : {
            kind: "failed",
            diagnostic: unaddressableTarget(
              currentTargetUnavailableReason(
                current,
                contextRef.current,
                contextRef.current ? "ready" : "loading",
              ) ??
                "Current is still loading. Wait for this Show's Run context, then start the action again.",
            ),
          },
    );
  }, []);

  const beginCopy = useCallback(() => {
    const current = selectionRef.current;
    if (!current) {
      setFeedback({
        kind: "diagnostic",
        diagnostic: unaddressableTarget("Choose a Source and Field before copying."),
      });
      return;
    }
    const unavailable = currentTargetUnavailableReason(current, contextRef.current, "ready");
    if (unavailable) {
      setFeedback({ kind: "diagnostic", diagnostic: unaddressableTarget(unavailable) });
      return;
    }
    const ticket = ++epoch.current;
    setCopyPreparation({ kind: "preparing", selection: current });
    setFeedback({ kind: "none" });
    void (async () => {
      try {
        const captured = await captureTarget(current);
        if (captured.kind === "failed") {
          failCopy(ticket, { kind: "diagnostic", diagnostic: captured.diagnostic });
          return;
        }
        const read = await clientRef.current.read(captured.target);
        if (ticket !== epoch.current) return;
        setCopyPreparation({
          kind: "ready",
          selection: current,
          typedText: read.typedText ?? "",
          plainText: read.plainText ?? "",
        });
      } catch (reason: unknown) {
        failCopy(ticket, {
          kind: "diagnostic",
          diagnostic: requestFailureDiagnostic(reason, "read", { submitted: false }),
        });
      }
    })();
  }, [captureTarget, failCopy]);

  const writeCopy = useCallback(
    (mode: "typed" | "plain") => {
      if (copyPreparation.kind !== "ready") return;
      const text = mode === "typed" ? copyPreparation.typedText : copyPreparation.plainText;
      if (!text) {
        setFeedback({
          kind: "diagnostic",
          diagnostic: {
            category: "rejected-input",
            stage: "encode",
            code: "representation-unavailable",
            message: `The ${mode === "typed" ? "typed" : "plain JSON"} representation is unavailable within the clipboard limits.`,
            path: [],
            nextAction: "Copy the other representation, or a smaller value.",
          },
        });
        return;
      }
      // The second explicit gesture: the submitted write of prepared
      // immutable text, serialized with any other submitted write.
      writeClipboardText(text).then(
        () => setFeedback({ kind: "copied", selection: copyPreparation.selection, mode }),
        (reason: unknown) =>
          setFeedback({
            kind: "diagnostic",
            diagnostic: browserFailure(
              "browser-write",
              reason instanceof Error ? reason.message : "The clipboard write failed.",
              "Start the copy again from its explicit gesture.",
            ),
          }),
      );
    },
    [copyPreparation],
  );

  const finalizeOutcome = useCallback(
    (
      outcome: ValueOperationOutcome,
      current: ValueTransferSelection,
      prepared: Pick<PreparedWithTarget, "target" | "operationId">,
    ) => {
      switch (outcome.kind) {
        case "committed": {
          if (canonicalValue(outcome.receipt.target) !== canonicalValue(prepared.target))
            throw new Error("The outcome does not match the submitted target.");
          if (outcome.receipt.kind === "default") {
            // One authored forward-command history entry, no dispatch, plus
            // amendments and the save-queue's new version/publication facts.
            bridgeRef.current.acceptDefault(outcome.receipt);
          } else if (current.plane === "current") {
            setSummaryRefresh((count) => count + 1);
          }
          clearPinnedOperation(current.showId);
          submitted.current = false;
          bridgeRef.current.setBlocked(false);
          setPastePhase({ kind: "idle" });
          setFeedback({ kind: "committed", summary: committedSummary(outcome.receipt) });
          return;
        }
        case "rejected": {
          clearPinnedOperation(current.showId);
          submitted.current = false;
          bridgeRef.current.setBlocked(false);
          setPastePhase({ kind: "idle" });
          setFeedback({ kind: "diagnostic", diagnostic: outcome.diagnostic });
          return;
        }
        case "pending": {
          // The commit could not report a final state: treat exactly like a
          // lost response — pinned, addressable, never retried blindly.
          const pinned = {
            selection: current,
            target: prepared.target,
            operationId: prepared.operationId,
          };
          persistPinnedOperation(showId, pinned);
          setPastePhase({ kind: "unknown", pinned });
          setFeedback({
            kind: "diagnostic",
            diagnostic: {
              category: "outcome-unknown",
              stage: "commit",
              code: "outcome-pending",
              message: "The submitted replacement has not reported a final result.",
              path: [...current.fieldPath],
              nextAction: "Check the result of the submitted operation before pasting again.",
            },
          });
        }
      }
    },
    [showId],
  );

  const pinOperation = useCallback(
    (current: ValueTransferSelection, prepared: PreparedWithTarget, reason: unknown) => {
      const pinned = {
        selection: current,
        target: prepared.target,
        operationId: prepared.operationId,
      };
      persistPinnedOperation(showId, pinned);
      setPastePhase({ kind: "unknown", pinned });
      setFeedback({
        kind: "diagnostic",
        diagnostic: requestFailureDiagnostic(reason, "commit", { submitted: true }),
      });
    },
    [showId],
  );

  const submitPrepared = useCallback(
    (current: ValueTransferSelection, prepared: PreparedWithTarget) => {
      if (submitted.current) return;
      submitted.current = true;
      persistPinnedOperation(showId, {
        selection: current,
        target: prepared.target,
        operationId: prepared.operationId,
      });
      bridgeRef.current.setBlocked(true);
      // `submitting` blocks dependent edits/history before the request goes
      // out, so no authored change can race the settlement.
      setPastePhase({ kind: "submitting", selection: current, prepared });
      clientRef.current
        .commit(prepared.operationId)
        .then((outcome) => {
          // Submitted work finalizes regardless of later target changes.
          finalizeOutcome(outcome, current, prepared);
        })
        .catch((reason: unknown) => {
          pinOperation(current, prepared, reason);
        });
    },
    [finalizeOutcome, pinOperation, showId],
  );

  const runPaste = useCallback(
    (
      ticket: number,
      current: ValueTransferSelection,
      handoff: ValueHandoff,
      targetPromise: Promise<TargetCapture>,
    ) => {
      setPastePhase({ kind: "preparing", selection: current });
      try {
        // The shared strict intake gates the gesture client-side: wrong
        // kind/version, duplicate keys, conflicting representations and
        // limits reject here without any plain-data fallback (#897).
        void decodeValueHandoff(handoff);
      } catch (reason: unknown) {
        setPastePhase({ kind: "idle" });
        setFeedback({
          kind: "diagnostic",
          diagnostic:
            reason instanceof ValueTransferError
              ? reason.diagnostic
              : {
                  category: "rejected-input",
                  stage: "decode",
                  code: "malformed-handoff",
                  message:
                    reason instanceof Error ? reason.message : "The pasted content was rejected.",
                  path: [...current.fieldPath],
                  nextAction: "Re-copy the value, or paste valid portable content.",
                },
        });
        return;
      }
      void (async () => {
        const settle = (
          diagnostic: ValueTransferDiagnostic | null,
          stage: string,
          reason?: unknown,
        ) => {
          if (ticket !== epoch.current) return;
          setPastePhase({ kind: "idle" });
          setFeedback({
            kind: "diagnostic",
            diagnostic: diagnostic ?? requestFailureDiagnostic(reason, stage, { submitted: false }),
          });
        };
        const captured = await targetPromise;
        if (captured.kind === "failed") {
          settle(captured.diagnostic, "target");
          return;
        }
        const target = captured.target;
        if (ticket !== epoch.current) return;
        try {
          const prepared = await clientRef.current.prepare(target, handoff);
          if (ticket !== epoch.current) return;
          const withTarget: PreparedWithTarget = { ...prepared, target };
          if (current.plane === "default") {
            submitPrepared(current, withTarget);
          } else {
            // Every Current replacement passes the live confirmation modal.
            setPastePhase({ kind: "confirming", selection: current, prepared: withTarget });
          }
        } catch (reason: unknown) {
          settle(null, "prepare", reason);
        }
      })();
    },
    [submitPrepared],
  );

  const beginExplicitPaste = useCallback(
    (invoker: HTMLElement) => {
      if (submitted.current) return;
      const current = selectionRef.current;
      if (!current) {
        setFeedback({
          kind: "diagnostic",
          diagnostic: unaddressableTarget("Choose a Source and Field before pasting."),
        });
        return;
      }
      invokingRegion.current = invoker;
      const ticket = ++epoch.current;
      if (current.incomingWired) {
        setFeedback({
          kind: "diagnostic",
          diagnostic: unaddressableTarget("Incoming-wired Sources are copy-only."),
        });
        return;
      }
      let targetPromise: Promise<TargetCapture>;
      try {
        targetPromise = captureTarget(current);
      } catch (reason: unknown) {
        setFeedback({
          kind: "diagnostic",
          diagnostic: requestFailureDiagnostic(reason, "target", { submitted: false }),
        });
        return;
      }
      if (current.plane === "default") bridgeRef.current.setBlocked(true);
      // The target is captured before the chosen clipboard read (#872).
      setPastePhase({ kind: "reading", selection: current });
      setFeedback({ kind: "none" });
      void (async () => {
        try {
          const [handoff, target] = await Promise.all([readHandoffOnce(), targetPromise]);
          if (ticket !== epoch.current) return;
          if (target.kind === "failed") throw new ValueTransferError(target.diagnostic);
          runPaste(ticket, current, handoff, Promise.resolve(target));
        } catch (reason: unknown) {
          if (ticket !== epoch.current) return;
          setPastePhase({ kind: "idle" });
          // Async-read denial offers the explicit native-Paste path; no
          // second automatic read is made (#890).
          setFeedback({
            kind: "diagnostic",
            diagnostic:
              reason instanceof ClipboardReadDeniedError
                ? browserFailure(
                    "browser-read",
                    reason.message,
                    NATIVE_PASTE_AFTER_DENIAL.nextAction,
                  )
                : requestFailureDiagnostic(reason, "browser-read", { submitted: false }),
          });
        }
      })();
    },
    [captureTarget, runPaste],
  );

  const handleNativeCopy = useCallback(
    (data: DataTransfer) => {
      if (
        copyPreparation.kind === "ready" &&
        sameSelection(copyPreparation.selection, selectionRef.current) &&
        copyPreparation.typedText
      ) {
        // Normal native Copy carries the typed portable envelope.
        data.setData("text/plain", copyPreparation.typedText);
        return;
      }
      // Unready: the OS clipboard is preserved and a fresh explicit gesture
      // will be required once preparation completes (#890).
      beginCopy();
    },
    [beginCopy, copyPreparation],
  );

  const handleNativePaste = useCallback(
    (data: DataTransfer, invoker: HTMLElement) => {
      if (submitted.current) return;
      const current = selectionRef.current;
      if (!current) return;
      invokingRegion.current = invoker;
      if (current.incomingWired) {
        setFeedback({
          kind: "diagnostic",
          diagnostic: unaddressableTarget("Incoming-wired Sources are copy-only."),
        });
        return;
      }
      let targetPromise: Promise<TargetCapture>;
      try {
        targetPromise = captureTarget(current);
      } catch (reason: unknown) {
        setFeedback({
          kind: "diagnostic",
          diagnostic: requestFailureDiagnostic(reason, "target", { submitted: false }),
        });
        return;
      }
      if (current.plane === "default") bridgeRef.current.setBlocked(true);
      const handoff = handoffFromDataTransfer(data);
      if (!handoff) {
        bridgeRef.current.setBlocked(false);
        setFeedback({
          kind: "diagnostic",
          diagnostic: {
            category: "rejected-input",
            stage: "decode",
            code: "no-portable-representation",
            message: "The pasted content carries no portable text representation.",
            path: [...current.fieldPath],
            nextAction: "Copy a value first, or paste its portable text.",
          },
        });
        return;
      }
      const ticket = ++epoch.current;
      runPaste(ticket, current, handoff, targetPromise);
    },
    [captureTarget, runPaste],
  );

  const confirmReplace = useCallback(() => {
    if (pastePhase.kind !== "confirming") return;
    submitPrepared(pastePhase.selection, pastePhase.prepared);
  }, [pastePhase, submitPrepared]);

  const cancelConfirm = useCallback(() => {
    if (pastePhase.kind !== "confirming") return;
    epoch.current += 1;
    setPastePhase({ kind: "idle" });
    setFeedback({ kind: "none" });
  }, [pastePhase]);

  const checkOutcome = useCallback(() => {
    if (pastePhase.kind !== "unknown") return;
    const pinned = pastePhase.pinned;
    setPastePhase({ kind: "resolving", pinned });
    clientRef.current
      .lookup(pinned.selection.showId, pinned.operationId)
      .then((outcome) => {
        if (outcome.kind === "pending") {
          setPastePhase({ kind: "unknown", pinned });
          setFeedback({
            kind: "diagnostic",
            diagnostic: {
              category: "outcome-unknown",
              stage: "lookup",
              code: "outcome-pending",
              message: "The submitted replacement has not reported a final result yet.",
              path: [...pinned.selection.fieldPath],
              nextAction: "Check the result again; the operation stays pinned meanwhile.",
            },
          });
          return;
        }
        // The exact result only: lookup never reapplies or rebinds (#897).
        finalizeOutcome(outcome, pinned.selection, {
          target: pinned.target,
          operationId: pinned.operationId,
        });
      })
      .catch((reason: unknown) => {
        setPastePhase({ kind: "unknown", pinned });
        setFeedback({
          kind: "diagnostic",
          diagnostic: requestFailureDiagnostic(reason, "lookup", { submitted: true }),
        });
      });
  }, [finalizeOutcome, pastePhase]);

  const api = useMemo<SourceValueClipboardApi>(
    () => ({
      showId,
      selection,
      select,
      context: contextData,
      contextState,
      contextFailure,
      summary: summary.state === "ready" ? summary.read : null,
      summaryState: summary.state,
      summaryFailure: summary.state === "failed" ? summary.message : null,
      copyPreparation,
      pastePhase,
      feedback,
      beginCopy,
      writeCopy,
      beginExplicitPaste,
      handleNativeCopy,
      handleNativePaste,
      confirmReplace,
      cancelConfirm,
      checkOutcome,
      dismissFeedback: () => setFeedback({ kind: "none" }),
    }),
    [
      beginCopy,
      beginExplicitPaste,
      cancelConfirm,
      checkOutcome,
      confirmReplace,
      contextData,
      contextFailure,
      contextState,
      copyPreparation,
      feedback,
      handleNativeCopy,
      handleNativePaste,
      pastePhase,
      select,
      selection,
      showId,
      summary,
      writeCopy,
    ],
  );

  return (
    <ValueTransferContext.Provider value={api}>
      {children}
      {(pastePhase.kind === "confirming" || pastePhase.kind === "submitting") &&
      pastePhase.prepared.target.kind !== "default" ? (
        <CurrentReplaceDialog
          open
          prepared={pastePhase.prepared}
          submitting={pastePhase.kind === "submitting"}
          onSubmit={confirmReplace}
          onCancel={cancelConfirm}
          returnFocus={() => (invokingRegion.current?.isConnected ? invokingRegion.current : false)}
        />
      ) : null}
      {pastePhase.kind === "unknown" || pastePhase.kind === "resolving" ? (
        <aside
          role="status"
          className="fixed inset-x-4 bottom-4 z-50 rounded-md border bg-background p-3 shadow-md"
        >
          <p>
            A submitted {pastePhase.pinned.target.kind === "default" ? "Default" : "Current"}{" "}
            replacement for Source {pastePhase.pinned.target.sourceId} has an unresolved outcome.
            Dependent edits and authored history remain blocked.
          </p>
          <Button type="button" onClick={checkOutcome} disabled={pastePhase.kind === "resolving"}>
            {pastePhase.kind === "resolving" ? "Checking…" : "Check submitted result"}
          </Button>
        </aside>
      ) : null}
    </ValueTransferContext.Provider>
  );
}

export function useSourceValueClipboard(): SourceValueClipboardApi {
  const api = useContext(ValueTransferContext);
  if (!api) {
    throw new Error("useSourceValueClipboard needs a SourceValueClipboardProvider above it.");
  }
  return api;
}

export function useOptionalSourceValueClipboard(): SourceValueClipboardApi | null {
  return useContext(ValueTransferContext);
}
