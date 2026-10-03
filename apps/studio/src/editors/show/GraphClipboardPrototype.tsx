// Throwaway (#875): graph Copy, Cut, Paste and Duplicate gestures inside the real Show Editor.
//
// Three structurally different presentations share one simulated clipboard model:
//   ?variant=A  Toasts, paste lands at the pointer
//   ?variant=B  Clipboard dock, paste lands in place (offset from the originals)
//   ?variant=C  Canvas HUD, paste enters ghost placement (click to drop)
// ?show=hamlet|tempest picks the Show. Open both in two tabs for cross-Show and across-tab Cut.
//
// Real browser clipboard events and async clipboard calls carry illustrative JSON. Capture,
// save barriers, server outcomes, cut authority and source removal are simulated locally
// (timers, localStorage and BroadcastChannel). Prototype pastes are amendments, so Cmd+Z
// does not undo them here; production Paste is one undoable authored edit.
import { applyGraphEdits, type GraphEdit } from "@mechane/commands";
import {
  Button,
  ClipboardPaste,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  Copy,
  CopyPlus,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Scissors,
  useToastManager,
} from "@mechane/design-system";
import type { Position, ShowGraph } from "@mechane/domain/graph";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

import { MockEditorChrome } from "../../components/EditorLayout/MockEditorChrome";
import { ShowGraphEditor, type ShowGraphEditorHandle } from "./ShowGraphEditor";
import { FLOW_PADDING, NODE_HEIGHT, NODE_WIDTH } from "./graph/graph-to-flow";
import { focusContext } from "./keyboard/focus-context";
import {
  PROTOTYPE_SHOWS,
  captureSnapshot,
  isGraphSnapshot,
  isShowKey,
  planMove,
  planPaste,
  removalConsequences,
  removalEdits,
  snapshotSummary,
  type GraphSnapshot,
  type PastePlan,
  type PasteTarget,
  type PrototypeShow,
  type RemovalConsequences,
  type RequiredRepair,
  type ShowKey,
} from "./graph-clipboard-prototype-fixture";

type Variant = "A" | "B" | "C";
const VARIANTS: readonly Variant[] = ["A", "B", "C"];
const VARIANT_NAMES: Record<Variant, string> = {
  A: "Toasts · paste at pointer",
  B: "Clipboard dock · paste in place",
  C: "Canvas HUD · ghost placement",
};
const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
const CASCADE = 24;
const SESSION = typeof crypto !== "undefined" ? crypto.randomUUID() : "session";
const INTENTS_KEY = "prototype-875:cut-intents:v1";
const HEARTBEAT_PREFIX = "prototype-875:session:v1:";

type Op = "copy" | "cut";
type Outcome = "committed" | "unpublished" | "rejected" | "unknown";

interface Scenarios {
  pendingSaves: boolean;
  saveFails: boolean;
  slowCapture: boolean;
  captureFails: boolean;
  speculative: boolean;
  unfinishedGesture: boolean;
  writeRejects: boolean;
  readDenied: boolean;
  outcome: Outcome;
  unknownResolvesTo: "committed" | "rejected";
  removalFails: boolean;
}

const DEFAULT_SCENARIOS: Scenarios = {
  pendingSaves: true,
  saveFails: false,
  slowCapture: false,
  captureFails: false,
  speculative: false,
  unfinishedGesture: false,
  writeRejects: false,
  readDenied: false,
  outcome: "committed",
  unknownResolvesTo: "committed",
  removalFails: false,
};

type Activity =
  | { kind: "idle" }
  | {
      kind: "preparing";
      request: number;
      op: Op | "duplicate";
      phase: "saving" | "collecting";
      selectionKey: string;
      summary: string;
      silent: boolean;
    }
  | {
      kind: "ready";
      request: number;
      op: Op;
      snapshot: GraphSnapshot;
      selectionKey: string;
      silent: boolean;
    }
  | { kind: "unknown"; summary: string; check: () => void };

type Tone = "success" | "info" | "warning" | "error";

interface Notice {
  id: number;
  at: number;
  tone: Tone;
  title: string;
  detail?: string;
  action?: { label: string; run: () => void };
}

interface PromptAction {
  label: string;
  tone?: "default" | "destructive" | "outline";
  run: () => void;
}

interface Prompt {
  title: string;
  body: ReactNode;
  actions: PromptAction[];
  onCancel?: () => void;
}

interface Ghost {
  snapshot: GraphSnapshot;
  screen: Position;
  flowId: string | null;
}

interface CutIntent {
  id: string;
  show: ShowKey;
  nodeIds: string[];
  revision: number;
  session: string;
  status: "active" | "reserved" | "consumed" | "revoked";
}

interface ModelState {
  activity: Activity;
  notices: Notice[];
  clip: { snapshot: GraphSnapshot; op: Op } | null;
  ownCut: CutIntent | null;
  prompt: Prompt | null;
  ghost: Ghost | null;
  selection: string[];
  revision: number;
  lastPaste: { key: string; base: Position; count: number } | null;
  scenarios: Scenarios;
  /** A submitted mutation whose outcome is unknown. Copy/Cut stay available; mutations wait. */
  pinned: Extract<Activity, { kind: "unknown" }> | null;
}

type ChannelMessage =
  | { type: "preflight"; requestId: string; intentId: string }
  | {
      type: "preflight-result";
      requestId: string;
      reply: true;
      consequences: RemovalConsequences | null;
    }
  | { type: "remove"; requestId: string; intentId: string; destination: string }
  | { type: "remove-result"; requestId: string; reply: true; ok: boolean; reason: string };

function isChannelMessage(value: unknown): value is ChannelMessage {
  return typeof value === "object" && value !== null && "type" in value && "requestId" in value;
}

function readIntents(): Record<string, CutIntent> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INTENTS_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, CutIntent>)
      : {};
  } catch {
    return {};
  }
}

function saveIntent(intent: CutIntent) {
  localStorage.setItem(INTENTS_KEY, JSON.stringify({ ...readIntents(), [intent.id]: intent }));
}

function sessionAlive(session: string): boolean {
  return Number(localStorage.getItem(HEARTBEAT_PREFIX + session) ?? 0) > Date.now() - 3000;
}

function readParam<T extends string>(name: string, accept: (value: string | null) => T): T {
  return accept(new URL(window.location.href).searchParams.get(name));
}

function setParam(name: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  window.history.replaceState(null, "", url);
}

function graphOwnsGesture(): boolean {
  const focus = focusContext();
  if (focus.inTextInput || focus.inUndoBlockingWidget) return false;
  const text = window.getSelection();
  return !(text && !text.isCollapsed && text.toString().trim() !== "");
}

function ask(
  channel: BroadcastChannel,
  message: ChannelMessage,
  timeoutMs: number,
): Promise<ChannelMessage | null> {
  // Executor form: the studio tsconfig lib predates Promise.withResolvers.
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      channel.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      const data: unknown = event.data;
      if (!isChannelMessage(data) || data.requestId !== message.requestId || !("reply" in data)) {
        return;
      }
      window.clearTimeout(timer);
      channel.removeEventListener("message", onMessage);
      resolve(data);
    }
    channel.addEventListener("message", onMessage);
    channel.postMessage(message);
  });
}

type Placement = { kind: "gesture" } | { kind: "point"; screen: Position } | { kind: "in-place" };

interface Model {
  state: ModelState;
  graph: RefObject<ShowGraph>;
  pointer: RefObject<{ screen: Position; inside: boolean }>;
  menuPoint: RefObject<Position>;
  set(patch: Partial<ModelState>): void;
  notify(tone: Tone, title: string, detail?: string, action?: Notice["action"]): void;
  requestCopy(op: Op, event: ClipboardEvent | null): void;
  requestPaste(
    source: { kind: "native"; text: string } | { kind: "menu" },
    placement: Placement,
  ): void;
  copyPrepared(): void;
  cancelActivity(): void;
  duplicate(): void;
  placeGhost(screen: Position | null): void;
  flowAt(screen: Position): string | null;
  revokeOwnCut(message: string | null): void;
  onUserEdit(next: ShowGraph): void;
}

function describePlan(verb: string, snapshot: GraphSnapshot, plan: PastePlan) {
  const where =
    plan.containment === "explicit-flow" || plan.containment === "original-parent"
      ? ` into “${plan.containerName}”`
      : plan.containment === "whole-flow"
        ? ""
        : " at Show level";
  const parts = [
    plan.reconnected ? `Reconnected ${plan.reconnected} to the original targets.` : "",
    plan.disconnected.length
      ? `${plan.disconnected.length} input left disconnected: ${plan.disconnected
          .map((input) => `${input.consumer} (was ${input.producer})`)
          .join(", ")}.`
      : "",
  ];
  return {
    title: `${verb} ${snapshotSummary(snapshot)}${where}`,
    detail: parts.filter(Boolean).join(" "),
    warning: plan.disconnected.length > 0,
  };
}

function useClipboardModel({
  show,
  variant,
  editorRef,
  wrapperRef,
}: {
  show: PrototypeShow;
  variant: Variant;
  editorRef: RefObject<ShowGraphEditorHandle | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}): Model {
  const [, render] = useReducer((count: number) => count + 1, 0);
  const state = useRef<ModelState>({
    activity: { kind: "idle" },
    notices: [],
    clip: null,
    ownCut: null,
    prompt: null,
    ghost: null,
    selection: [],
    revision: 1,
    lastPaste: null,
    scenarios: DEFAULT_SCENARIOS,
    pinned: null,
  });
  const graph = useRef<ShowGraph>(show.graph);
  const pointer = useRef<{ screen: Position; inside: boolean }>({
    screen: { x: 0, y: 0 },
    inside: false,
  });
  const menuPoint = useRef<Position>({ x: 0, y: 0 });
  const request = useRef(0);
  const writing = useRef(false);
  const noticeId = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const set = useCallback((patch: Partial<ModelState>) => {
    state.current = { ...state.current, ...patch };
    render();
  }, []);

  const notify = useCallback(
    (tone: Tone, title: string, detail?: string, action?: Notice["action"]) => {
      noticeId.current += 1;
      set({
        notices: [
          ...state.current.notices.slice(-11),
          { id: noticeId.current, at: Date.now(), tone, title, detail, action },
        ],
      });
    },
    [set],
  );

  const editor = () => editorRef.current;

  const center = (): Position => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
  };

  const flowAt = (screen: Position): string | null => {
    for (const element of document.elementsFromPoint(screen.x, screen.y)) {
      const id = element.closest(".react-flow__node")?.getAttribute("data-id");
      if (id && graph.current.nodes.some((node) => node.id === id && node.kind === "flow")) {
        return id;
      }
    }
    return null;
  };

  const toFlow = (screen: Position): Position =>
    editor()?.toFlowPosition(screen) ?? { x: screen.x, y: screen.y };

  const selectionKey = (ids: readonly string[]) =>
    `${[...ids].sort().join(",")}@${state.current.revision}`;

  const setOwnCut = (cut: CutIntent | null) => {
    if (cut) saveIntent(cut);
    set({ ownCut: cut && (cut.status === "active" || cut.status === "reserved") ? cut : null });
  };

  const revokeOwnCut = (message: string | null) => {
    const own = state.current.ownCut;
    if (!own) return;
    const latest = readIntents()[own.id] ?? own;
    if (latest.status === "consumed") {
      set({ ownCut: null });
      return;
    }
    setOwnCut({ ...latest, status: "revoked" });
    if (message) {
      notify(
        "info",
        message,
        "The clipboard still holds the content. Pasting now makes a copy and removes nothing.",
      );
    }
  };

  const invalidatePreparation = (reason: string) => {
    const { activity } = state.current;
    if (activity.kind !== "preparing" && activity.kind !== "ready") return;
    request.current += 1;
    set({ activity: { kind: "idle" } });
    if (!activity.silent && activity.op !== "duplicate") {
      notify("info", `Copy cancelled: ${reason}`, "Nothing was written. Copy again when ready.");
    }
  };

  const bumpRevision = (reason: string) => {
    set({ revision: state.current.revision + 1 });
    invalidatePreparation(reason);
    if (state.current.ownCut?.status === "active") {
      revokeOwnCut(`Move cancelled: ${show.name} changed after the Cut`);
    }
  };

  const applyEdits = (edits: GraphEdit[]) => {
    editor()?.applyAmendments(edits);
    graph.current = applyGraphEdits(graph.current, edits);
    bumpRevision(`${show.name} changed`);
  };

  // Select once the amended nodes have reached React Flow's node state.
  const selectLater = (ids: string[]) => {
    window.setTimeout(() => editor()?.selectNodes(ids), 80);
  };

  const prepare = (op: Op | "duplicate", ids: string[], silent: boolean, then?: () => void) => {
    request.current += 1;
    const mine = request.current;
    const { scenarios } = state.current;
    const key = selectionKey(ids);
    const summary = snapshotSummary(
      captureSnapshot({ graph: graph.current, selectedIds: ids, show, revision: 0 }),
    );
    const live = () => request.current === mine && state.current.activity.kind === "preparing";
    const fail = (title: string, detail: string) => {
      if (!live()) return;
      set({ activity: { kind: "idle" } });
      if (!silent) notify("error", title, detail);
    };
    set({
      activity: {
        kind: "preparing",
        request: mine,
        op,
        phase: scenarios.pendingSaves ? "saving" : "collecting",
        selectionKey: key,
        summary,
        silent,
      },
    });
    window.setTimeout(
      () =>
        fail(
          "Copy took longer than 30 seconds",
          "Nothing was copied and your clipboard is unchanged. Your edits keep saving normally.",
        ),
      scenarios.slowCapture ? 4000 : 30000,
    );
    window.setTimeout(
      () => {
        if (!live()) return;
        if (scenarios.saveFails) {
          fail(
            "Couldn't save your latest edits",
            "Nothing was copied. Retry the save from the editor, then copy again.",
          );
          return;
        }
        const current = state.current.activity;
        if (current.kind === "preparing") set({ activity: { ...current, phase: "collecting" } });
        window.setTimeout(
          () => {
            if (!live()) return;
            if (scenarios.captureFails) {
              fail(
                "Couldn't read a Canvas in the selection",
                "“Cast your vote” has a Canvas that couldn't be loaded. Nothing was copied and your clipboard is unchanged.",
              );
              return;
            }
            const snapshot = captureSnapshot({
              graph: graph.current,
              selectedIds: ids,
              show,
              revision: state.current.revision,
            });
            if (op === "duplicate") {
              set({ activity: { kind: "idle" } });
              then?.();
              return;
            }
            set({
              activity: { kind: "ready", request: mine, op, snapshot, selectionKey: key, silent },
            });
          },
          scenarios.slowCapture ? 12000 : 900,
        );
      },
      scenarios.pendingSaves ? 1500 : 0,
    );
  };

  const onWritten = (op: Op, snapshot: GraphSnapshot) => {
    const { activity } = state.current;
    if (activity.kind === "ready") set({ activity: { ...activity, silent: true } });
    set({ clip: { snapshot, op } });
    if (op === "cut" && snapshot.cutIntentId) {
      revokeOwnCut(null);
      setOwnCut({
        id: snapshot.cutIntentId,
        show: show.key,
        nodeIds: snapshot.nodes.map((node) => node.id),
        revision: state.current.revision,
        session: SESSION,
        status: "active",
      });
      // Variant A shows the live Cut as its own persistent toast with Cancel move.
      if (variant !== "A") {
        notify(
          "success",
          `Cut ${snapshotSummary(snapshot)}`,
          `Paste to move. The originals stay until a paste succeeds. Esc cancels the move.`,
        );
      }
      return;
    }
    notify("success", `Copied ${snapshotSummary(snapshot)}`);
  };

  const onWriteFailed = () => {
    notify(
      "error",
      "The browser blocked the clipboard write",
      "Nothing was copied or cut. Try again from the editor.",
    );
  };

  const write = (op: Op, snapshot: GraphSnapshot, event: ClipboardEvent | null) => {
    if (writing.current) {
      notify("info", "Still writing the previous copy");
      return;
    }
    const payload: GraphSnapshot = {
      ...snapshot,
      cutIntentId: op === "cut" ? crypto.randomUUID() : null,
    };
    const text = JSON.stringify(payload);
    if (event) {
      event.preventDefault();
      if (state.current.scenarios.writeRejects || !event.clipboardData) {
        onWriteFailed();
        return;
      }
      event.clipboardData.setData("text/plain", text);
      onWritten(op, payload);
      return;
    }
    writing.current = true;
    const attempt = state.current.scenarios.writeRejects
      ? Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"))
      : navigator.clipboard.writeText(text);
    attempt
      .then(
        () => onWritten(op, payload),
        () => onWriteFailed(),
      )
      .finally(() => {
        writing.current = false;
      });
  };

  const requestCopy = (op: Op, event: ClipboardEvent | null) => {
    const ids = editor()?.selectedNodeIds() ?? [];
    if (ids.length === 0) {
      if (!event) notify("info", "Select nodes to copy", "Selecting only edges copies nothing.");
      return;
    }
    if (state.current.scenarios.unfinishedGesture) {
      event?.preventDefault();
      notify(
        "warning",
        "Finish renaming “Cast your vote” first",
        "Copy doesn't commit or cancel an unfinished edit. Press Enter or Esc, then copy again.",
      );
      return;
    }
    const key = selectionKey(ids);
    const { activity } = state.current;
    if (activity.kind === "ready" && activity.selectionKey === key) {
      write(op, activity.snapshot, event);
      return;
    }
    event?.preventDefault();
    if (
      activity.kind === "preparing" &&
      activity.selectionKey === key &&
      activity.op !== "duplicate"
    ) {
      set({ activity: { ...activity, op, silent: false } });
      return;
    }
    prepare(op, ids, false);
  };

  const cancelActivity = () => {
    const { activity } = state.current;
    if (activity.kind !== "preparing" && activity.kind !== "ready") return;
    request.current += 1;
    set({ activity: { kind: "idle" } });
    notify("info", "Copy cancelled", "Nothing was written. Your edits keep saving normally.");
  };

  const copyPrepared = () => {
    const { activity } = state.current;
    if (activity.kind === "ready") write(activity.op, activity.snapshot, null);
  };

  const outcomeOf = (): Outcome => state.current.scenarios.outcome;

  const submit = (
    label: string,
    edits: GraphEdit[],
    selectIds: string[],
    describe: { title: string; detail: string; warning: boolean },
    hooks: { onCommitted?: () => void; onRejected?: () => void } = {},
  ) => {
    const commit = (published: boolean) => {
      // Consume move authority first, so the revision bump below doesn't revoke it.
      hooks.onCommitted?.();
      applyEdits(edits);
      selectLater(selectIds);
      const detail = [
        describe.detail,
        published
          ? ""
          : `Saved, but ${show.name} can't publish yet (an unfinished Formula). Players still see the previous publication.`,
      ]
        .filter(Boolean)
        .join(" ");
      notify(describe.warning || !published ? "warning" : "success", describe.title, detail);
    };
    const reject = () => {
      notify(
        "error",
        `${label} rejected`,
        `${show.name} changed while this was being applied, so nothing was added. Try again against the latest version.`,
      );
      hooks.onRejected?.();
    };
    const outcome = outcomeOf();
    switch (outcome) {
      case "committed":
        commit(true);
        return;
      case "unpublished":
        commit(false);
        return;
      case "rejected":
        reject();
        return;
      case "unknown":
        set({
          pinned: {
            kind: "unknown",
            summary: label,
            check: () => {
              set({ pinned: null });
              if (state.current.scenarios.unknownResolvesTo === "committed") commit(true);
              else reject();
            },
          },
        });
        return;
      default: {
        const _exhaustive: never = outcome;
        return _exhaustive;
      }
    }
  };

  const pasteCopy = (
    snapshot: GraphSnapshot,
    target: PasteTarget,
    hooks: { onSubmit?: () => void; onCommitted?: () => void; onRejected?: () => void } = {},
    verb = "Pasted",
  ) => {
    const plan = planPaste({ snapshot, destination: show.key, graph: graph.current, target });
    const go = (finalPlan: PastePlan) => {
      hooks.onSubmit?.();
      const edits: GraphEdit[] = [
        ...[...finalPlan.nodes]
          .sort((a, b) => Number(b.kind === "flow") - Number(a.kind === "flow"))
          .map((node) => ({ type: "graph.addNode" as const, node })),
        ...finalPlan.edges.map((edge) => ({ type: "graph.addEdge" as const, edge })),
      ];
      submit(
        verb === "Duplicated" ? "Duplicate" : "Paste",
        edits,
        finalPlan.topLevelIds,
        describePlan(verb, snapshot, finalPlan),
        hooks,
      );
    };
    if (plan.repairs.length === 0) {
      go(plan);
      return;
    }
    set({
      prompt: {
        title: "Repair before pasting",
        body: (
          <>
            <p>
              {plan.repairs.length} required Action target
              {plan.repairs.length === 1 ? "" : "s"} must be chosen in {show.name}. Nothing has been
              added yet. The destination (
              {plan.containerName ? `“${plan.containerName}”` : "Show level"}) stays fixed while
              repairing.
            </p>
            <RepairList items={plan.repairs} />
            <p className="text-xs text-muted-foreground">
              Production opens the accepted repair dialog from “Choose graph paste reference and
              asset repair interactions” here. This prototype simulates completing it.
            </p>
          </>
        ),
        actions: [
          {
            label: "Complete repairs and paste (simulated)",
            run: () => go({ ...plan, repairs: [] }),
          },
        ],
        onCancel: () => notify("info", "Paste cancelled", "Nothing was added."),
      },
    });
  };

  const offerCopyInstead = (snapshot: GraphSnapshot, target: PasteTarget, reason: string) => {
    set({
      prompt: {
        title: "Move no longer available",
        body: (
          <p>
            {reason} The clipboard still holds the content from {snapshot.source.showName}. You can
            paste it as a copy; nothing will be removed from {snapshot.source.showName}.
          </p>
        ),
        actions: [
          {
            label: "Paste as copy",
            run: () => pasteCopy({ ...snapshot, cutIntentId: null }, target),
          },
        ],
      },
    });
  };

  const offerBlocked = (
    snapshot: GraphSnapshot,
    target: PasteTarget,
    blockers: RequiredRepair[],
    sourceName: string,
  ) => {
    set({
      prompt: {
        title: "These nodes can't be moved",
        body: (
          <>
            <p>Moving them would break required Actions in {sourceName}:</p>
            <RepairList items={blockers} />
            <p>
              Retarget or remove those Actions first (that changes {sourceName}, so Cut again), or
              paste a copy and leave the originals where they are.
            </p>
          </>
        ),
        actions: [
          {
            label: "Paste as copy",
            run: () => pasteCopy({ ...snapshot, cutIntentId: null }, target),
          },
        ],
      },
    });
  };

  const movePaste = (snapshot: GraphSnapshot, target: PasteTarget, intent: CutIntent) => {
    const plan = planMove({ snapshot, graph: graph.current, target });
    if (plan.blockers.length) {
      offerBlocked(snapshot, target, plan.blockers, show.name);
      return;
    }
    saveIntent({ ...intent, status: "reserved" });
    const edits: GraphEdit[] = plan.moves.map((move) =>
      move.reparent
        ? {
            type: "graph.reparentNode" as const,
            nodeId: move.nodeId,
            parentId: move.parentId,
            position: move.position,
          }
        : { type: "graph.moveNode" as const, nodeId: move.nodeId, position: move.position },
    );
    const where = plan.containerName ? ` into “${plan.containerName}”` : "";
    submit(
      "Move",
      edits,
      plan.moves.map((move) => move.nodeId),
      {
        title: `Moved ${snapshotSummary(snapshot)}${where}`,
        detail: "Same nodes, same identities and connections. One undo entry.",
        warning: false,
      },
      {
        onCommitted: () => {
          saveIntent({ ...intent, status: "consumed" });
          set({ ownCut: null });
        },
        onRejected: () => saveIntent({ ...intent, status: "active" }),
      },
    );
  };

  const crossShowMove = async (snapshot: GraphSnapshot, target: PasteTarget, intent: CutIntent) => {
    const bus = channel.current;
    if (!bus) return;
    const preflight = await ask(
      bus,
      { type: "preflight", requestId: crypto.randomUUID(), intentId: intent.id },
      1500,
    );
    if (!preflight || preflight.type !== "preflight-result" || !preflight.consequences) {
      offerCopyInstead(
        snapshot,
        target,
        `The ${snapshot.source.showName} tab that cut these nodes isn't available.`,
      );
      return;
    }
    const { consequences } = preflight;
    if (consequences.blockers.length) {
      offerBlocked(snapshot, target, consequences.blockers, snapshot.source.showName);
      return;
    }
    const proceed = () =>
      pasteCopy(
        { ...snapshot, cutIntentId: null },
        target,
        {
          onSubmit: () => saveIntent({ ...intent, status: "reserved" }),
          onRejected: () => saveIntent({ ...intent, status: "active" }),
          onCommitted: () => {
            saveIntent({ ...intent, status: "consumed" });
            void ask(
              bus,
              {
                type: "remove",
                requestId: crypto.randomUUID(),
                intentId: intent.id,
                destination: show.name,
              },
              2500,
            ).then((result) => {
              if (result && result.type === "remove-result" && result.ok) {
                notify(
                  "success",
                  `Moved from ${snapshot.source.showName}`,
                  `The originals were removed from ${snapshot.source.showName}.`,
                );
              } else {
                notify(
                  "warning",
                  `Pasted; originals not removed from ${snapshot.source.showName}`,
                  `${result && result.type === "remove-result" ? result.reason : `The ${snapshot.source.showName} tab didn't answer.`} Both copies now exist. Remove the originals yourself if you still want to.`,
                );
              }
            });
          },
        },
        "Moved",
      );
    if (consequences.retiredDevices.length === 0 && consequences.lostWiring.length === 0) {
      proceed();
      return;
    }
    set({
      prompt: {
        title: `Move from ${snapshot.source.showName}?`,
        body: (
          <>
            <p>
              After pasting into {show.name}, the originals are removed from{" "}
              {snapshot.source.showName}.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {consequences.retiredDevices.map((device) => (
                <li key={device}>
                  “{device}” will be retired when {snapshot.source.showName} publishes, releasing
                  its Custom Domain. Auto-publish may do this immediately. Undo in{" "}
                  {snapshot.source.showName} restores the Device, not its domain.
                </li>
              ))}
              {consequences.lostWiring.map((wire) => (
                <li key={`${wire.consumer}:${wire.producer}`}>
                  “{wire.consumer}” loses its connection from “{wire.producer}”.
                </li>
              ))}
            </ul>
            {snapshot.nodes.some((node) => node.kind === "device") ? (
              <p className="text-xs text-muted-foreground">
                The pasted Device in {show.name} is fresh: no pairing code, domain or connections.
              </p>
            ) : null}
          </>
        ),
        actions: [
          {
            label: "Paste as copy instead",
            tone: "outline",
            run: () => pasteCopy({ ...snapshot, cutIntentId: null }, target),
          },
          { label: "Move", tone: "destructive", run: proceed },
        ],
      },
    });
  };

  const resolveAndCommit = (snapshot: GraphSnapshot, target: PasteTarget) => {
    if (!snapshot.cutIntentId) {
      pasteCopy(snapshot, target);
      return;
    }
    const intent = readIntents()[snapshot.cutIntentId];
    const reason = !intent
      ? "The Cut was cancelled."
      : intent.status === "consumed"
        ? "An earlier paste already moved these nodes."
        : intent.status === "revoked"
          ? `The Cut was cancelled, or ${snapshot.source.showName} changed after it.`
          : intent.status === "reserved"
            ? "Another paste is already moving these nodes."
            : !sessionAlive(intent.session)
              ? `The ${snapshot.source.showName} tab that cut them was closed or reloaded.`
              : null;
    if (!intent || reason) {
      offerCopyInstead(snapshot, target, reason ?? "");
      return;
    }
    if (intent.show === show.key) {
      if (intent.session !== SESSION) {
        offerCopyInstead(
          snapshot,
          target,
          "This prototype only simulates same-Show moves inside one tab.",
        );
        return;
      }
      movePaste(snapshot, target, intent);
      return;
    }
    void crossShowMove(snapshot, target, intent);
  };

  const targetFor = (snapshot: GraphSnapshot, placement: Placement): PasteTarget | null => {
    const sameShow = snapshot.source.show === show.key;
    const key = `${snapshot.source.show}:${snapshot.source.revision}:${snapshot.nodes
      .map((node) => node.id)
      .join(",")}`;
    const cascade = (base: Position, first: number): Position => {
      const last = state.current.lastPaste;
      const repeat =
        last && last.key === key && Math.hypot(last.base.x - base.x, last.base.y - base.y) < 8;
      const count = repeat ? last.count + 1 : first;
      set({ lastPaste: { key, base, count } });
      return { x: base.x + CASCADE * count, y: base.y + CASCADE * count };
    };
    if (placement.kind === "point") {
      return { at: cascade(toFlow(placement.screen), 0), explicitFlowId: flowAt(placement.screen) };
    }
    if (variant === "B" || placement.kind === "in-place") {
      if (sameShow) {
        const origin = Object.values(snapshot.absolute).reduce(
          (min, position) => ({ x: Math.min(min.x, position.x), y: Math.min(min.y, position.y) }),
          { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
        );
        return { at: cascade(origin, 1), explicitFlowId: undefined };
      }
      return { at: cascade(toFlow(center()), 0), explicitFlowId: undefined };
    }
    const screen = pointer.current.inside ? pointer.current.screen : center();
    return { at: cascade(toFlow(screen), 0), explicitFlowId: flowAt(screen) };
  };

  const continuePaste = (text: string, placement: Placement) => {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      notify(
        "error",
        "Nothing to paste into the graph",
        "The clipboard doesn't hold Show graph content.",
      );
      return;
    }
    if (typeof value === "object" && value !== null && "format" in value) {
      if (value.format === "mechane/source-value") {
        notify(
          "error",
          "That's a Source value",
          "Paste it into a Source value field. The graph only accepts copied graph content.",
        );
        return;
      }
      if (value.format === "mechane/show-graph" && "version" in value && value.version !== 1) {
        notify("error", "This graph content is from a newer Mechane", "Nothing was added.");
        return;
      }
    }
    if (!isGraphSnapshot(value)) {
      notify(
        "error",
        "Nothing to paste into the graph",
        "The clipboard doesn't hold Show graph content.",
      );
      return;
    }
    if (variant === "C" && placement.kind !== "in-place") {
      const screen =
        placement.kind === "point"
          ? placement.screen
          : pointer.current.inside
            ? pointer.current.screen
            : center();
      set({ ghost: { snapshot: value, screen, flowId: flowAt(screen) } });
      return;
    }
    const target = targetFor(value, placement);
    if (target) resolveAndCommit(value, target);
  };

  const requestPaste = (
    source: { kind: "native"; text: string } | { kind: "menu" },
    placement: Placement,
  ) => {
    if (state.current.pinned) {
      notify(
        "warning",
        `The last ${state.current.pinned.summary.toLowerCase()}'s outcome is still unknown`,
        "Check its result before pasting again, so nothing is applied twice.",
      );
      return;
    }
    if (source.kind === "native") {
      continuePaste(source.text, placement);
      return;
    }
    const denied = () =>
      notify(
        "error",
        "Clipboard access was blocked",
        `The browser didn't allow reading the clipboard. Press ${MOD}V to paste instead.`,
      );
    if (state.current.scenarios.readDenied) {
      denied();
      return;
    }
    navigator.clipboard.readText().then((text) => continuePaste(text, placement), denied);
  };

  const placeGhost = (screen: Position | null) => {
    const ghost = state.current.ghost;
    if (!ghost) return;
    const at = screen ?? ghost.screen;
    set({ ghost: null });
    resolveAndCommit(ghost.snapshot, { at: toFlow(at), explicitFlowId: flowAt(at) });
  };

  const duplicate = () => {
    const ids = editor()?.selectedNodeIds() ?? [];
    if (ids.length === 0) {
      notify("info", "Select nodes to duplicate");
      return;
    }
    if (state.current.pinned) {
      notify(
        "warning",
        `The last ${state.current.pinned.summary.toLowerCase()}'s outcome is still unknown`,
        "Check its result before duplicating, so nothing races it.",
      );
      return;
    }
    if (state.current.scenarios.unfinishedGesture) {
      notify("warning", "Finish renaming “Cast your vote” first", "Then duplicate again.");
      return;
    }
    prepare("duplicate", ids, false, () => {
      const snapshot = captureSnapshot({
        graph: graph.current,
        selectedIds: ids,
        show,
        revision: state.current.revision,
      });
      const origin = Object.values(snapshot.absolute).reduce(
        (min, position) => ({ x: Math.min(min.x, position.x), y: Math.min(min.y, position.y) }),
        { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
      );
      pasteCopy(
        snapshot,
        { at: { x: origin.x + CASCADE, y: origin.y + CASCADE }, explicitFlowId: undefined },
        {},
        "Duplicated",
      );
    });
  };

  const latest = useRef({
    requestCopy,
    requestPaste,
    duplicate,
    cancelActivity,
    revokeOwnCut,
    placeGhost,
    bumpRevision,
    invalidatePreparation,
    prepare,
    applyEdits,
    notify,
    flowAt,
    set,
  });
  useLayoutEffect(() => {
    latest.current = {
      requestCopy,
      requestPaste,
      duplicate,
      cancelActivity,
      revokeOwnCut,
      placeGhost,
      bumpRevision,
      invalidatePreparation,
      prepare,
      applyEdits,
      notify,
      flowAt,
      set,
    };
  });

  // Browser clipboard events and the Duplicate/Escape keys.
  useEffect(() => {
    function onCopy(event: ClipboardEvent) {
      if (!graphOwnsGesture()) return;
      latest.current.requestCopy(event.type === "cut" ? "cut" : "copy", event);
    }
    function onPaste(event: ClipboardEvent) {
      if (!graphOwnsGesture()) return;
      event.preventDefault();
      latest.current.requestPaste(
        { kind: "native", text: event.clipboardData?.getData("text/plain") ?? "" },
        { kind: "gesture" },
      );
    }
    function onKeyDown(event: KeyboardEvent) {
      if (!graphOwnsGesture()) return;
      const undoChord =
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === "z" || (event.ctrlKey && event.key.toLowerCase() === "y"));
      if (undoChord && state.current.pinned) {
        // Capture phase: stop the editor's own Undo/Redo binding from racing the unknown outcome.
        event.preventDefault();
        event.stopImmediatePropagation();
        latest.current.notify(
          "warning",
          "Undo waits for the unknown outcome",
          "Check the result first, so history doesn't race a submitted edit.",
        );
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        latest.current.duplicate();
        return;
      }
      if (event.key === "Escape") {
        const current = state.current;
        if (current.ghost) {
          latest.current.set({ ghost: null });
          latest.current.notify("info", "Paste cancelled", "Nothing was added.");
        } else if (current.activity.kind === "preparing" && !current.activity.silent) {
          latest.current.cancelActivity();
        } else if (current.ownCut?.status === "active") {
          latest.current.revokeOwnCut("Move cancelled");
        }
        return;
      }
      if (event.key === "Enter" && state.current.ghost) {
        event.preventDefault();
        latest.current.placeGhost(null);
      }
    }
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // Selection changes invalidate preparation; speculative mode prepares quietly.
  useEffect(() => {
    let settle = 0;
    const poll = window.setInterval(() => {
      const ids = editorRef.current?.selectedNodeIds() ?? [];
      const before = state.current.selection;
      if (ids.join(",") === before.join(",")) return;
      latest.current.set({ selection: ids });
      latest.current.invalidatePreparation("the selection changed");
      window.clearTimeout(settle);
      if (state.current.scenarios.speculative && ids.length > 0) {
        settle = window.setTimeout(() => latest.current.prepare("copy", ids, true), 400);
      }
    }, 200);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(settle);
    };
  }, [editorRef]);

  // Session heartbeat plus the cross-tab bus standing in for server-side cut authority.
  useEffect(() => {
    const beat = () => localStorage.setItem(HEARTBEAT_PREFIX + SESSION, String(Date.now()));
    beat();
    const heartbeat = window.setInterval(beat, 1000);
    const bus = new BroadcastChannel("prototype-875");
    channel.current = bus;
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (!isChannelMessage(data) || "reply" in data) return;
      const own = state.current.ownCut;
      const intent =
        readIntents()[data.type === "preflight" || data.type === "remove" ? data.intentId : ""];
      const mine = own && intent && intent.id === own.id && intent.session === SESSION;
      if (data.type === "preflight") {
        bus.postMessage({
          type: "preflight-result",
          requestId: data.requestId,
          reply: true,
          consequences: mine ? removalConsequences(graph.current, intent.nodeIds) : null,
        } satisfies ChannelMessage);
        return;
      }
      if (data.type !== "remove" || !intent || intent.session !== SESSION) return;
      if (state.current.scenarios.removalFails || intent.revision !== state.current.revision) {
        bus.postMessage({
          type: "remove-result",
          requestId: data.requestId,
          reply: true,
          ok: false,
          reason: state.current.scenarios.removalFails
            ? `Your edit access to ${show.name} changed.`
            : `${show.name} changed after the paste started.`,
        } satisfies ChannelMessage);
        latest.current.set({ ownCut: null });
        latest.current.notify(
          "warning",
          `Pasted into ${data.destination}; originals kept here`,
          "Removing them failed, so both copies exist. Nothing will be removed later automatically.",
        );
        return;
      }
      latest.current.set({ ownCut: null });
      latest.current.applyEdits(removalEdits(graph.current, intent.nodeIds));
      latest.current.notify(
        "info",
        `Moved to ${data.destination}`,
        `The originals were removed from ${show.name}. Undo here restores them; it doesn't affect ${data.destination}.`,
      );
      bus.postMessage({
        type: "remove-result",
        requestId: data.requestId,
        reply: true,
        ok: true,
        reason: "",
      } satisfies ChannelMessage);
    };
    bus.addEventListener("message", onMessage);
    const onUnload = () => {
      const own = state.current.ownCut;
      if (own) saveIntent({ ...own, status: "revoked" });
      localStorage.removeItem(HEARTBEAT_PREFIX + SESSION);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.clearInterval(heartbeat);
      bus.removeEventListener("message", onMessage);
      bus.close();
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
    };
  }, [show.name]);

  return {
    state: state.current,
    graph,
    pointer,
    menuPoint,
    set,
    notify,
    requestCopy,
    requestPaste,
    copyPrepared,
    cancelActivity,
    duplicate,
    placeGhost,
    flowAt,
    revokeOwnCut,
    onUserEdit: (next: ShowGraph) => {
      graph.current = next;
      bumpRevision(`${show.name} changed`);
    },
  };
}

function RepairList({ items }: { items: RequiredRepair[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item) => (
        <li key={`${item.owner}:${item.target}:${item.reason}`}>
          “{item.owner}” → {item.target}: {item.reason}
        </li>
      ))}
    </ul>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <span className="ml-auto pl-6 text-xs text-muted-foreground">{children}</span>;
}

function ClipboardMenuItems({ model, variant }: { model: Model; variant: Variant }) {
  const hasSelection = model.state.selection.length > 0;
  return (
    <>
      <ContextMenuGroup>
        <ContextMenuLabel>Clipboard</ContextMenuLabel>
      </ContextMenuGroup>
      <ContextMenuItem disabled={!hasSelection} onClick={() => model.requestCopy("cut", null)}>
        <Scissors /> Cut <Kbd>{MOD}X</Kbd>
      </ContextMenuItem>
      <ContextMenuItem disabled={!hasSelection} onClick={() => model.requestCopy("copy", null)}>
        <Copy /> Copy <Kbd>{MOD}C</Kbd>
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() =>
          model.requestPaste({ kind: "menu" }, { kind: "point", screen: model.menuPoint.current })
        }
      >
        <ClipboardPaste /> Paste here <Kbd>{MOD}V</Kbd>
      </ContextMenuItem>
      {variant === "B" ? (
        <ContextMenuItem onClick={() => model.requestPaste({ kind: "menu" }, { kind: "in-place" })}>
          <ClipboardPaste /> Paste in place
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem disabled={!hasSelection} onClick={model.duplicate}>
        <CopyPlus /> Duplicate <Kbd>{MOD}D</Kbd>
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  );
}

function activityText(activity: Activity): { title: string; detail: string } | null {
  switch (activity.kind) {
    case "idle":
      return null;
    case "preparing": {
      if (activity.silent) return null;
      const verb =
        activity.op === "duplicate"
          ? "Duplicating"
          : activity.op === "cut"
            ? "Preparing to cut"
            : "Preparing to copy";
      return {
        title: `${verb} ${activity.summary}…`,
        detail:
          activity.phase === "saving"
            ? "Waiting for your latest edits to save."
            : "Collecting the content, its Canvases and definitions.",
      };
    }
    case "ready":
      if (activity.silent) return null;
      return {
        title: `Ready to ${activity.op} ${snapshotSummary(activity.snapshot)}`,
        detail: `Press ${MOD}${activity.op === "cut" ? "X" : "C"} again, or use the button. Nothing is on the clipboard yet.`,
      };
    case "unknown":
      return {
        title: `${activity.summary} outcome unknown`,
        detail: "The connection dropped after it was sent. It may have been applied.",
      };
    default: {
      const _exhaustive: never = activity;
      return _exhaustive;
    }
  }
}

function ActivityActions({ model, size = "sm" }: { model: Model; size?: "sm" | "xs" }) {
  const { activity } = model.state;
  if (activity.kind === "preparing" && !activity.silent && activity.op !== "duplicate") {
    return (
      <Button size={size} variant="outline" onClick={model.cancelActivity}>
        Cancel
      </Button>
    );
  }
  if (activity.kind === "ready" && !activity.silent) {
    return (
      <>
        <Button size={size} variant="ghost" onClick={model.cancelActivity}>
          Cancel
        </Button>
        <Button size={size} onClick={model.copyPrepared}>
          {activity.op === "cut" ? "Cut" : "Copy"}
        </Button>
      </>
    );
  }
  return null;
}

function PinnedOutcome({ model, className }: { model: Model; className: string }) {
  const { pinned } = model.state;
  const copy = pinned ? activityText(pinned) : null;
  if (!pinned || !copy) return null;
  return (
    <section className={className}>
      <p>
        <strong>{copy.title}</strong>
        <span className="block text-xs">{copy.detail}</span>
      </p>
      <Button size="xs" onClick={pinned.check}>
        Check result
      </Button>
    </section>
  );
}

interface PersistentToast {
  title: string;
  description: string;
  type: Tone;
  action?: { children: string; onClick: () => void };
}

/** One long-lived toast mirroring `source`; it updates only when `source` changes identity. */
function usePersistentToast(source: unknown, content: PersistentToast | null) {
  const toasts = useToastManager();
  const id = useRef<string | null>(null);
  // The toast manager changes identity whenever a toast changes, so only react to new sources.
  const applied = useRef<unknown>(undefined);
  useEffect(() => {
    if (applied.current === source) return;
    applied.current = source;
    if (!content) {
      if (id.current) toasts.close(id.current);
      id.current = null;
      return;
    }
    const options = {
      title: content.title,
      description: content.description,
      type: content.type,
      timeout: 0,
      actionProps: content.action,
    };
    if (id.current) toasts.update(id.current, options);
    else id.current = toasts.add(options);
  }, [content, source, toasts]);
}

/** Variant A: toasts for activity and outcomes. */
function ToastPresentation({ model }: { model: Model }) {
  const toasts = useToastManager();
  const shown = useRef(new Set<number>());
  const { notices, activity, pinned, ownCut, clip } = model.state;

  useEffect(() => {
    for (const notice of notices) {
      if (shown.current.has(notice.id) || Date.now() - notice.at > 1000) continue;
      shown.current.add(notice.id);
      toasts.add({
        title: notice.title,
        description: notice.detail,
        type: notice.tone,
        timeout: notice.tone === "error" || notice.tone === "warning" ? 9000 : 5000,
        actionProps: notice.action
          ? { children: notice.action.label, onClick: notice.action.run }
          : undefined,
      });
    }
  }, [notices, toasts]);

  const activityCopy = activityText(activity);
  usePersistentToast(
    activity,
    activityCopy
      ? {
          title: activityCopy.title,
          description: activityCopy.detail,
          type: "info",
          action:
            activity.kind === "ready"
              ? { children: activity.op === "cut" ? "Cut" : "Copy", onClick: model.copyPrepared }
              : activity.kind === "preparing" && activity.op !== "duplicate"
                ? { children: "Cancel", onClick: model.cancelActivity }
                : undefined,
        }
      : null,
  );

  const pinnedCopy = pinned ? activityText(pinned) : null;
  usePersistentToast(
    pinned,
    pinned && pinnedCopy
      ? {
          title: pinnedCopy.title,
          description: pinnedCopy.detail,
          type: "warning",
          action: { children: "Check result", onClick: pinned.check },
        }
      : null,
  );

  usePersistentToast(
    ownCut,
    ownCut
      ? {
          title: `Cut ${clip?.op === "cut" ? snapshotSummary(clip.snapshot) : `${ownCut.nodeIds.length} nodes`}: paste to move`,
          description:
            ownCut.status === "reserved"
              ? "A paste is moving them now."
              : "The originals stay until a paste succeeds. Esc also cancels the move.",
          type: "info",
          action:
            ownCut.status === "active"
              ? { children: "Cancel move", onClick: () => model.revokeOwnCut("Move cancelled") }
              : undefined,
        }
      : null,
  );

  return null;
}

const TONE_CLASS: Record<Tone, string> = {
  success: "text-emerald-500",
  info: "text-sky-500",
  warning: "text-amber-500",
  error: "text-red-500",
};

/** Variant B: a persistent clipboard dock with a visible pipeline and history. */
function ClipboardDock({ model, showName }: { model: Model; showName: string }) {
  const { activity, clip, ownCut, notices } = model.state;
  const step =
    activity.kind === "preparing"
      ? activity.phase === "saving"
        ? 1
        : 2
      : activity.kind === "ready" && !activity.silent
        ? 3
        : 0;
  const busy = step > 0 && !(activity.kind === "preparing" && activity.silent);
  return (
    <aside
      aria-label="Clipboard"
      className="absolute top-3 left-3 z-10 w-80 rounded-xl border border-border bg-card/95 text-sm shadow-xl backdrop-blur"
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <strong>Clipboard</strong>
        <span className="text-xs text-muted-foreground">{showName}</span>
      </header>
      {busy ? (
        <section className="space-y-2 border-b border-border px-3 py-2">
          <ol className="flex gap-2 text-xs">
            {["Save edits", "Collect", "Write"].map((label, index) => (
              <li
                key={label}
                className={
                  index + 1 < step
                    ? "text-emerald-500"
                    : index + 1 === step
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                }
              >
                {index + 1 < step ? "✓" : `${index + 1}.`} {label}
              </li>
            ))}
          </ol>
          <p>{activityText(activity)?.detail}</p>
          <div className="flex justify-end gap-2">
            <ActivityActions model={model} size="xs" />
          </div>
        </section>
      ) : null}
      <PinnedOutcome
        model={model}
        className="flex items-start justify-between gap-2 border-b border-border bg-amber-500/10 px-3 py-2"
      />
      <section className="space-y-2 border-b border-border px-3 py-2">
        {clip ? (
          <>
            <p>
              {clip.op === "cut" ? "Cut" : "Copied"} {snapshotSummary(clip.snapshot)}
              <span className="block text-xs text-muted-foreground">
                from {clip.snapshot.source.showName}, revision {clip.snapshot.source.revision}
              </span>
            </p>
            {ownCut ? (
              <div className="flex items-center justify-between rounded-md border border-dashed border-amber-500 px-2 py-1 text-xs">
                <span>Pending move · originals stay until pasted</span>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => model.revokeOwnCut("Move cancelled")}
                >
                  Cancel move
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            Nothing copied in this tab yet. {MOD}V still reads the system clipboard.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="outline"
            onClick={() => model.requestPaste({ kind: "menu" }, { kind: "in-place" })}
          >
            Paste
          </Button>
        </div>
      </section>
      <ol className="max-h-48 space-y-1 overflow-auto px-3 py-2 text-xs">
        {[...notices]
          .reverse()
          .slice(0, 6)
          .map((notice) => (
            <li key={notice.id}>
              <span className={TONE_CLASS[notice.tone]}>●</span> <strong>{notice.title}</strong>
              {notice.detail ? (
                <span className="block text-muted-foreground">{notice.detail}</span>
              ) : null}
            </li>
          ))}
      </ol>
    </aside>
  );
}

/** Variant C: a HUD pill at the top of the canvas plus ghost placement. */
function CanvasHud({
  model,
  wrapperRef,
  editorRef,
}: {
  model: Model;
  wrapperRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<ShowGraphEditorHandle | null>;
}) {
  const { activity, notices, ownCut, ghost } = model.state;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  const text = activityText(activity);
  const latestNotice = notices.at(-1);
  const recent = latestNotice && now - latestNotice.at < 6000 ? latestNotice : null;
  const wrapper = wrapperRef.current?.getBoundingClientRect();
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex flex-col items-center gap-2">
        <PinnedOutcome
          model={model}
          className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-full border border-amber-500 bg-card px-4 py-2 text-sm shadow-lg"
        />
        {text ? (
          <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-lg">
            <span>
              <strong>{text.title}</strong>{" "}
              <span className="text-muted-foreground">{text.detail}</span>
            </span>
            <ActivityActions model={model} size="xs" />
          </div>
        ) : recent ? (
          <div className="pointer-events-auto max-w-xl rounded-2xl border border-border bg-card px-4 py-2 text-sm shadow-lg">
            <span className={TONE_CLASS[recent.tone]}>●</span> <strong>{recent.title}</strong>
            {recent.detail ? (
              <span className="block text-xs text-muted-foreground">{recent.detail}</span>
            ) : null}
          </div>
        ) : null}
        {ownCut ? (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-dashed border-amber-500 bg-card px-3 py-1 text-xs shadow">
            Moving {ownCut.nodeIds.length} node{ownCut.nodeIds.length === 1 ? "" : "s"} · paste to
            place ·
            <button
              type="button"
              className="underline"
              onClick={() => model.revokeOwnCut("Move cancelled")}
            >
              Esc to cancel
            </button>
          </div>
        ) : null}
      </div>
      {ghost && wrapper ? (
        <GhostLayer model={model} wrapper={wrapper} editorRef={editorRef} ghost={ghost} />
      ) : null}
    </>
  );
}

function GhostLayer({
  model,
  wrapper,
  editorRef,
  ghost,
}: {
  model: Model;
  wrapper: DOMRect;
  editorRef: RefObject<ShowGraphEditorHandle | null>;
  ghost: Ghost;
}) {
  const handle = editorRef.current;
  const a = handle?.toFlowPosition({ x: 0, y: 0 }) ?? { x: 0, y: 0 };
  const b = handle?.toFlowPosition({ x: 100, y: 0 }) ?? { x: 100, y: 0 };
  const zoom = 100 / Math.max(1, b.x - a.x);
  const { snapshot } = ghost;
  const positions = Object.values(snapshot.absolute);
  const origin = positions.reduce(
    (min, position) => ({ x: Math.min(min.x, position.x), y: Math.min(min.y, position.y) }),
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );
  const roots = snapshot.nodes.filter(
    (node) => !node.parentId || !snapshot.nodes.some((other) => other.id === node.parentId),
  );
  const onlyLoose = roots.every(
    (node) => node.kind === "scene" || node.kind === "source" || node.kind === "transformer",
  );
  const flowName = ghost.flowId
    ? model.graph.current.nodes.find((node) => node.id === ghost.flowId)?.name
    : null;
  const label = !onlyLoose
    ? "Flows and Devices stay at Show level"
    : flowName
      ? `Into “${flowName}”`
      : "At Show level";
  const flowRect =
    onlyLoose && ghost.flowId
      ? document
          .querySelector(`.react-flow__node[data-id="${ghost.flowId}"]`)
          ?.getBoundingClientRect()
      : undefined;
  const local = (screen: Position) => ({
    left: screen.x - wrapper.left,
    top: screen.y - wrapper.top,
  });
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {flowRect ? (
        <div
          className="absolute rounded-xl border-2 border-sky-500 bg-sky-500/5"
          style={{
            ...local({ x: flowRect.left, y: flowRect.top }),
            width: flowRect.width,
            height: flowRect.height,
          }}
        />
      ) : null}
      {snapshot.nodes.map((node) => {
        const position = snapshot.absolute[node.id] ?? node.position;
        const children = snapshot.nodes.filter((child) => child.parentId === node.id);
        const extent = children.reduce(
          (max, child) => {
            const at = snapshot.absolute[child.id] ?? child.position;
            return {
              x: Math.max(max.x, at.x + NODE_WIDTH - position.x + FLOW_PADDING),
              y: Math.max(max.y, at.y + NODE_HEIGHT * 2 - position.y + FLOW_PADDING),
            };
          },
          { x: NODE_WIDTH, y: NODE_HEIGHT },
        );
        return (
          <div
            key={node.id}
            className="absolute truncate rounded-lg border-2 border-dashed border-sky-400 bg-sky-400/10 px-2 py-1 text-xs text-foreground"
            style={{
              ...local({
                x: ghost.screen.x + (position.x - origin.x) * zoom,
                y: ghost.screen.y + (position.y - origin.y) * zoom,
              }),
              width: extent.x * zoom,
              height: extent.y * zoom,
            }}
          >
            {node.name}
          </div>
        );
      })}
      <div
        className="absolute rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white shadow"
        style={local({ x: ghost.screen.x, y: ghost.screen.y - 30 })}
      >
        {label} · click to place · Enter places here · Esc cancels
      </div>
    </div>
  );
}

function PromptDialog({ model }: { model: Model }) {
  const { prompt } = model.state;
  if (!prompt) return null;
  const close = () => model.set({ prompt: null });
  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) {
          close();
          prompt.onCancel?.();
        }
      }}
    >
      <DialogContent className="w-[min(34rem,calc(100vw-2rem))]">
        <DialogTitle>{prompt.title}</DialogTitle>
        <DialogDescription render={<div className="space-y-3 text-sm" />}>
          {prompt.body}
        </DialogDescription>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              close();
              prompt.onCancel?.();
            }}
          >
            Cancel
          </Button>
          {prompt.actions.map((action) => (
            <Button
              key={action.label}
              variant={action.tone ?? "default"}
              onClick={() => {
                close();
                action.run();
              }}
            >
              {action.label}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioPanel({ model }: { model: Model }) {
  const { scenarios } = model.state;
  const toggle = (key: keyof Scenarios, label: string) => (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={Boolean(scenarios[key])}
        onChange={(event) =>
          model.set({ scenarios: { ...scenarios, [key]: event.target.checked } })
        }
      />
      {label}
    </label>
  );
  const { state } = model;
  const dump = {
    activity:
      state.activity.kind === "ready"
        ? { ...state.activity, snapshot: snapshotSummary(state.activity.snapshot) }
        : state.activity,
    pinned: state.pinned?.summary ?? null,
    revision: state.revision,
    selection: state.selection,
    clip: state.clip
      ? {
          op: state.clip.op,
          from: state.clip.snapshot.source,
          cutIntentId: state.clip.snapshot.cutIntentId,
        }
      : null,
    ownCut: state.ownCut,
    lastPaste: state.lastPaste,
  };
  return (
    <div className="absolute right-0 bottom-12 w-[26rem] space-y-3 rounded-xl border border-dashed border-amber-500 bg-card p-3 text-xs text-foreground shadow-2xl">
      <p className="font-semibold">Prototype scenarios (not part of the design)</p>
      <div className="grid grid-cols-2 gap-1">
        {toggle("pendingSaves", "Edits still saving at Copy")}
        {toggle("saveFails", "Save fails")}
        {toggle("slowCapture", "Capture hits deadline (4s here)")}
        {toggle("captureFails", "Canvas can't be read")}
        {toggle("speculative", "Prepare on selection")}
        {toggle("unfinishedGesture", "Rename in progress")}
        {toggle("writeRejects", "Clipboard write rejected")}
        {toggle("readDenied", "Menu Paste read denied")}
        {toggle("removalFails", "Source removal fails")}
      </div>
      <label className="flex items-center gap-2">
        Next paste/duplicate outcome
        <select
          value={scenarios.outcome}
          onChange={(event) => {
            const outcome = event.target.value;
            if (
              outcome === "committed" ||
              outcome === "unpublished" ||
              outcome === "rejected" ||
              outcome === "unknown"
            ) {
              model.set({ scenarios: { ...scenarios, outcome } });
            }
          }}
          className="rounded border border-input bg-background px-1"
        >
          <option value="committed">Committed</option>
          <option value="unpublished">Saved, not publishable</option>
          <option value="rejected">Rejected (version changed)</option>
          <option value="unknown">Unknown (response lost)</option>
        </select>
      </label>
      <label className="flex items-center gap-2">
        Unknown resolves to
        <select
          value={scenarios.unknownResolvesTo}
          onChange={(event) =>
            model.set({
              scenarios: {
                ...scenarios,
                unknownResolvesTo: event.target.value === "rejected" ? "rejected" : "committed",
              },
            })
          }
          className="rounded border border-input bg-background px-1"
        >
          <option value="committed">Committed</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[10px] leading-tight">
        {JSON.stringify(dump, null, 2)}
      </pre>
    </div>
  );
}

function PrototypeBar({
  model,
  variant,
  show,
  onVariant,
}: {
  model: Model;
  variant: Variant;
  show: PrototypeShow;
  onVariant: (variant: Variant) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;
  const other: ShowKey = show.key === "hamlet" ? "tempest" : "hamlet";
  const step = (delta: number) =>
    onVariant(
      VARIANTS[(VARIANTS.indexOf(variant) + delta + VARIANTS.length) % VARIANTS.length] ?? "A",
    );
  return (
    <nav
      aria-label="Prototype variants"
      className="fixed bottom-3 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-foreground px-4 py-2 text-sm text-background shadow-xl"
    >
      <button type="button" aria-label="Previous variant" onClick={() => step(-1)} className="px-2">
        ←
      </button>
      <span className="min-w-60 text-center">
        {variant} · {VARIANT_NAMES[variant]}
      </span>
      <button type="button" aria-label="Next variant" onClick={() => step(1)} className="px-2">
        →
      </button>
      <span className="opacity-60">|</span>
      <span>{show.name}</span>
      <button
        type="button"
        className="underline"
        onClick={() => {
          const url = new URL(window.location.href);
          url.searchParams.set("show", other);
          window.open(url, "_blank");
        }}
      >
        Open {PROTOTYPE_SHOWS[other].name} ↗
      </button>
      <span className="opacity-60">|</span>
      <div className="relative">
        <button type="button" className="underline" onClick={() => setOpen((value) => !value)}>
          Scenarios
        </button>
        {open ? <ScenarioPanel model={model} /> : null}
      </div>
    </nav>
  );
}

function pendingCutCss(nodeIds: readonly string[]): string {
  if (nodeIds.length === 0) return "";
  const selector = nodeIds.map((id) => `.react-flow__node[data-id="${id}"]`).join(",");
  return `${selector}{opacity:.45;outline:2px dashed rgb(245 158 11);outline-offset:6px;border-radius:14px}`;
}

export function GraphClipboardPrototype() {
  const [variant, setVariant] = useState<Variant>(() =>
    readParam("variant", (value) => (value === "B" || value === "C" ? value : "A")),
  );
  const [show] = useState<PrototypeShow>(
    () => PROTOTYPE_SHOWS[readParam("show", (value) => (isShowKey(value) ? value : "hamlet"))],
  );
  const editorRef = useRef<ShowGraphEditorHandle | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const model = useClipboardModel({ show, variant, editorRef, wrapperRef });
  const { ghost, ownCut } = model.state;

  const changeVariant = (next: Variant) => {
    setParam("variant", next);
    setVariant(next);
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      if (focusContext().inTextInput) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next =
        VARIANTS[(VARIANTS.indexOf(variant) + delta + VARIANTS.length) % VARIANTS.length] ?? "A";
      setParam("variant", next);
      setVariant(next);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  return (
    <>
      <MockEditorChrome header={{ name: show.name }}>
        <div
          ref={wrapperRef}
          className="relative h-full w-full"
          onPointerMove={(event) => {
            model.pointer.current = {
              screen: { x: event.clientX, y: event.clientY },
              inside: true,
            };
            if (ghost) {
              const screen = { x: event.clientX, y: event.clientY };
              model.set({ ghost: { ...ghost, screen, flowId: model.flowAt(screen) } });
            }
          }}
          onPointerLeave={() => {
            model.pointer.current = { ...model.pointer.current, inside: false };
          }}
          onPointerDownCapture={(event) => {
            if (!ghost || event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            model.placeGhost({ x: event.clientX, y: event.clientY });
          }}
          onContextMenuCapture={(event) => {
            model.menuPoint.current = { x: event.clientX, y: event.clientY };
          }}
        >
          <ShowGraphEditor
            ref={editorRef}
            graph={show.graph}
            imageAssets={[]}
            onEdit={(_edits, next) => model.onUserEdit(next)}
            contextMenuItems={<ClipboardMenuItems model={model} variant={variant} />}
          />
          <style>{pendingCutCss(ownCut?.nodeIds ?? [])}</style>
          {variant === "B" ? <ClipboardDock model={model} showName={show.name} /> : null}
          {variant === "C" ? (
            <CanvasHud model={model} wrapperRef={wrapperRef} editorRef={editorRef} />
          ) : null}
        </div>
      </MockEditorChrome>
      {variant === "A" ? <ToastPresentation model={model} /> : null}
      <PromptDialog model={model} />
      <PrototypeBar model={model} variant={variant} show={show} onVariant={changeVariant} />
    </>
  );
}
