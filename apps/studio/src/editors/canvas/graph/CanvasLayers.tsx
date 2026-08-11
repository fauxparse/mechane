import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@mechane/design-system";
import {
  ChevronRight,
  Frame as FrameIcon,
  Image as ImageIcon,
  Puzzle,
  SearchIcon,
  Shapes,
  Square,
  TvMinimal,
  Type,
} from "lucide-react";
import type { ElementKind } from "@mechane/domain";
import { findCanvasElement } from "@mechane/commands";
import { useMemo, useRef, useState } from "react";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import { fixedFillSizing } from "../commands/canvas-creation";
import {
  layerDropPlacement,
  layerDropPlacementInCanvas,
  layerRowDropZone,
} from "../data/canvas-layer-drop";
import type { LayerDropZone } from "../data/canvas-layer-drop";
import { canvasLayerRows, expansionForSelection } from "../data/canvas-layer-tree";
import type { LayerRow } from "../data/canvas-layer-tree";
import { artboardLabel } from "../data/canvas-workspace";
import type { CanvasSelection } from "./canvas-selection";

const ELEMENT_ICONS: Record<ElementKind, typeof Square> = {
  frame: FrameIcon,
  rect: Square,
  ellipse: Shapes,
  text: Type,
  image: ImageIcon,
};

/** Rows are 32px tall; the zone thresholds in canvas-layer-drop are expressed as fractions. */
const ROW_HEIGHT = 32;

export interface CanvasLayersProps {
  ordered: readonly CanvasArtboardDocument[];
  focused: CanvasArtboardDocument | null;
  selection: CanvasSelection;
  onFocusArtboard(artId: string): void;
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

type DropHint = { rowId: string; artId: string; zone: LayerDropZone };

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
        left: `${0.25 + depth * 0.75}rem`,
        [zone === "before" ? "top" : "bottom"]: INDICATOR_OFFSET,
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
  hint,
  dragging,
  onToggle,
  onSelectRow,
  onBeginRename,
  onCommitRename,
  onDragStartRow,
  onDragEndRow,
  onDragOverRow,
  onDropRow,
}: {
  row: LayerRow;
  artboard: CanvasArtboardDocument;
  active: boolean;
  expanded: boolean;
  renaming: boolean;
  hint: LayerDropZone | null;
  dragging: boolean;
  onToggle(): void;
  onSelectRow(): void;
  onBeginRename(): void;
  onCommitRename(name: string): void;
  onDragStartRow(): void;
  onDragEndRow(): void;
  /** Returns whether this row can take the drop, which is what decides preventDefault. */
  onDragOverRow(offsetY: number, height: number): boolean;
  onDropRow(): void;
}) {
  const Icon =
    row.kind === "canvas"
      ? artboard.kind === "scene"
        ? TvMinimal
        : Puzzle
      : ELEMENT_ICONS[row.elementKind ?? "rect"];
  const name = row.kind === "canvas" ? artboardLabel(artboard) : row.name;

  return (
    <li className="relative">
      {hint === "before" || hint === "after" ? (
        <DropIndicator zone={hint} depth={row.depth} />
      ) : null}
      <div
        // Canvases are never drag sources, which is what keeps a Canvas out of another Canvas.
        draggable={row.kind === "element" && !renaming}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", row.id);
          onDragStartRow();
        }}
        onDragEnd={onDragEndRow}
        onDragOver={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (!onDragOverRow(event.clientY - rect.top, rect.height)) return;
          // Only a row that can take the drop calls preventDefault, so the cursor reports the rest.
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropRow();
        }}
        data-layer-row={row.id}
        data-layer-art={row.artId}
        data-layer-kind={row.kind}
        data-layer-element-kind={row.elementKind}
        className={`flex h-8 w-full min-w-0 items-center gap-1 rounded-md pr-2 text-sm transition-colors hover:bg-muted ${
          active ? "bg-accent text-accent-foreground" : ""
        } ${hintClass(hint)} ${dragging ? "opacity-50" : ""}`}
        style={{ paddingInlineStart: `${0.25 + row.depth * 0.75}rem` }}
      >
        {row.hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
            aria-expanded={expanded}
            className="grid size-4 shrink-0 place-items-center rounded-sm hover:bg-background/60"
            onClick={onToggle}
          >
            <ChevronRight
              aria-hidden="true"
              className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="size-4 shrink-0" />
        )}
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        {renaming ? (
          <input
            autoFocus
            defaultValue={row.kind === "canvas" ? artboard.name : (row.name ?? "")}
            aria-label={`Rename ${name}`}
            className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = row.kind === "canvas" ? artboard.name : row.name;
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => onCommitRename(event.currentTarget.value)}
          />
        ) : (
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            aria-label={`${name} ${row.kind === "canvas" ? "canvas" : "layer"}`}
            onClick={onSelectRow}
            onDoubleClick={onBeginRename}
          >
            {name}
          </button>
        )}
      </div>
    </li>
  );
}

export function CanvasLayers({
  ordered,
  focused,
  selection,
  onFocusArtboard,
  onSelect,
  onUpdateElement,
  onMoveElement,
  onMoveElementBetweenCanvases,
  onRenameArtboard,
}: CanvasLayersProps) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ rowId: string; artId: string } | null>(null);
  const [hint, setHint] = useState<DropHint | null>(null);
  const hintRef = useRef<DropHint | null>(null);

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

  // The zone within a row decides between reordering and reparenting, and that rule lives in
  // canvas-layer-drop. Native drag-and-drop reports it directly on the row being hovered.
  const hoverRow = (row: LayerRow, offsetY: number, height: number): boolean => {
    if (!dragging) return false;
    const artboard = ordered.find((candidate) => candidate.artId === row.artId);
    if (!artboard) {
      hintRef.current = null;
      setHint(null);
      return false;
    }
    const foreign = row.artId !== dragging.artId;
    const zone = layerRowDropZone(
      { ...row, expanded: expanded.has(row.id) },
      offsetY,
      height || ROW_HEIGHT,
    );
    const targetId = row.kind === "canvas" ? artboard.canvas.root.id : row.id;
    const placement = foreign
      ? layerDropPlacementInCanvas(artboard.canvas.root, targetId, zone)
      : layerDropPlacement(artboard.canvas.root, dragging.rowId, targetId, zone);
    if (!placement) {
      hintRef.current = null;
      setHint(null);
      return false;
    }
    const next = { rowId: row.id, artId: row.artId, zone };
    const previous = hintRef.current;
    hintRef.current = next;
    if (
      previous?.rowId !== next.rowId ||
      previous?.artId !== next.artId ||
      previous?.zone !== next.zone
    ) {
      setHint(next);
    }
    return true;
  };
  const finishDrag = () => {
    const source = dragging;
    const target = hintRef.current;
    hintRef.current = null;
    setHint(null);
    setDragging(null);
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
                        hint={
                          hint && hint.rowId === row.id && hint.artId === row.artId
                            ? hint.zone
                            : null
                        }
                        dragging={dragging?.rowId === row.id && dragging.artId === row.artId}
                        onToggle={() => toggle(row.id)}
                        onSelectRow={() => {
                          onFocusArtboard(row.artId);
                          onSelect({
                            artId: row.artId,
                            elementIds: row.kind === "canvas" ? [] : [row.id],
                          });
                        }}
                        onDragStartRow={() => setDragging({ rowId: row.id, artId: row.artId })}
                        onDragEndRow={() => {
                          hintRef.current = null;
                          setHint(null);
                          setDragging(null);
                        }}
                        onDragOverRow={(offsetY, height) => hoverRow(row, offsetY, height)}
                        onDropRow={finishDrag}
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
    </SidebarContent>
  );
}
