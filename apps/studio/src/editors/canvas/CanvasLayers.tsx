import {
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
  Square,
  TvMinimal,
  Type,
} from "lucide-react";
import type { ElementKind } from "@mechane/domain";
import { useMemo, useRef, useState } from "react";

import type { CanvasArtboardDocument } from "../../api/canvas";
import { layerDropPlacement, layerRowDropZone } from "./canvas-layer-drop";
import type { LayerDropZone } from "./canvas-layer-drop";
import { canvasLayerRows, expansionForSelection } from "./canvas-layer-tree";
import type { LayerRow } from "./canvas-layer-tree";
import type { CanvasSelection } from "./canvas-selection";

const ELEMENT_ICONS: Record<ElementKind, typeof Square> = {
  frame: FrameIcon,
  rect: Square,
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
  onMoveElement?(canvasId: string, elementId: string, parentId: string, rank: string): void;
  onRenameArtboard?(artId: string, name: string): void;
}

type DropHint = { rowId: string; artId: string; zone: LayerDropZone };

function artboardLabel(artboard: CanvasArtboardDocument): string {
  return (
    artboard.name.trim() || `${artboard.kind === "scene" ? "Scene" : "Block"} ${artboard.artId}`
  );
}

function hintClass(zone: LayerDropZone | null): string {
  if (zone === "inside") return "ring-2 ring-inset ring-primary";
  if (zone === "before") return "shadow-[inset_0_2px_0_0_var(--primary)]";
  if (zone === "after") return "shadow-[inset_0_-2px_0_0_var(--primary)]";
  return "";
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
          aria-current={active ? "true" : undefined}
          onClick={onSelectRow}
          onDoubleClick={onBeginRename}
        >
          {name}
        </button>
      )}
    </div>
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
   * current selection always wins, so selecting an Element out on the canvas can never leave it
   * hidden in here — which also means you cannot collapse a Canvas while something inside it is
   * selected. Select the Canvas row first, which clears the Element selection.
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

  const toggle = (id: string) =>
    setToggled((current) => new Map(current).set(id, !expanded.has(id)));

  // The zone within a row decides between reordering and reparenting, and that rule lives in
  // canvas-layer-drop. Native drag-and-drop reports it directly on the row being hovered.
  const hoverRow = (row: LayerRow, offsetY: number, height: number): boolean => {
    if (!dragging) return false;
    const artboard = ordered.find((candidate) => candidate.artId === row.artId);
    // An Element cannot leave its Canvas (#223), so a foreign row is simply not a target.
    if (!artboard || row.artId !== dragging.artId) {
      hintRef.current = null;
      setHint(null);
      return false;
    }
    const zone = layerRowDropZone(
      { ...row, expanded: expanded.has(row.id) },
      offsetY,
      height || ROW_HEIGHT,
    );
    const targetId = row.kind === "canvas" ? artboard.canvas.root.id : row.id;
    if (!layerDropPlacement(artboard.canvas.root, dragging.rowId, targetId, zone)) {
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
    const artboard = ordered.find((candidate) => candidate.artId === target.artId);
    if (!artboard) return;
    const targetId =
      target.rowId === target.artId ? artboard.canvas.root.id : target.rowId;
    const placement = layerDropPlacement(artboard.canvas.root, source.rowId, targetId, target.zone);
    if (!placement) return;
    onMoveElement?.(artboard.canvasId, source.rowId, placement.parentId, placement.rank);
  };

  // A Set, because the row loop below asks about every row and a selection can be large.
  const selectedElementIds = new Set(selection.elementIds);
  const groups = (["scene", "block"] as const).map((kind) => ({
    kind,
    artboards: ordered.filter((artboard) => artboard.kind === kind),
  }));

  return (
    <SidebarContent>
      <div className="p-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search layers"
          aria-label="Search layers"
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
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
