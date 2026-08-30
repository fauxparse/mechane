import type { Element as CanvasElement } from "@mechane/domain";

import { fixedFillSizing } from "./canvas-creation";
import { roundToLogicalPixel } from "../components/canvas-pixels";
import type { CanvasClientRect } from "../components/canvas-geometry";
import type { CanvasSelection } from "../components/canvas-selection";

export interface CanvasElementDragOrigin {
  readonly artId: string;
  readonly canvasId: string;
  readonly elementId: string;
  readonly parentId: string | null;
  readonly rank: string | null;
  readonly autoParent: boolean;
}

export interface CanvasElementDropSite {
  readonly artId: string;
  readonly canvasId: string;
  readonly parentId: string;
  readonly rank: string;
  readonly auto: boolean;
}

export type CanvasElementDropPlan =
  | {
      readonly kind: "move";
      readonly canvasId: string;
      readonly elementId: string;
      readonly parentId: string;
      readonly rank: string;
      readonly properties: Record<string, unknown>;
      readonly unsetProperties: readonly string[];
      readonly select: null;
    }
  | {
      readonly kind: "move-between-canvases";
      readonly sourceCanvasId: string;
      readonly targetCanvasId: string;
      readonly elementId: string;
      readonly parentId: string;
      readonly rank: string;
      readonly properties: Record<string, unknown>;
      readonly unsetProperties: readonly string[];
      readonly select: CanvasSelection;
    }
  | {
      readonly kind: "update";
      readonly canvasId: string;
      readonly elementId: string;
      readonly properties: Record<string, unknown>;
      readonly select: null;
    }
  | { readonly kind: "none"; readonly select: null };

export function planCanvasElementDrop(input: {
  readonly origin: CanvasElementDragOrigin;
  readonly site: CanvasElementDropSite | null;
  readonly dropped: CanvasClientRect | null;
  readonly parentOrigin: { readonly x: number; readonly y: number } | null;
  readonly element: CanvasElement | null;
  readonly zoom: number;
}): CanvasElementDropPlan {
  const { origin, site, dropped, parentOrigin, element, zoom } = input;
  if (!site || !dropped) return { kind: "none", select: null };

  const sameCanvas = site.artId === origin.artId;
  const sameParent = sameCanvas && site.parentId === origin.parentId;
  const rank = !site.auto && sameParent ? (origin.rank ?? site.rank) : site.rank;
  const reparented = !sameCanvas || !sameParent || rank !== origin.rank;
  const properties: Record<string, unknown> =
    site.auto || !parentOrigin
      ? {}
      : {
          anchor: {
            horizontal: "left",
            vertical: "top",
            offsetX: roundToLogicalPixel(dropped.x - parentOrigin.x, zoom),
            offsetY: roundToLogicalPixel(dropped.y - parentOrigin.y, zoom),
          },
          ...(origin.autoParent && element
            ? fixedFillSizing(
                element,
                roundToLogicalPixel(dropped.width, zoom),
                roundToLogicalPixel(dropped.height, zoom),
              )
            : {}),
        };
  const unsetProperties = site.auto ? ["anchor"] : [];

  if (!reparented) {
    return Object.keys(properties).length > 0
      ? {
          kind: "update",
          canvasId: origin.canvasId,
          elementId: origin.elementId,
          properties,
          select: null,
        }
      : { kind: "none", select: null };
  }
  if (sameCanvas) {
    return {
      kind: "move",
      canvasId: origin.canvasId,
      elementId: origin.elementId,
      parentId: site.parentId,
      rank,
      properties,
      unsetProperties,
      select: null,
    };
  }
  return {
    kind: "move-between-canvases",
    sourceCanvasId: origin.canvasId,
    targetCanvasId: site.canvasId,
    elementId: origin.elementId,
    parentId: site.parentId,
    rank,
    properties,
    unsetProperties,
    select: { artId: site.artId, elementIds: [origin.elementId] },
  };
}
