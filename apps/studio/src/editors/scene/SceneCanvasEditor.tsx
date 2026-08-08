import { Button, Input, Label, cn } from "@mechane/design-system";
import type { Canvas, Element, FrameElement } from "@mechane/domain";
import { CanvasRenderer } from "@mechane/rendering";
import type { CanvasEdit } from "@mechane/commands";
import { addElement, composite, deleteElements, updateElementProperties } from "@mechane/commands";
import { ArrowLeft, Frame, Image, Minus, Redo2, Square, Type, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useCanvasCommands } from "./use-canvas-commands";
import "./scene-canvas-editor.css";

export interface SceneCanvasEditorProps {
  canvas: Canvas;
  onEdit?(edits: readonly CanvasEdit[]): void;
  onBack(): void;
  className?: string;
}

type Layer = { element: Element; depth: number };

type DrawState = {
  type: Element["type"];
  start: { x: number; y: number };
  current: { x: number; y: number };
};

const DRAW_MIN_SIZE = 8;

function walkLayers(element: Element, depth = 0): Layer[] {
  const children = element.children?.flatMap((child) => walkLayers(child, depth + 1)) ?? [];
  return [{ element, depth }, ...children].filter(Boolean);
}

function locate(
  root: Element,
  id: string,
  parent: FrameElement | null = null,
): { element: Element; parent: FrameElement | null } | null {
  if (root.id === id) return { element: root, parent };
  for (const child of root.children ?? []) {
    const found = locate(child, id, root.type === "frame" ? root : null);
    if (found) return found;
  }
  return null;
}

function contains(root: Element, id: string): boolean {
  return root.id === id || (root.children ?? []).some((child) => contains(child, id));
}

function displayName(element: Element): string {
  return element.name?.trim() || element.type[0]!.toUpperCase() + element.type.slice(1);
}

function makeElement(type: Element["type"]): Extract<Element, { type: typeof type }> {
  const id = `element:${crypto.randomUUID()}`;
  const shared = {
    id,
    type,
    width: { mode: "fixed" as const, value: 160 },
    height: { mode: "fixed" as const, value: 96 },
    fill: type === "text" ? "transparent" : "#334155",
  };
  if (type === "text")
    return { ...shared, content: "Text" } as Extract<Element, { type: typeof type }>;
  if (type === "frame")
    return { ...shared, layoutMode: "absolute" } as Extract<Element, { type: typeof type }>;
  if (type === "image") return { ...shared, src: "" } as Extract<Element, { type: typeof type }>;
  return { ...shared, cornerRadius: 8 } as Extract<Element, { type: typeof type }>;
}

function nextRank(parent: FrameElement): string {
  const ranks = (parent.children ?? []).map((child) => child.rank ?? "").sort();
  const last = ranks.at(-1);
  return last ? `${last}m` : "m";
}

export function SceneCanvasEditor({
  canvas: source,
  onEdit,
  onBack,
  className,
}: SceneCanvasEditorProps) {
  return (
    <LoadedCanvasEditor source={source} onEdit={onEdit} onBack={onBack} className={className} />
  );
}

// This editor intentionally keeps its command stack, keyboard handling, and
// canvas/layer controls together as one interaction surface.
// react-doctor-disable-next-line react-doctor/no-giant-component
function LoadedCanvasEditor({
  source,
  onEdit,
  onBack,
  className,
}: {
  source: Canvas;
  onEdit?: (edits: readonly CanvasEdit[]) => void;
  onBack(): void;
  className?: string;
}) {
  const editing = useCanvasCommands(source, (edits) => onEdit?.(edits));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => locate(editing.canvas.root, id)?.element)
        .filter((element): element is Element => !!element),
    [editing.canvas.root, selectedIds],
  );
  const layers = useMemo(() => walkLayers(editing.canvas.root).reverse(), [editing.canvas.root]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [drawType, setDrawType] = useState<Element["type"] | null>(null);
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const suppressSurfaceClick = useRef(false);
  const surfacePoint = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const root = Array.from(
        surface.current?.querySelectorAll<HTMLElement>("[data-element-id]") ?? [],
      ).find((element) => element.dataset.elementId === editing.canvas.root.id);
      const bounds = root?.getBoundingClientRect();
      if (!bounds) return null;
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        return null;
      }
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    },
    [editing.canvas.root.id],
  );

  const beginDraw = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!drawType || event.button !== 0) return;
      const point = surfacePoint(event);
      if (!point) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can be unavailable for synthetic or embedded surfaces.
      }
      event.preventDefault();
      setDrawState({ type: drawType, start: point, current: point });
    },
    [drawType, surfacePoint],
  );
  const updateDraw = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!drawState) return;
      const point = surfacePoint(event);
      if (point) setDrawState((current) => (current ? { ...current, current: point } : null));
    },
    [drawState, surfacePoint],
  );

  const finishDraw = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!drawState) return;
      const point = surfacePoint(event) ?? drawState.current;
      const left = Math.min(drawState.start.x, point.x);
      const top = Math.min(drawState.start.y, point.y);
      const width = Math.max(DRAW_MIN_SIZE, Math.abs(point.x - drawState.start.x));
      const height = Math.max(DRAW_MIN_SIZE, Math.abs(point.y - drawState.start.y));
      const element = makeElement(drawState.type);
      const drawn = {
        ...element,
        width: { mode: "fixed" as const, value: width },
        height: { mode: "fixed" as const, value: height },
        anchor: {
          horizontal: "left" as const,
          vertical: "top" as const,
          offsetX: left,
          offsetY: top,
        },
      };
      editing.execute(
        addElement(
          drawn as Extract<CanvasEdit, { type: "canvas.addElement" }>["element"],
          editing.canvas.root.id,
          nextRank(editing.canvas.root),
          `Draw ${drawState.type}`,
        ),
      );
      setSelectedIds([element.id]);
      setDrawState(null);
      suppressSurfaceClick.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [drawState, editing, surfacePoint],
  );

  useEffect(() => {
    const root = surface.current;
    if (!root) return;
    for (const element of root.querySelectorAll<HTMLElement>("[data-element-id]")) {
      element.dataset.selected = selectedIdSet.has(element.dataset.elementId ?? "")
        ? "true"
        : "false";
    }
  }, [editing.canvas.root, selectedIdSet]);

  const select = useCallback((id: string, additive: boolean) => {
    setSelectedIds((current) =>
      additive
        ? current.includes(id)
          ? current.filter((selectedId) => selectedId !== id)
          : [...current, id]
        : [id],
    );
  }, []);

  const deleteSelection = useCallback(() => {
    const topLevel: string[] = [];
    for (const element of selected) {
      if (element.id === editing.canvas.root.id) continue;
      const hasSelectedAncestor = selected.some(
        (other) => other.id !== element.id && contains(other, element.id),
      );
      if (!hasSelectedAncestor) topLevel.push(element.id);
    }
    if (topLevel.length === 0) return;
    editing.execute(deleteElements(topLevel));
    setSelectedIds([]);
  }, [editing, selected]);

  const rename = useCallback(() => {
    if (selectedIds.length !== 1) return;
    const element = selected[0];
    if (!element) return;
    setRenaming(element.id);
    setRenameValue(element.name ?? "");
  }, [selected, selectedIds]);

  const commitRename = useCallback(() => {
    if (!renaming) return;
    editing.execute(
      updateElementProperties(renaming, { name: renameValue.trim() || null }, "Rename element"),
    );
    setRenaming(null);
  }, [editing, renameValue, renaming]);

  const updateOpacity = useCallback(
    (value: number) => {
      if (selected.length === 0) return;
      editing.execute(
        composite({
          label: "Set opacity",
          scope: "selection",
          commands: selected.map((element) =>
            updateElementProperties(element.id, { opacity: value }, "Set opacity"),
          ),
        }),
      );
    },
    [editing, selected],
  );

  const add = useCallback(
    (type: Element["type"]) => {
      const selectedElement = selected[0];
      const parent =
        selectedElement?.type === "frame"
          ? selectedElement
          : selectedElement
            ? locate(editing.canvas.root, selectedElement.id)?.parent
            : editing.canvas.root;
      if (!parent) return;
      const element = makeElement(type);
      editing.execute(
        addElement(
          element as unknown as Extract<CanvasEdit, { type: "canvas.addElement" }>["element"],
          parent.id,
          nextRank(parent),
          `Add ${type}`,
        ),
      );
      setSelectedIds([element.id]);
    },
    [editing, selected],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const element = selected[0];
      if (!element) return;
      const found = locate(editing.canvas.root, element.id);
      if (
        !found?.parent ||
        found.parent.layoutMode === "auto" ||
        found.parent.mode === "auto" ||
        found.parent.autoLayout
      )
        return;
      const anchor = element.anchor ?? {};
      editing.execute(
        updateElementProperties(
          element.id,
          {
            anchor: {
              ...anchor,
              offsetX: (anchor.offsetX ?? 0) + dx,
              offsetY: (anchor.offsetY ?? 0) + dy,
            },
          },
          "Nudge element",
        ),
      );
    },
    [editing, selected],
  );

  return (
    <div
      role="application"
      aria-label="Scene canvas editor"
      className={cn("scene-canvas-editor flex h-full min-h-0 flex-col bg-background", className)}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === "Escape") {
          setSelectedIds((current) => current.slice(0, -1));
          setRenaming(null);
        } else if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          deleteSelection();
        } else if (event.key === "F2") {
          event.preventDefault();
          rename();
        } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          setSelectedIds(layers.map(({ element }) => element.id));
        } else if (event.key === "ArrowLeft") nudge(-1, 0);
        else if (event.key === "ArrowRight") nudge(1, 0);
        else if (event.key === "ArrowUp") nudge(0, -1);
        else if (event.key === "ArrowDown") nudge(0, 1);
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Graph
        </Button>
        <span className="text-sm font-medium">Scene Canvas</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Undo"
            disabled={!editing.canUndo}
            onClick={editing.undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Redo"
            disabled={!editing.canRedo}
            onClick={editing.redo}
          >
            <Redo2 />
          </Button>
          <Button
            variant={drawType === "rect" ? "default" : "outline"}
            size="sm"
            aria-pressed={drawType === "rect"}
            onClick={() => {
              setDrawType("rect");
              add("rect");
            }}
          >
            <Square /> Rect
          </Button>
          <Button
            variant={drawType === "text" ? "default" : "outline"}
            size="sm"
            aria-pressed={drawType === "text"}
            onClick={() => {
              setDrawType("text");
              add("text");
            }}
          >
            <Type /> Text
          </Button>
          <Button
            variant={drawType === "frame" ? "default" : "outline"}
            size="sm"
            aria-pressed={drawType === "frame"}
            onClick={() => {
              setDrawType("frame");
              add("frame");
            }}
          >
            <Frame /> Frame
          </Button>
          <Button
            variant={drawType === "image" ? "default" : "outline"}
            size="sm"
            aria-pressed={drawType === "image"}
            onClick={() => {
              setDrawType("image");
              add("image");
            }}
          >
            <Image /> Image
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <aside
          className="w-60 shrink-0 overflow-auto border-r border-border p-2"
          aria-label="Canvas layers"
        >
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Layers
          </p>
          <div role="tree">
            {layers.map(({ element, depth }) => (
              <div
                key={element.id}
                role="treeitem"
                aria-selected={selectedIdSet.has(element.id)}
                tabIndex={0}
                className={cn(
                  "flex items-center gap-2 rounded px-2 py-1 text-sm",
                  selectedIdSet.has(element.id) && "bg-accent text-accent-foreground",
                )}
                style={{ paddingLeft: `${8 + depth * 14}px` }}
                onClick={() => select(element.id, false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    select(element.id, event.shiftKey);
                  }
                }}
                onDoubleClick={() => {
                  if (element.type === "frame") select(element.id, false);
                }}
              >
                {renaming === element.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename();
                      if (event.key === "Escape") setRenaming(null);
                    }}
                    aria-label={`Rename ${displayName(element)}`}
                  />
                ) : (
                  <span className="truncate">{displayName(element)}</span>
                )}
              </div>
            ))}
          </div>
        </aside>
        <div
          ref={surface}
          role="application"
          tabIndex={0}
          className="relative min-w-0 flex-1 overflow-auto bg-muted/30 p-8"
          aria-label="Scene canvas"
          onPointerDown={beginDraw}
          onPointerMove={updateDraw}
          onPointerUp={finishDraw}
          onPointerCancel={() => setDrawState(null)}
          onClick={(event) => {
            if (suppressSurfaceClick.current) {
              suppressSurfaceClick.current = false;
              return;
            }
            const target =
              event.target instanceof globalThis.Element
                ? event.target.closest<HTMLElement>("[data-element-id]")
                : null;
            if (target?.dataset.elementId) {
              event.stopPropagation();
              select(target.dataset.elementId, event.shiftKey);
            } else {
              setSelectedIds([]);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSelectedIds([]);
          }}
        >
          {drawState ? (
            <div
              aria-hidden="true"
              className="scene-canvas-draw-preview"
              style={{
                left: Math.min(drawState.start.x, drawState.current.x),
                top: Math.min(drawState.start.y, drawState.current.y),
                width: Math.max(DRAW_MIN_SIZE, Math.abs(drawState.current.x - drawState.start.x)),
                height: Math.max(DRAW_MIN_SIZE, Math.abs(drawState.current.y - drawState.start.y)),
              }}
            />
          ) : null}
          <CanvasRenderer canvas={editing.canvas} className="mx-auto min-h-96 max-w-5xl" />
        </div>
        <aside
          className="w-64 shrink-0 overflow-auto border-l border-border p-4"
          aria-label="Canvas inspector"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Inspector
          </p>
          {selected.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Select an Element.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm">{selected.length} selected</p>
              <Label htmlFor="canvas-opacity">Opacity</Label>
              <Input
                id="canvas-opacity"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={selected[0]?.opacity ?? 1}
                onChange={(event) => updateOpacity(Number(event.target.value))}
              />
              <Button
                variant="destructive"
                onClick={deleteSelection}
                disabled={selected.some((element) => element.id === editing.canvas.root.id)}
              >
                <Minus /> Delete selection
              </Button>
              {selected.length === 1 ? (
                <p className="text-xs text-muted-foreground">
                  F2 renames. Arrow keys nudge absolute Elements.
                </p>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
