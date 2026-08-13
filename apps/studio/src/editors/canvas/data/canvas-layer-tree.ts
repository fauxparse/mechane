import type { Element, ElementKind, FrameElement } from "@mechane/domain";

import type { CanvasArtboardDocument } from "../../../api/canvas";
import { canvasElementDisplayName } from "./canvas-names";
import { layerChildren, layerMatches } from "./canvas-layers";

/**
 * One row of the Layers navigator. The Canvas is the root row — the Canvas's own root Element is
 * never a row of its own, so its children hang directly off the Canvas (#222).
 */
export interface LayerRow {
  readonly kind: "canvas" | "element";
  /** Art id for a Canvas row, Element id for an Element row. */
  readonly id: string;
  readonly artId: string;
  readonly depth: number;
  readonly name: string;
  readonly rawName?: string | null;
  readonly elementKind?: ElementKind;
  readonly hasChildren: boolean;
}

export interface LayerTreeOptions {
  /** Ids — art ids and Element ids — whose children are showing. */
  readonly expanded: ReadonlySet<string>;
  readonly query?: string;
}

function isFrame(element: Element): element is FrameElement {
  return element.type === "frame";
}

function childrenOf(element: Element): readonly Element[] {
  return isFrame(element) ? layerChildren(element) : [];
}

/** Whether this Element, or anything under it, answers the query. */
function subtreeMatches(element: Element, query: string): boolean {
  if (layerMatches({ element, depth: 0, parentId: null }, query)) return true;
  return childrenOf(element).some((child) => subtreeMatches(child, query));
}

/**
 * The rows for one Canvas: the Canvas itself, then as much of its Element tree as expansion and
 * the query allow. A query expands whatever it has to in order to show its own matches — filtering
 * that hides its results would be worse than not filtering at all.
 */
export function canvasLayerRows(
  artboard: CanvasArtboardDocument,
  { expanded, query = "" }: LayerTreeOptions,
): LayerRow[] {
  const trimmed = query.trim();
  const root = artboard.canvas.root;
  const rootChildren = childrenOf(root);
  const rows: LayerRow[] = [
    {
      kind: "canvas",
      id: artboard.artId,
      artId: artboard.artId,
      depth: 0,
      name: artboard.name,
      hasChildren: rootChildren.length > 0,
    },
  ];

  const visit = (element: Element, depth: number) => {
    if (trimmed && !subtreeMatches(element, trimmed)) return;
    const children = childrenOf(element);
    rows.push({
      kind: "element",
      id: element.id,
      artId: artboard.artId,
      depth,
      name: canvasElementDisplayName(element),
      rawName: element.name,
      elementKind: element.type,
      hasChildren: children.length > 0,
    });
    // A search opens whatever stands between it and a match; otherwise expansion decides.
    if (children.length > 0 && (trimmed || expanded.has(element.id))) {
      for (const child of children) visit(child, depth + 1);
    }
  };

  if (rootChildren.length > 0 && (trimmed || expanded.has(artboard.artId))) {
    for (const child of rootChildren) visit(child, 1);
  }
  return rows;
}

/** The Frames standing between the Canvas and `elementId`, plus the Canvas itself. */
export function ancestorIdsOf(artboard: CanvasArtboardDocument, elementId: string): string[] {
  const trail: string[] = [];
  const walk = (element: Element): boolean => {
    if (element.id === elementId) return true;
    for (const child of childrenOf(element)) {
      if (walk(child)) {
        // The root Element is not a row, so it contributes the Canvas rather than itself.
        trail.push(element.id === artboard.canvas.root.id ? artboard.artId : element.id);
        return true;
      }
    }
    return false;
  };
  return walk(artboard.canvas.root) ? trail : [];
}

/** Everything that must be open for `elementIds` to be visible in the navigator. */
export function expansionForSelection(
  artboard: CanvasArtboardDocument,
  elementIds: readonly string[],
): string[] {
  return [...new Set(elementIds.flatMap((id) => ancestorIdsOf(artboard, id)))];
}
