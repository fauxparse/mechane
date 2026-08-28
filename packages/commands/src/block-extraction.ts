// Creating a Block out of what is already on a Canvas (#426).
//
// The user gesture is one thing — "make this a Block" — but it lands in two places: the Block
// itself is a Show-owned resource and travels as a `graph.addBlock` edit, while the Slot that
// replaces the selection is an ordinary Canvas edit. This module derives both halves from the
// same reading of the selection, so the Slot that stays behind and the Block Canvas that leaves
// are guaranteed to agree about which Elements moved and how they were laid out.
//
// Deliberately geometry-free. The Canvas model positions Elements by anchor and by auto layout,
// never by an absolute rect, so the honest way to size the new Block Canvas is to take the box
// the selection already lived in — the Frame's own dimensions, or the shared parent's — rather
// than to measure the DOM and bake pixels the model would then disagree with.

import type { Block, Canvas, Element, FrameElement, Position } from "@mechane/domain";
import { generateId } from "@mechane/domain";

import { canvasElementParent, findCanvasElement } from "./canvas-edits";
import type { NewElement } from "./canvas-edits";
import { addCanvasArtboard, addCanvasElement, removeCanvasElement } from "./canvas-commands";
import type { CanvasWorkspaceCommand } from "./canvas-commands";
import { addBlock } from "./graph-commands";
import type { ShowGraphCommand } from "./graph-commands";
import { composite } from "./command";

/** How a Frame arranges its children — what the new Block Canvas root inherits. */
const LAYOUT_PROPERTIES = [
  "layoutMode",
  "autoLayout",
  "direction",
  "gap",
  "padding",
  "alignPrimary",
  "alignCounter",
  "primaryAlign",
  "counterAlign",
  "clip",
] as const;

/** How a Frame paints. Kept with the contents so the Block looks like what it replaced. */
const PAINT_PROPERTIES = ["fill", "stroke", "cornerRadius", "opacity", "blendMode"] as const;

/**
 * Where an Element sat in *its parent's* layout. These belong to the Slot left behind, not to
 * the Block: the Block does not know what contains it.
 */
const PLACEMENT_PROPERTIES = [
  "sizing",
  "alignSelf",
  "anchor",
  "rotation",
  "layout",
  "aspectRatio",
] as const;

function pick(element: Element, keys: readonly string[]): Record<string, unknown> {
  const source = element as unknown as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) picked[key] = structuredClone(source[key]);
  }
  return picked;
}

function isAutoLayout(element: Element): boolean {
  const frame = element as FrameElement;
  return frame.autoLayout === true || frame.layoutMode === "auto";
}

function inStackingOrder(elements: readonly Element[]): Element[] {
  return [...elements].sort(
    (left, right) =>
      (left.rank ?? "").localeCompare(right.rank ?? "") || left.id.localeCompare(right.id),
  );
}

export class BlockExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockExtractionError";
  }
}

export interface CreateBlockFromSelectionInput {
  /** The Canvas the selection lives on. */
  readonly canvasId: string;
  readonly canvas: Canvas;
  /** The selected Elements, in any order. */
  readonly elementIds: readonly string[];
  /** The new Block's name. The caller owns uniqueness — `graph.addBlock` rejects a clash. */
  readonly name: string;
  /** Where the new Block's Artboard sits in the workspace. */
  readonly position: Position;
  readonly blockId?: string;
  readonly blockCanvasId?: string;
  readonly slotElementId?: string;
}

export interface CreatedBlockFromSelection {
  readonly block: Block;
  /** The Slot that replaces the selection, as it will be added to the source Canvas. */
  readonly slot: NewElement;
  /** Adds the Block resource to the Show graph. */
  readonly graphCommand: ShowGraphCommand;
  /** Replaces the selection on the source Canvas with the Slot. */
  readonly canvasCommand: CanvasWorkspaceCommand;
}

/** Drops any selected Element that is already travelling inside another selected Element. */
function topmostSelection(canvas: Canvas, elementIds: readonly string[]): Element[] {
  const selected = elementIds.map((elementId) => {
    const element = findCanvasElement(canvas.root, elementId);
    if (!element) throw new BlockExtractionError(`The Canvas has no Element "${elementId}".`);
    if (element.id === canvas.root.id) {
      throw new BlockExtractionError("The Canvas root cannot become a Block.");
    }
    return element;
  });
  const contained = new Set<string>();
  for (const element of selected) {
    const walk = (candidate: Element) => {
      for (const child of candidate.children ?? []) {
        contained.add(child.id);
        walk(child);
      }
    };
    walk(element);
  }
  return inStackingOrder(selected.filter((element) => !contained.has(element.id)));
}

interface ResolvedSelection {
  readonly selected: readonly Element[];
  readonly parent: Element;
  readonly parentId: string;
  /** Where the Slot goes in the stacking order: exactly where the selection was. */
  readonly slotRank: string;
}

function resolveSelection(canvas: Canvas, elementIds: readonly string[]): ResolvedSelection {
  if (elementIds.length === 0) throw new BlockExtractionError("Nothing is selected.");
  const selected = topmostSelection(canvas, elementIds);
  const parents = selected.map((element) => {
    const parent = canvasElementParent(canvas.root, element.id);
    if (!parent) throw new BlockExtractionError(`Element "${element.id}" has no parent.`);
    return parent;
  });
  const parentId = parents[0]!.parentId;
  if (parents.some((candidate) => candidate.parentId !== parentId)) {
    throw new BlockExtractionError("A Block can only be made from Elements that are siblings.");
  }
  const parent = findCanvasElement(canvas.root, parentId);
  if (!parent) throw new BlockExtractionError(`The Canvas has no Element "${parentId}".`);
  return { selected, parent, parentId, slotRank: parents[0]!.rank };
}

/**
 * Why this selection cannot become a Block, or null when it can — for the surface that offers
 * the command, so it can say why it is greyed out rather than failing when it is pressed.
 */
export function blockExtractionProblem(
  canvas: Canvas,
  elementIds: readonly string[],
): string | null {
  try {
    resolveSelection(canvas, elementIds);
    return null;
  } catch (reason) {
    if (reason instanceof BlockExtractionError) return reason.message;
    throw reason;
  }
}

/**
 * The default name for a Block made from this selection: a Frame lends its own name, and
 * anything else falls back to `fallback`.
 */
export function blockNameForSelection(
  canvas: Canvas,
  elementIds: readonly string[],
  fallback = "Block",
): string {
  const { selected } = resolveSelection(canvas, elementIds);
  const only = selected.length === 1 ? selected[0]! : null;
  return (only?.type === "frame" && only.name?.trim()) || fallback;
}

/**
 * The Block, the Slot that replaces the selection, and the two commands that put them there.
 *
 * A selected Frame becomes the Block Canvas itself — its name, its dimensions, its layout
 * properties, and its immediate children — rather than being copied *into* one, which would
 * leave the Block wrapping a Frame that wraps everything (#426). Any other selection keeps the
 * box it already occupied: the Block Canvas takes the shared parent's size, and its layout
 * properties too when that parent is an auto-layout Frame.
 */
export function createBlockFromSelection(
  input: CreateBlockFromSelectionInput,
): CreatedBlockFromSelection {
  const { canvas, canvasId, elementIds, name, position } = input;
  const { selected, parent, parentId, slotRank } = resolveSelection(canvas, elementIds);

  const blockId = input.blockId ?? generateId("block");
  const blockCanvasId = input.blockCanvasId ?? generateId("canvas");
  const slotElementId = input.slotElementId ?? generateId("canvas");
  const rootId = `${blockCanvasId}-root`;

  const only = selected.length === 1 ? selected[0]! : null;
  const frame = only?.type === "frame" ? only : null;

  // A Frame becomes the Block Canvas. Everything else is gathered into one, sized like the box
  // it came out of, so the Slot occupies the same space the selection did.
  const source = frame ?? parent;
  const children = frame ? (frame.children ?? []) : selected;
  const root: FrameElement = {
    id: rootId,
    type: "frame",
    ...pick(source, LAYOUT_PROPERTIES),
    ...(frame ? pick(frame, PAINT_PROPERTIES) : {}),
    ...(source.sizing ? { sizing: structuredClone(source.sizing) } : {}),
    children: children.map((child) => structuredClone(child) as Element),
  };

  const block: Block = {
    id: blockId,
    name,
    canvas: { id: blockCanvasId, kind: "block", position: { ...position }, root },
    variables: [],
    states: [],
    stateSelectorVariableId: null,
  };

  // The Slot is a layout container, so it always carries auto layout of its own, and it takes
  // over the placement the selection had inside the parent that keeps it.
  const slot: NewElement = {
    id: slotElementId,
    type: "slot",
    blockId,
    layoutMode: "auto",
    autoLayout: true,
    ...(frame
      ? {
          ...(frame.name ? { name: frame.name } : {}),
          ...pick(frame, PLACEMENT_PROPERTIES),
        }
      : isAutoLayout(parent)
        ? {}
        : {
            // An absolutely positioned group kept its parent's box, so the Slot fills it and the
            // Elements inside the Block keep the anchors they already had.
            sizing: { width: { mode: "fill" }, height: { mode: "fill" } },
            anchor: { horizontal: "left", vertical: "top", offsetX: 0, offsetY: 0 },
          }),
  };

  return {
    block,
    slot,
    graphCommand: addBlock(block, "Create Block"),
    canvasCommand: composite({
      type: "canvas.createBlockFromSelection",
      label: "Create Block",
      scope: "selection",
      commands: [
        // The Artboard is local to the editor; the server builds its own from `graph.addBlock`.
        addCanvasArtboard({
          canvasId: blockCanvasId,
          canvas: { kind: "block", root },
          position: { ...position },
        }),
        addCanvasElement(canvasId, slot, parentId, slotRank),
        ...selected.map((element) => removeCanvasElement(canvasId, element.id)),
      ],
    }),
  };
}
