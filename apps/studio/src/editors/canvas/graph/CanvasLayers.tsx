import {
  DragDropProvider,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react";
import { PointerActivationConstraints, defaultPreset } from "@dnd-kit/dom";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/react";
import { defaultCollisionDetection } from "@dnd-kit/collision";
import type { CollisionDetector } from "@dnd-kit/collision";
import {
  ChevronRight,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  PuzzleIcon,
  SearchIcon,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  TvMinimalIcon,
} from "@mechane/design-system";
import { findCanvasElement } from "@mechane/commands";
import { useMemo, useRef, useState } from "react";

import type { Element as CanvasElement } from "@mechane/domain";
import type { CanvasArtboardDocument } from "../../../api/canvas";
import { fixedFillSizing } from "../commands/canvas-creation";
import { layerDropPlacement, layerDropPlacementInCanvas } from "../data/canvas-layer-drop";
import type { LayerDropZone } from "../data/canvas-layer-drop";
import { canvasLayerRows, expansionForSelection } from "../data/canvas-layer-tree";
import type { LayerRow } from "../data/canvas-layer-tree";
import { artboardLabel, shouldFrameForeignLayer } from "../data/canvas-workspace";
import type { CanvasSelection } from "./canvas-selection";
import { rangeSelection } from "./canvas-selection";
import { elementIconFor } from "./utils";

type LayerDragData = { rowId: string; artId: string };
type LayerDropData = LayerDragData & { zone: LayerDropZone };
type LayerDragState = {
  readonly source: LayerDragData;
  readonly expandedIds: readonly string[];
};

const LAYER_ROW_INDENT_REM = 0.75;
const LAYER_ROW_CONTENT_INSET_REM = 0.25;

function subtreeIds(element: CanvasElement): string[] {
  return [
    element.id,
    ...(element.type === "frame" ? (element.children ?? []).flatMap(subtreeIds) : []),
  ];
}
/**
 * The source row follows the pointer during a drag, so its own zones can overlap the pointer even
 * when a different row is underneath it. Collision detection excludes that row without a pointer
 * listener or per-move React state update.
 */
const layerSensors = (defaults: typeof defaultPreset.sensors) =>
  defaults.map((sensor) =>
    sensor === PointerSensor
      ? PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
          preventActivation: (event) =>
            event.target instanceof Element &&
            Boolean(event.target.closest("[data-layer-disclosure], input, textarea, select, a")),
        })
      : sensor,
  );

const layerCollisionDetection: CollisionDetector = (input) => {
  const source = input.dragOperation.source?.data as LayerDragData | undefined;
  const target = input.droppable.data as LayerDropData | undefined;
  if (source && target && source.artId === target.artId && source.rowId === target.rowId) {
    return null;
  }
  return defaultCollisionDetection(input);
};
export interface CanvasLayersProps {
  ordered: readonly CanvasArtboardDocument[];
  focused: CanvasArtboardDocument | null;
  selection: CanvasSelection;
  onFocusArtboard(artId: string): void;
  onFrameArtboard(artboard: CanvasArtboardDocument): void;
  onSelect(selection: CanvasSelection): void;
  onUpdateElement?(canvasId: string, elementId: string, properties: Record<string, unknown>): void;
  onMoveElement?(
    canvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onMoveElementBetweenCanvases?(
    sourceCanvasId: string,
    targetCanvasId: string,
    elementId: string,
    parentId: string,
    rank: string,
    properties?: Record<string, unknown>,
    unsetProperties?: readonly string[],
  ): void;
  onRenameArtboard?(artId: string, name: string): void;
}

/**
 * Only "inside" belongs on the row itself — a ring that follows the row's rounded corners is
 * exactly right for "into this container". A position *between* two rows is not a property of
 * either of them, so it gets its own element in the gap; see DropIndicator.
 */
function hintClass(zone: LayerDropZone | null): string {
  return zone === "inside" ? "ring-2 ring-inset ring-primary" : "";
}

/** Half the 4px gap SidebarMenu leaves between rows, less half the 2px line. */
const INDICATOR_OFFSET = "-3px";

/**
 * The line marking an insertion point between two rows. It lives in the gap rather than inside a
 * row, so it reads as a position rather than as a border on one item, and it starts at the indent
 * of the row it would become a sibling of, so the depth it lands at is visible before the drop.
 */
function DropIndicator({ zone, depth }: { zone: "before" | "after"; depth: number }) {
  return (
    <span
      aria-hidden="true"
      data-drop-indicator={zone}
      className="pointer-events-none absolute right-1 z-10 h-0.5 bg-primary"
      style={{
        [zone === "before" ? "top" : "bottom"]: INDICATOR_OFFSET,
        left: `${LAYER_ROW_CONTENT_INSET_REM + depth * LAYER_ROW_INDENT_REM}rem`,
      }}
    />
  );
}

function LayerRowView({
  row,
  artboard,
  active,
  expanded,
  renaming,
  onToggle,
  onSelectRow,
  onBeginRename,
  onCommitRename,
}: {
  row: LayerRow;
  artboard: CanvasArtboardDocument;
  active: boolean;
  expanded: boolean;
  renaming: boolean;
  onToggle(): void;
  onSelectRow(shiftKey: boolean): void;
  onBeginRename(): void;
  onCommitRename(name: string): void;
}) {
  const Icon =
    row.kind === "canvas"
      ? artboard.kind === "scene"
        ? TvMinimalIcon
        : PuzzleIcon
      : elementIconFor(row.elementKind);
  const name = row.kind === "canvas" ? artboardLabel(artboard) : row.name;
  const afterZone: LayerDropZone =
    row.kind === "element" && expanded && row.hasChildren ? "inside" : "after";
  const sourceId = `layer-source:${row.artId}:${row.id}`;
  const rowRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLSpanElement>(null);
  const insideRef = useRef<HTMLSpanElement>(null);
  const afterRef = useRef<HTMLSpanElement>(null);
  const { isDragging } = useDraggable<LayerDragData>({
    id: sourceId,
    data: { rowId: row.id, artId: row.artId },
    disabled: row.kind === "canvas",
    // Keep one stable object ref for both the source element and its handle. This avoids
    // React 19 repeatedly detaching and re-registering the row during a drag.
    element: rowRef,
    handle: rowRef,
  });
  const before = useDroppable<LayerDropData>({
    id: `layer-drop:${row.artId}:${row.id}:before`,
    data: { rowId: row.id, artId: row.artId, zone: "before" },
    collisionDetector: layerCollisionDetection,
    element: beforeRef,
    disabled: row.kind === "canvas",
  });
  const inside = useDroppable<LayerDropData>({
    id: `layer-drop:${row.artId}:${row.id}:inside`,
    data: { rowId: row.id, artId: row.artId, zone: "inside" },
    collisionDetector: layerCollisionDetection,
    element: insideRef,
    disabled: row.kind === "element" && row.elementKind !== "frame",
  });
  const after = useDroppable<LayerDropData>({
    id: `layer-drop:${row.artId}:${row.id}:after`,
    data: { rowId: row.id, artId: row.artId, zone: afterZone },
    collisionDetector: layerCollisionDetection,
    element: afterRef,
    disabled: row.kind === "canvas",
  });
  const hint: LayerDropZone | null = before.isDropTarget
    ? "before"
    : inside.isDropTarget
      ? "inside"
      : after.isDropTarget
        ? afterZone
        : null;
  const rowIndentRem = row.depth * LAYER_ROW_INDENT_REM;

  return (
    <li className="relative">
      {hint === "before" || hint === "after" ? (
        <DropIndicator zone={hint} depth={row.depth} />
      ) : null}
      <div
        ref={rowRef}
        data-layer-row={row.id}
        data-layer-art={row.artId}
        data-layer-kind={row.kind}
        data-layer-element-kind={row.elementKind}
        className={`relative flex h-8 min-w-0 items-center gap-1 rounded-sm pr-2 text-sm ${
          active ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        } ${hintClass(hint)} ${isDragging ? "opacity-50" : ""}`}
        style={{
          marginInlineStart: `${rowIndentRem}rem`,
          width: `calc(100% - ${rowIndentRem}rem)`,
          paddingInlineStart: `${LAYER_ROW_CONTENT_INSET_REM}rem`,
        }}
      >
        <span
          ref={before.ref}
          aria-hidden="true"
          data-layer-drop-zone="before"
          className={`pointer-events-none absolute inset-x-0 ${
            row.kind === "element" && row.elementKind === "frame" ? "top-0 h-1/4" : "top-0 h-1/2"
          }`}
        />
        <span
          ref={inside.ref}
          aria-hidden="true"
          data-layer-drop-zone="inside"
          className={`pointer-events-none absolute inset-x-0 ${
            row.kind === "canvas" ? "inset-y-0" : "top-1/4 bottom-1/4"
          }`}
        />
        <span
          ref={after.ref}
          aria-hidden="true"
          data-layer-drop-zone="after"
          className={`pointer-events-none absolute inset-x-0 -bottom-1 ${
            row.kind === "element" && row.elementKind === "frame" ? "h-1/4" : "h-1/2"
          }`}
        />
        {row.hasChildren ? (
          <button
            type="button"
            data-layer-disclosure="true"
            aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
            aria-expanded={expanded}
            className="relative z-10 grid size-4 shrink-0 place-items-center rounded-sm hover:bg-background/60"
            onPointerDownCapture={(event) => event.stopPropagation()}
            onClick={onToggle}
          >
            <ChevronRight
              aria-hidden="true"
              className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="relative z-10 size-4 shrink-0" />
        )}
        <Icon
          aria-hidden="true"
          className="relative z-10 size-3.5 shrink-0 text-muted-foreground"
        />
        {renaming ? (
          <input
            autoFocus
            defaultValue={row.kind === "canvas" ? artboard.name : (row.rawName ?? "")}
            aria-label={`Rename ${name}`}
            className="relative z-10 h-6 min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value =
                  row.kind === "canvas" ? artboard.name : (row.rawName ?? "");
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => onCommitRename(event.currentTarget.value)}
          />
        ) : (
          <button
            type="button"
            className="relative z-10 min-w-0 flex-1 truncate text-left"
            aria-label={`${name} ${row.kind === "canvas" ? "canvas" : "layer"}`}
            onClick={(event) => onSelectRow(event.shiftKey)}
            onDoubleClick={onBeginRename}
          >
            {name}
          </button>
        )}
      </div>
    </li>
  );
}

function LayerDragPreview({ row, artboard }: { row: LayerRow; artboard: CanvasArtboardDocument }) {
  const Icon =
    row.kind === "canvas"
      ? artboard.kind === "scene"
        ? TvMinimalIcon
        : PuzzleIcon
      : elementIconFor(row.elementKind);
  const name = row.kind === "canvas" ? artboardLabel(artboard) : row.name;
  return (
    <div className="flex h-8 min-w-48 max-w-72 items-center gap-1 rounded-sm bg-accent px-2 text-sm text-accent-foreground shadow-lg ring-1 ring-primary/40">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </div>
  );
}
export function CanvasLayers({
  ordered,
  focused,
  selection,
  onFocusArtboard,
  onFrameArtboard,
  onSelect,
  onUpdateElement,
  onMoveElement,
  onMoveElementBetweenCanvases,
  onRenameArtboard,
}: CanvasLayersProps) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const dragStateRef = useRef<LayerDragState | null>(null);
  const collapsedRowsRef = useRef<HTMLElement[]>([]);
  const selectionAnchorRef = useRef<{ artId: string; rowId: string } | null>(null);

  /**
   * Expansion is derived rather than stored and then patched: `toggled` records only what you
   * opened or closed by hand, and the rest falls out of focus and selection. The path down to the
   * current selection is held open, so selecting an Element out on the canvas can never leave it
   * hidden in here — and collapsing a node that holds the selection drops the selection instead of
   * refusing, because reaching for a disclosure is a clear enough instruction to close it.
   */
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const focusedArtId = focused?.artId ?? null;
  const selectedKey = selection.elementIds.join(" ");
  const forced = useMemo(() => {
    const artboard = ordered.find((candidate) => candidate.artId === selection.artId);
    if (!artboard || selectedKey === "") return new Set<string>();
    return new Set(expansionForSelection(artboard, selectedKey.split(" ")));
  }, [ordered, selection.artId, selectedKey]);
  const expanded = useMemo(() => {
    const open = new Set(forced);
    // The Canvas you are working in starts open, but you may still close it.
    if (focusedArtId) open.add(focusedArtId);
    for (const [id, isOpen] of toggled) {
      if (isOpen) open.add(id);
      else if (!forced.has(id)) open.delete(id);
    }
    return open;
  }, [forced, toggled, focusedArtId]);

  const toggle = (id: string) => {
    const closing = expanded.has(id);
    // `forced` is exactly the nodes standing between the Canvas and the selection, so this is
    // "you are closing something the selection is inside". Let the selection go with it.
    if (closing && forced.has(id)) onSelect({ artId: selection.artId, elementIds: [] });
    setToggled((current) => new Map(current).set(id, !closing));
  };
  const restoreDraggedRows = () => {
    for (const node of collapsedRowsRef.current) {
      node.style.removeProperty("visibility");
      node.style.removeProperty("pointer-events");
      node.removeAttribute("aria-hidden");
    }
    collapsedRowsRef.current = [];
  };

  const collapseDraggedRows = (source: LayerDragData, ids: readonly string[]) => {
    restoreDraggedRows();
    for (const id of ids) {
      const node = document.querySelector<HTMLElement>(
        `[data-layer-row="${CSS.escape(id)}"][data-layer-art="${CSS.escape(source.artId)}"]`,
      );
      if (!node) continue;
      node.style.visibility = "hidden";
      node.style.pointerEvents = "none";
      node.setAttribute("aria-hidden", "true");
      collapsedRowsRef.current.push(node);
    }
  };
  const startDrag = (event: DragStartEvent) => {
    const source = event.operation.source?.data as LayerDragData | undefined;
    if (!source) return;
    const sourceArtboard = ordered.find((candidate) => candidate.artId === source.artId);
    const sourceElement =
      sourceArtboard && source.rowId !== source.artId
        ? findCanvasElement(sourceArtboard.canvas.root, source.rowId)
        : null;
    const ids = sourceElement ? subtreeIds(sourceElement) : [];
    const snapshot = {
      source,
      expandedIds: ids.filter((id) => expanded.has(id)),
    };
    dragStateRef.current = snapshot;
    collapseDraggedRows(
      source,
      ids.filter((id) => id !== source.rowId),
    );
  };

  const finishDrag = (event: DragEndEvent) => {
    const snapshot = dragStateRef.current;
    try {
      if (event.canceled) return;
      const source = event.operation.source?.data as LayerDragData | undefined;
      const target = event.operation.target?.data as LayerDropData | undefined;
      if (!source || !target) return;
      const sourceArtboard = ordered.find((candidate) => candidate.artId === source.artId);
      const targetArtboard = ordered.find((candidate) => candidate.artId === target.artId);
      if (!sourceArtboard || !targetArtboard) return;
      const targetId = target.rowId === target.artId ? targetArtboard.canvas.root.id : target.rowId;
      const placement =
        source.artId === target.artId
          ? layerDropPlacement(targetArtboard.canvas.root, source.rowId, targetId, target.zone)
          : layerDropPlacementInCanvas(targetArtboard.canvas.root, targetId, target.zone);
      if (!placement) return;
      if (source.artId === target.artId) {
        onMoveElement?.(targetArtboard.canvasId, source.rowId, placement.parentId, placement.rank);
        return;
      }
      const sourceNode = document.querySelector<HTMLElement>(
        `[data-artboard-id="${CSS.escape(source.artId)}"] [data-element-id="${CSS.escape(source.rowId)}"]`,
      );
      const sourceParentNode = sourceNode?.dataset.elementParentId
        ? document.querySelector<HTMLElement>(
            `[data-artboard-id="${CSS.escape(source.artId)}"] [data-element-id="${CSS.escape(sourceNode.dataset.elementParentId)}"]`,
          )
        : null;
      const targetParentNode = document.querySelector<HTMLElement>(
        `[data-artboard-id="${CSS.escape(target.artId)}"] [data-element-id="${CSS.escape(placement.parentId)}"]`,
      );
      const sourceElement = findCanvasElement(sourceArtboard.canvas.root, source.rowId);
      const sourceAuto = sourceParentNode
        ? getComputedStyle(sourceParentNode).display === "flex"
        : false;
      const targetAuto = targetParentNode
        ? getComputedStyle(targetParentNode).display === "flex"
        : false;
      const sourceSize = sourceNode ? getComputedStyle(sourceNode) : null;
      const sourceWidth = sourceNode
        ? Number.parseFloat(sourceSize?.width ?? "") || sourceNode.getBoundingClientRect().width
        : 0;
      const sourceHeight = sourceNode
        ? Number.parseFloat(sourceSize?.height ?? "") || sourceNode.getBoundingClientRect().height
        : 0;
      const properties =
        sourceElement && sourceNode && sourceAuto && !targetAuto
          ? fixedFillSizing(sourceElement, sourceWidth, sourceHeight)
          : {};
      onMoveElementBetweenCanvases?.(
        sourceArtboard.canvasId,
        targetArtboard.canvasId,
        source.rowId,
        placement.parentId,
        placement.rank,
        properties,
      );
    } catch (error) {
      // A stale target must not leave the dnd manager or its overlay in an active state.
      console.error("Canvas layer drag failed", error);
    } finally {
      restoreDraggedRows();
      if (snapshot && snapshot.expandedIds.length > 0) {
        setToggled((current) => {
          const next = new Map(current);
          for (const id of snapshot.expandedIds) next.set(id, true);
          return next;
        });
      }
      dragStateRef.current = null;
    }
  };

  // A Set, because the row loop below asks about every row and a selection can be large.
  const selectedElementIds = new Set(selection.elementIds);
  const groups = (["scene", "block"] as const).map((kind) => ({
    kind,
    artboards: ordered.filter((artboard) => artboard.kind === kind),
  }));

  return (
    <SidebarContent className="p-0">
      <InputGroup className="h-10 bg-transparent dark:bg-transparent rounded-b-none border-0 border-b border-sidebar-border has-[[data-slot=input-group-control]:focus-visible]:border-sidebar-border has-[[data-slot=input-group-control]:focus-visible]:ring-0">
        <InputGroupAddon align="inline-start">
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search layers"
          aria-label="Search layers"
        />
      </InputGroup>
      <DragDropProvider sensors={layerSensors} onDragStart={startDrag} onDragEnd={finishDrag}>
        {groups.map(({ kind, artboards }) => {
          const rows = artboards.flatMap((artboard) =>
            canvasLayerRows(artboard, { expanded, query }).map((row) => ({ row, artboard })),
          );
          // A Canvas with no match keeps only its own row, which is noise while searching.
          const visible = query.trim()
            ? rows.filter(
                ({ row, artboard }) =>
                  row.kind === "element" ||
                  rows.some((other) => other.artboard === artboard && other.row.kind === "element"),
              )
            : rows;
          return (
            <SidebarGroup key={kind}>
              <SidebarGroupLabel>{kind === "scene" ? "Scenes" : "Blocks"}</SidebarGroupLabel>
              <SidebarGroupContent>
                {visible.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">
                    No {kind === "scene" ? "Scenes" : "Blocks"} match.
                  </p>
                ) : (
                  <SidebarMenu>
                    {visible.map(({ row, artboard }) => {
                      const active =
                        row.kind === "canvas"
                          ? selection.artId === row.artId && selection.elementIds.length === 0
                          : selection.artId === row.artId && selectedElementIds.has(row.id);
                      return (
                        <LayerRowView
                          key={`${row.artId}:${row.id}`}
                          row={row}
                          artboard={artboard}
                          active={active}
                          expanded={expanded.has(row.id)}
                          renaming={renamingId === `${row.artId}:${row.id}`}
                          onToggle={() => toggle(row.id)}
                          onSelectRow={(shiftKey) => {
                            if (
                              shouldFrameForeignLayer(focusedArtId, row.artId, row.kind, shiftKey)
                            ) {
                              onFrameArtboard(artboard);
                            }
                            onFocusArtboard(row.artId);
                            const anchor = selectionAnchorRef.current;
                            const layerIds = visible.flatMap(
                              ({ row: candidate, artboard: candidateArtboard }) =>
                                candidateArtboard.artId === row.artId &&
                                candidate.kind === "element"
                                  ? [candidate.id]
                                  : [],
                            );
                            const canExtend =
                              shiftKey &&
                              row.kind === "element" &&
                              anchor !== null &&
                              anchor.artId === row.artId;
                            const elementIds =
                              canExtend && anchor
                                ? rangeSelection(layerIds, anchor.rowId, row.id)
                                : row.kind === "canvas"
                                  ? []
                                  : [row.id];
                            if (!canExtend) {
                              selectionAnchorRef.current = { artId: row.artId, rowId: row.id };
                            }
                            onSelect({ artId: row.artId, elementIds });
                          }}
                          onBeginRename={() => setRenamingId(`${row.artId}:${row.id}`)}
                          onCommitRename={(name) => {
                            const trimmed = name.trim();
                            if (row.kind === "canvas") {
                              if (trimmed && trimmed !== artboard.name) {
                                onRenameArtboard?.(row.artId, trimmed);
                              }
                            } else if (trimmed !== row.name) {
                              onUpdateElement?.(artboard.canvasId, row.id, { name: trimmed });
                            }
                            setRenamingId(null);
                          }}
                        />
                      );
                    })}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        <DragOverlay className="pointer-events-none" dropAnimation={null}>
          {(source) => {
            const data = source.data as LayerDragData | undefined;
            if (!data) return null;
            const artboard = ordered.find((candidate) => candidate.artId === data.artId);
            if (!artboard) return null;
            const row = canvasLayerRows(artboard, { expanded }).find(
              (candidate) => candidate.id === data.rowId,
            );
            return row ? <LayerDragPreview row={row} artboard={artboard} /> : null;
          }}
        </DragOverlay>
      </DragDropProvider>
    </SidebarContent>
  );
}
