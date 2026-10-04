// The Source-value clipboard controls (#896–#900): an explicit Default /
// Current plane selector, a nested-Field selector that never crosses an
// array, a required Shared Instance selector for Flow-local Current
// targets, and the focused non-text value region that owns native value
// Copy/Paste (#876's accepted interaction).
//
// Ordinary inputs and noncollapsed selected text keep their native editing
// behaviour: the region only claims gestures aimed at the value itself.
// Values offer neither Cut nor Duplicate. All state lives in the editor
// level provider (./value-transfer-context.tsx); this component only
// chooses the explicit destination and wires gestures to it.
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ClipboardIcon,
  ClipboardPasteIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SectionHelperText,
  SectionRow,
  ToggleGroup,
  ToggleGroupItem,
} from "@mechane/design-system";
import { formatValuePath, type SourceNode } from "@mechane/domain/graph";
import { RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { SourceValueEditing } from "../../commands/use-graph-editing";
import {
  useOptionalSourceValueClipboard,
  type SourceValueClipboardApi,
} from "./value-transfer-context";
import {
  currentTargetUnavailableReason,
  selectableFieldPaths,
  type ValueTransferSelection,
} from "./value-transfer-state";

const CATEGORY_LABELS: Record<string, string> = {
  "browser-failure": "Browser clipboard failure",
  "rejected-input": "Rejected input",
  "commit-rejected": "Commit rejected",
  "outcome-unknown": "Unknown outcome",
};

/** Selected text keeps native editing, including selections outside this region. */
function hasNoncollapsedSelection(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed && selection.rangeCount > 0;
}

export function SourceValueClipboard(props: { node: SourceNode; editing: SourceValueEditing }) {
  const clipboard = useOptionalSourceValueClipboard();
  return clipboard ? (
    <MountedSourceValueClipboard key={props.node.id} {...props} clipboard={clipboard} />
  ) : null;
}

function MountedSourceValueClipboard({
  node,
  editing,
  clipboard,
}: {
  node: SourceNode;
  editing: SourceValueEditing;
  clipboard: SourceValueClipboardApi;
}) {
  const [plane, setPlane] = useState<"default" | "current">("default");
  const [fieldPath, setFieldPath] = useState<string[]>([]);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);

  const wired = useMemo(
    () => editing.graph.edges.some((edge) => edge.kind === "wiring" && edge.targetId === node.id),
    [editing.graph.edges, node.id],
  );
  const fieldOptions = useMemo(
    () => selectableFieldPaths(node.type, editing.graph.shapes ?? []),
    [editing.graph.shapes, node.type],
  );
  const fieldLabel =
    fieldPath.length === 0
      ? "whole Source"
      : (fieldOptions.find(
          (option) =>
            option.fieldPath.length === fieldPath.length &&
            option.fieldPath.every((segment, index) => segment === fieldPath[index]),
        )?.label ?? formatValuePath(fieldPath));

  const scope = node.parentId === null ? "show" : "flow";
  const selection = useMemo<ValueTransferSelection | null>(
    () =>
      clipboard.showId
        ? {
            showId: clipboard.showId,
            sourceId: node.id,
            plane,
            scope,
            fieldPath,
            instanceId: plane === "current" ? instanceId : null,
            incomingWired: wired,
          }
        : null,
    [clipboard.showId, fieldPath, instanceId, node.id, plane, scope, wired],
  );

  const select = clipboard.select;
  useLayoutEffect(() => {
    select(selection);
  }, [select, selection]);
  useLayoutEffect(() => () => select(null), [select]);
  const handleNativeCopy = clipboard.handleNativeCopy;
  useEffect(() => {
    const copy = (event: ClipboardEvent) => {
      if (
        document.activeElement !== regionRef.current ||
        hasNoncollapsedSelection() ||
        !event.clipboardData
      )
        return;
      event.preventDefault();
      handleNativeCopy(event.clipboardData);
    };
    const cut = (event: ClipboardEvent) => {
      if (document.activeElement === regionRef.current && !hasNoncollapsedSelection())
        event.preventDefault();
    };
    document.addEventListener("copy", copy, true);
    document.addEventListener("cut", cut, true);
    return () => {
      document.removeEventListener("copy", copy, true);
      document.removeEventListener("cut", cut, true);
    };
  }, [handleNativeCopy]);

  const unavailable =
    plane === "current" && selection
      ? currentTargetUnavailableReason(selection, clipboard.context, clipboard.contextState)
      : null;
  const preparation = clipboard.copyPreparation;
  const preparationReady =
    preparation.kind === "ready" &&
    preparation.selection.sourceId === node.id &&
    preparation.selection.plane === plane;
  const pasteBusy = clipboard.pastePhase.kind !== "idle";
  const pasteBlocked = wired || unavailable !== null || pasteBusy;
  const runInfo = clipboard.context?.activeRun ?? null;

  return (
    <div className="col-span-full flex flex-col gap-2">
      <SectionRow>
        <ToggleGroup
          className="col-span-full bg-transparent flex w-full"
          value={[plane]}
          onValueChange={([next]) => {
            if (next === "default" || next === "current") setPlane(next);
          }}
        >
          <ToggleGroupItem value="default" className="grow">
            Default
          </ToggleGroupItem>
          <ToggleGroupItem value="current" className="grow">
            Current
          </ToggleGroupItem>
        </ToggleGroup>
      </SectionRow>

      <SectionRow>
        <Select
          value={fieldPath.join("\u0000")}
          onValueChange={(value) => setFieldPath(value ? value.split("\u0000") : [])}
        >
          <SelectTrigger aria-label="Selected Field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Whole Source</SelectItem>
            {fieldOptions.map((option) => (
              <SelectItem
                key={option.fieldPath.join("\u0000")}
                value={option.fieldPath.join("\u0000")}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SectionRow>

      {plane === "current" ? (
        <>
          <SectionHelperText>
            {clipboard.contextState === "loading"
              ? "Reading Run state…"
              : clipboard.contextState === "failed"
                ? (clipboard.contextFailure ?? "Current is unavailable right now.")
                : runInfo
                  ? `Current in Run ${runInfo.runId} (published graph version ${runInfo.publishedVersion}).`
                  : "No active Run."}
          </SectionHelperText>
          {scope === "flow" && clipboard.contextState === "ready" ? (
            <SectionRow>
              <Select
                value={instanceId ?? ""}
                onValueChange={(value) => setInstanceId(value === "" ? null : value)}
              >
                <SelectTrigger aria-label="Shared Device Instance">
                  <SelectValue placeholder="Select Shared Device Instance" />
                </SelectTrigger>
                <SelectContent>
                  {(clipboard.context?.instances ?? []).map((candidate) => (
                    <SelectItem key={candidate.instanceId} value={candidate.instanceId}>
                      {candidate.deviceName} ({candidate.instanceId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SectionRow>
          ) : null}
          {scope === "flow" &&
          (clipboard.context?.instances.length ?? 0) === 0 &&
          clipboard.contextState === "ready" ? (
            <SectionHelperText>
              No eligible Shared Device Instance drives this Source's Flow.
            </SectionHelperText>
          ) : null}
          <SectionHelperText>
            {clipboard.summaryState === "loading"
              ? "Reading Current value…"
              : clipboard.summaryState === "failed"
                ? `Current could not be read: ${clipboard.summaryFailure ?? "evaluation failed"}.`
                : clipboard.summary && clipboard.summary.plainText !== null
                  ? `${clipboard.summary.scopeLabel}: ${clipboard.summary.plainText.length > 160 ? `${clipboard.summary.plainText.slice(0, 160)}…` : clipboard.summary.plainText}`
                  : clipboard.summary
                    ? clipboard.summary.scopeLabel
                    : (unavailable ?? "")}
          </SectionHelperText>
          {clipboard.summary?.copyOnly ? (
            <Badge variant="secondary">Incoming-wired — copy only</Badge>
          ) : null}
        </>
      ) : null}

      {/* The focused non-text value region: it owns native value Copy/Paste
          while ordinary inputs and selected text keep native behaviour. */}
      <div
        ref={regionRef}
        role="group"
        tabIndex={0}
        aria-label={`${plane === "default" ? "Default" : "Current"} value region for ${node.name}${fieldPath.length > 0 ? `, ${fieldLabel}` : ""}`}
        className="flex flex-col gap-2 rounded-sm border border-border p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPaste={(event) => {
          if (hasNoncollapsedSelection()) return;
          event.preventDefault();
          clipboard.handleNativePaste(event.clipboardData, event.currentTarget);
        }}
      >
        <span className="text-xs text-muted-foreground">
          {plane === "default" ? "Default" : "Current"} · {node.name}
          {fieldPath.length > 0 ? ` · ${fieldLabel}` : ""}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={preparation.kind === "preparing"}
            onClick={() =>
              preparationReady ? clipboard.writeCopy("typed") : clipboard.beginCopy()
            }
          >
            <ClipboardIcon />
            {preparation.kind === "preparing"
              ? "Preparing…"
              : preparationReady
                ? "Copy value now"
                : "Copy value"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={preparation.kind === "preparing"}
            onClick={() =>
              preparationReady ? clipboard.writeCopy("plain") : clipboard.beginCopy()
            }
          >
            <ClipboardIcon />
            {preparation.kind === "preparing"
              ? "Preparing…"
              : preparationReady
                ? "Copy plain JSON now"
                : "Copy plain JSON"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pasteBlocked}
            title={
              wired
                ? "Incoming-wired Sources are copy-only"
                : unavailable
                  ? unavailable
                  : clipboard.pastePhase.kind === "unknown" ||
                      clipboard.pastePhase.kind === "resolving"
                    ? "A submitted operation's outcome is unknown"
                    : undefined
            }
            onClick={() => {
              if (regionRef.current) clipboard.beginExplicitPaste(regionRef.current);
            }}
          >
            <ClipboardPasteIcon />
            {clipboard.pastePhase.kind === "reading" || clipboard.pastePhase.kind === "preparing"
              ? "Pasting…"
              : "Paste"}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {preparationReady
            ? "Prepared — click again (or Copy with this region focused) to write the clipboard."
            : "With this region focused, native Copy prepares and a second gesture writes; native Paste reads only that gesture's clipboard data. Plain JSON loses declared Types and internal sharing."}
        </span>
      </div>
      <ClipboardFeedback clipboard={clipboard} regionRef={regionRef} />
    </div>
  );
}

function ClipboardFeedback({
  clipboard,
  regionRef,
}: {
  clipboard: SourceValueClipboardApi;
  regionRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {clipboard.feedback.kind !== "none" ? (
        <Alert>
          <AlertTitle>
            {clipboard.feedback.kind === "copied"
              ? "Copied"
              : clipboard.feedback.kind === "committed"
                ? "Replaced"
                : (CATEGORY_LABELS[clipboard.feedback.diagnostic.category] ?? "Clipboard feedback")}
          </AlertTitle>
          <AlertDescription>
            {clipboard.feedback.kind === "copied"
              ? `The ${clipboard.feedback.mode === "typed" ? "typed" : "plain JSON"} representation is on the clipboard.`
              : clipboard.feedback.kind === "committed"
                ? clipboard.feedback.summary
                : clipboard.feedback.diagnostic.message}
            {clipboard.feedback.kind === "diagnostic" &&
            clipboard.feedback.diagnostic.path.length > 0
              ? ` (${formatValuePath([...clipboard.feedback.diagnostic.path])})`
              : ""}
            {clipboard.feedback.kind === "diagnostic"
              ? ` ${clipboard.feedback.diagnostic.nextAction}`
              : ""}
            {clipboard.feedback.kind === "diagnostic" &&
            clipboard.feedback.diagnostic.stage === "browser-read" ? (
              <AlertAction>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => regionRef.current?.focus()}
                >
                  Focus for native Paste
                </Button>
              </AlertAction>
            ) : null}
          </AlertDescription>
          {clipboard.pastePhase.kind === "unknown" || clipboard.pastePhase.kind === "resolving" ? (
            <AlertAction>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => clipboard.checkOutcome()}
                disabled={clipboard.pastePhase.kind === "resolving"}
              >
                {clipboard.pastePhase.kind === "resolving" ? "Checking…" : "Check result"}
              </Button>
            </AlertAction>
          ) : (
            <AlertAction>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => clipboard.dismissFeedback()}
              >
                Dismiss
              </Button>
            </AlertAction>
          )}
        </Alert>
      ) : null}
      {clipboard.pastePhase.kind === "unknown" || clipboard.pastePhase.kind === "resolving" ? (
        <SectionHelperText>
          A submitted replacement's outcome is unknown, so Paste and authored history stay blocked
          until its exact result is checked.
        </SectionHelperText>
      ) : null}
    </>
  );
}
