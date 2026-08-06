// The node bodies (issue #42, per #35's visual language).
//
// #35's rules, and why each is here rather than somewhere more obvious:
//
//   - **Icon + label, identical chrome.** No per-kind hue: the design system's
//     tokens are semantic, hue is reserved for *state*, and PRD §7 wants the
//     chrome recessive. So identity is `nodeIcon(kind)` plus the name.
//   - **A Scene grows a row per Variable, each with its own handle.** #20
//     makes Variables named handles; an unlabelled port would be unusable, and
//     a wiring edge has to land on the row rather than on the node.
//   - **Fixed width, truncating.** Full values live in the inspector. No
//     resizing — that would mean a resize command and a schema field.
//   - **Selected is `ring-2 ring-primary`; drag-targetable is a dashed
//     outline** (#36's correction to #35: `ring` is primary-derived, so the
//     two treatments would have been indistinguishable). Non-targetable nodes
//     dim to 25% during a drag, which answers "why can't I drop here" by
//     showing where you can, without painting the canvas red.
//   - **Dangling input**: a `destructive` dot on the Variable row plus a
//     header warning. The only state here that means the Show breaks at
//     performance time, reachable by a legal action, and otherwise invisible.
//     No downstream propagation — that's the consuming node's own concern
//     (#29).
//
// Inline rename lives in the node (double-click, or F2) because the name is
// the node's own text (#27); everything fuller is the inspector's.
import { cn } from "@mechane/design-system";
import { Check, ChevronDown, ChevronRight, Copy, House, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, useConnection } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";

import { INPUT_HANDLE, OUTPUT_HANDLE, VARIABLE_ROW_HEIGHT } from "./graph-to-flow";
import type { ShowFlowNode as ShowFlowNodeType, ShowNodeData } from "./graph-to-flow";
import { nodeIcon, NODE_KIND_META } from "./node-kinds";
import { useNodeInteraction } from "./node-interaction";

/** Handle styling — token-driven, like everything else React Flow ships raw. */
const HANDLE_CLASS =
  "!h-2 !w-2 !border-background !bg-muted-foreground data-[targetable=true]:!bg-primary";

/**
 * Node chrome shared by every kind (#35: identical `card` chrome), plus the
 * three states that read visually.
 */
function nodeClass({
  selected,
  targetable,
  dimmed,
}: {
  selected: boolean;
  targetable: boolean;
  dimmed: boolean;
}) {
  return cn(
    "h-full w-full overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-opacity",
    selected && "border-primary ring-2 ring-primary shadow-lg",
    // Dashed, not `ring` — see the header note on #36's correction.
    targetable &&
      !selected &&
      "border-dashed border-primary/70 outline-1 outline-dashed outline-primary/70",
    dimmed && "opacity-25",
  );
}

interface HeaderProps {
  nodeId: string;
  data: ShowNodeData;
  /** Rendered smaller inside a Flow's title bar. */
  variant?: "node" | "flow";
}

function NodeHeader({ nodeId, data, variant = "node" }: HeaderProps) {
  const { renaming, renameTo, commitRename, cancelRename } = useNodeInteraction();
  const isRenaming = renaming === nodeId;
  const Icon = nodeIcon(data.kind, { perConnection: data.perConnection });
  const wiredVariableIds = new Set(data.wiredVariableIds);
  const dangling = data.variables.filter((variable) => !wiredVariableIds.has(variable.id));

  return (
    <div
      className={cn("flex min-w-0 items-center gap-2 px-3", variant === "node" ? "py-2" : "py-1.5")}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {isRenaming ? (
        <RenameField
          initialValue={data.name}
          onCommit={renameTo}
          onDone={commitRename}
          onCancel={cancelRename}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{data.name}</span>
      )}
      {data.isDefaultScene ? (
        // The Flow's design-time entry point (#23) — not a runtime "current
        // Scene", which this canvas deliberately doesn't represent (#35).
        <House
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-label="Flow's default Scene"
        />
      ) : null}
      {dangling.length > 0 ? (
        <TriangleAlert
          className="size-3.5 shrink-0 text-destructive"
          aria-label={`${dangling.length} Variable${dangling.length === 1 ? "" : "s"} with nothing wired in`}
        />
      ) : null}
      {data.kind === "device" && !data.driven ? (
        // A Device nothing drives displays nothing at performance time —
        // the same class of invisible-until-too-late mistake as a dangling
        // Variable, and marked the same way. It is not an error: creating
        // the projector before the Flow is ordinary work (#45).
        <TriangleAlert
          className="size-3.5 shrink-0 text-destructive"
          aria-label="Nothing is wired to this Device"
        />
      ) : null}
      {variant === "flow" && data.childCount > 0 ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          {data.childCount} {data.childCount === 1 ? "node" : "nodes"}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The inline rename field. Renders inside the node it renames, and lives in
 * `.nokey` so React Flow's own key handling leaves it alone while typing —
 * which is also what stops Backspace deleting the node mid-rename.
 */
function RenameField({
  initialValue,
  onCommit,
  onDone,
  onCancel,
}: {
  initialValue: string;
  onCommit(name: string): void;
  onDone(): void;
  onCancel(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.select();
  }, []);
  return (
    <input
      ref={input}
      className="nokey min-w-0 flex-1 rounded-sm bg-background px-1 text-sm font-medium outline-1 outline-primary"
      defaultValue={initialValue}
      aria-label="Name"
      autoFocus
      // Every keystroke is a command, coalesced into one undo entry by the
      // gesture wrapping the rename (#28) — so typing six letters is one
      // Cmd+Z, and the graph is live-correct while it's happening.
      onChange={(event) => onCommit(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") onDone();
        if (event.key === "Escape") onCancel();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}

/** Whether a connection is being dragged, and what it may land on. */
function useDragState(nodeId: string) {
  const { targets, connecting } = useNodeInteraction();
  // React Flow knows when a connection is in flight; the *targets* are the
  // domain's answer (`connectionTargets`), gathered at drag start.
  const connectionNodeId = useConnection((connection) =>
    connection.inProgress ? connection.fromNode.id : null,
  );
  const inFlight = connecting || connectionNodeId !== null;
  const targetable = inFlight && (targets?.nodeIds.has(nodeId) ?? false);
  return {
    targetable,
    // The node being dragged *from* isn't dimmed: it's the subject of the
    // gesture, not a rejected target.
    dimmed: inFlight && !targetable && connectionNodeId !== nodeId,
    variableIds: targets?.variableIds,
  };
}

/**
 * A Device's pairing code, with a button to copy it (#6's criterion, kept
 * in #45).
 *
 * The code, not the QR: a QR small enough to sit on a canvas node is too
 * small to scan and too loud for chrome PRD §7 wants recessive, so the
 * scannable one lives in the inspector, where it can be big. What a
 * director needs *here* is to read a code off the node they're wiring.
 *
 * Before the first save there is no code to show — ids are minted on the
 * client, codes on the server (#45) — so the row holds its place with a
 * placeholder rather than appearing later and reflowing the node.
 */
function PairingCode({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);

  // Copying is a canvas gesture on a node that also responds to clicks and
  // double-clicks; without this the copy would also select or rename.
  const copy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!code) return;
      void navigator.clipboard.writeText(code).then(() => setCopied(true));
    },
    [code],
  );

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center gap-1.5 px-3 pb-2">
      <span
        className={cn(
          "min-w-0 flex-1 font-mono text-xs tabular-nums",
          code ? "text-muted-foreground" : "text-muted-foreground/50",
        )}
      >
        {code ?? "······"}
      </span>
      <button
        type="button"
        // Nothing to copy until the graph has been saved once.
        disabled={!code}
        onClick={copy}
        // React Flow would otherwise start a node drag from the button.
        onMouseDown={(event) => event.stopPropagation()}
        className="nodrag shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label={code ? `Copy pairing code ${code}` : "Pairing code not assigned yet"}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

export function ShowNode({ id, data, selected }: NodeProps<ShowFlowNodeType>) {
  const { targetable, dimmed, variableIds } = useDragState(id);
  const { beginRename } = useNodeInteraction();
  const wiredVariableIds = new Set(data.wiredVariableIds);
  const hasVariables = data.variables.length > 0;

  return (
    <div
      className={nodeClass({ selected: Boolean(selected), targetable, dimmed })}
      onDoubleClick={() => beginRename(id)}
      // React Flow's own `aria-label` names the node "Node"; the kind and name
      // are what a keyboard user Tabbing through actually needs.
      aria-label={`${NODE_KIND_META[data.kind].label}: ${data.name}`}
    >
      <NodeHeader nodeId={id} data={data} />

      {data.kind === "device" ? <PairingCode code={data.pairingCode} /> : null}

      {hasVariables ? (
        <ul className="flex flex-col pb-2">
          {data.variables.map((variable) => {
            const wired = wiredVariableIds.has(variable.id);
            return (
              <li
                key={variable.id}
                className="relative flex items-center gap-1.5 px-3 text-xs text-muted-foreground"
                style={{ height: VARIABLE_ROW_HEIGHT }}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    wired ? "bg-muted-foreground" : "bg-destructive",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{variable.name}</span>
                {/* Each Variable's own handle, on its own row (#20, #35). */}
                <Handle
                  id={variable.id}
                  type="target"
                  position={Position.Left}
                  className={HANDLE_CLASS}
                  data-targetable={variableIds?.has(variable.id) ?? false}
                  isConnectableStart={false}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* The node-level input: what a Navigate or Device edge lands on. A
          Scene's Variables are addressed separately, above. */}
      <Handle
        id={INPUT_HANDLE}
        type="target"
        position={Position.Left}
        className={cn(HANDLE_CLASS, hasVariables && "!top-6")}
        data-targetable={targetable}
        isConnectableStart={false}
      />
      <Handle
        id={OUTPUT_HANDLE}
        type="source"
        position={Position.Right}
        className={cn(HANDLE_CLASS, hasVariables && "!top-6")}
        isConnectableEnd={false}
      />
    </div>
  );
}

/**
 * A Flow renders as the container its children sit inside — React Flow sizes
 * it from the `style` ./graph-to-flow computed, so this paints it and carries
 * the title bar #35 specifies (name, node count, and the Device handle).
 *
 * Collapse is #44's: it's local view state, outside the Command system
 * entirely (#28), and the title bar is deliberately the same shape either way
 * so collapsing reads as the node shrinking rather than becoming a new thing.
 */
export function ShowFlowNode({ id, data, selected }: NodeProps<ShowFlowNodeType>) {
  const { targetable, dimmed } = useDragState(id);
  const { beginRename, toggleCollapse } = useNodeInteraction();

  return (
    <div
      className={cn(
        "h-full w-full rounded-xl border border-border bg-accent/20 transition-opacity",
        selected && "border-primary ring-2 ring-primary",
        targetable &&
          !selected &&
          "border-dashed border-primary/70 outline-1 outline-dashed outline-primary/70",
        dimmed && "opacity-25",
      )}
      onDoubleClick={(event) => {
        // A double-click on a child bubbles here too; only the Flow's own
        // chrome should rename the Flow.
        if (
          event.currentTarget !== event.target &&
          !event.currentTarget.contains(event.target as Node)
        )
          return;
        beginRename(id);
      }}
      aria-label={`Flow: ${data.name}`}
    >
      <div className="border-b border-border/60 bg-card/40">
        <div className="flex items-center">
          <button
            type="button"
            className="nodrag nopan shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label={data.collapsed ? `Expand Flow ${data.name}` : `Collapse Flow ${data.name}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapse(id);
            }}
          >
            {data.collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <NodeHeader nodeId={id} data={data} variant="flow" />
          </div>
        </div>
      </div>
      <Handle
        id={INPUT_HANDLE}
        type="target"
        position={Position.Left}
        className={HANDLE_CLASS}
        data-targetable={targetable}
        isConnectableStart={false}
      />
      <Handle
        id={OUTPUT_HANDLE}
        type="source"
        position={Position.Right}
        className={HANDLE_CLASS}
        isConnectableEnd={false}
      />
    </div>
  );
}
