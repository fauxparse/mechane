import type { Canvas, Element } from "@mechane/domain";

import { capturing, composite } from "./command";
import type { Command } from "./command";
import type { Gesture } from "./stack";
import { CANVAS_COMMAND_TYPES, applyCanvasEdits } from "./canvas-edits";
import type { CanvasEdit } from "./canvas-edits";

export type CanvasDocument = Canvas & { id: string; kind?: "scene" | "block" };
export type CanvasCommand = Command<CanvasDocument, CanvasEdit>;
export type CanvasGesture = Gesture<CanvasDocument, CanvasEdit>;

function applyEdits(canvas: CanvasDocument, edits: readonly CanvasEdit[]): CanvasDocument {
  return applyCanvasEdits(canvas, edits) as CanvasDocument;
}

type NewElement = Extract<CanvasEdit, { type: typeof CANVAS_COMMAND_TYPES.addElement }>["element"];

type LocatedElement = {
  element: Element;
  parentId: string | null;
};

function cloneElement(element: Element): Element {
  return {
    ...element,
    ...(element.children ? { children: element.children.map(cloneElement) } : {}),
  } as Element;
}

function locate(root: Element, id: string, parentId: string | null = null): LocatedElement | null {
  if (root.id === id) return { element: root, parentId };
  for (const child of root.children ?? []) {
    const found = locate(child, id, root.id);
    if (found) return found;
  }
  return null;
}

function elementWithoutChildren(element: Element): NewElement {
  const { children: _children, ...properties } = element;
  return properties as NewElement;
}

function restoreEdits(element: Element, parentId: string): CanvasEdit[] {
  const edits: CanvasEdit[] = [
    {
      type: CANVAS_COMMAND_TYPES.addElement,
      element: elementWithoutChildren(element),
      parentId,
      rank: element.rank ?? "",
    },
  ];
  for (const child of element.children ?? []) edits.push(...restoreEdits(child, element.id));
  return edits;
}

export function addElement(
  element: NewElement,
  parentId: string,
  rank: string,
  label = `Add ${element.type}`,
): CanvasCommand {
  const edit: CanvasEdit = { type: CANVAS_COMMAND_TYPES.addElement, element, parentId, rank };
  return capturing<CanvasDocument, true, CanvasEdit>({
    type: CANVAS_COMMAND_TYPES.addElement,
    label,
    scope: "canvas",
    edits: [edit],
    capture: () => true,
    apply: (canvas) => applyEdits(canvas, [edit]),
    restore: (canvas) =>
      applyEdits(canvas, [{ type: CANVAS_COMMAND_TYPES.removeElement, elementId: element.id }]),
    restoreEdits: () => [{ type: CANVAS_COMMAND_TYPES.removeElement, elementId: element.id }],
    isEmpty: () => false,
  });
}

export function removeElement(elementId: string, label = "Delete element"): CanvasCommand {
  return capturing<CanvasDocument, LocatedElement | null, CanvasEdit>({
    type: CANVAS_COMMAND_TYPES.removeElement,
    label,
    scope: "selection",
    capture: (canvas) => {
      const found = locate(canvas.root, elementId);
      return found ? { element: cloneElement(found.element), parentId: found.parentId } : null;
    },
    isEmpty: (_canvas, captured) => captured === null || captured.parentId === null,
    apply: (canvas) =>
      applyEdits(canvas, [{ type: CANVAS_COMMAND_TYPES.removeElement, elementId }]),
    restore: (canvas, captured) => {
      if (!captured?.parentId) return canvas;
      return applyEdits(canvas, restoreEdits(captured.element, captured.parentId));
    },
    restoreEdits: (captured) =>
      captured?.parentId ? restoreEdits(captured.element, captured.parentId) : [],
  });
}

export function updateElementProperties(
  elementId: string,
  properties: Record<string, unknown>,
  label = "Update element",
): CanvasCommand {
  return capturing<CanvasDocument, Record<string, unknown> | null, CanvasEdit>({
    type: CANVAS_COMMAND_TYPES.updateElement,
    label,
    scope: "selection",
    coalesceKey: `${CANVAS_COMMAND_TYPES.updateElement}:${elementId}:${Object.keys(properties).join(",")}`,
    edits: [{ type: CANVAS_COMMAND_TYPES.updateElement, elementId, properties }],
    capture: (canvas) => {
      const found = locate(canvas.root, elementId);
      if (!found) return null;
      const previous: Record<string, unknown> = {};
      for (const key of Object.keys(properties))
        previous[key] = found.element[key as keyof Element] ?? null;
      return previous;
    },
    isEmpty: (_canvas, captured) => captured === null,
    apply: (canvas) =>
      applyEdits(canvas, [{ type: CANVAS_COMMAND_TYPES.updateElement, elementId, properties }]),
    restore: (canvas, captured) =>
      captured
        ? applyEdits(canvas, [
            { type: CANVAS_COMMAND_TYPES.updateElement, elementId, properties: captured },
          ])
        : canvas,
    restoreEdits: (captured) =>
      captured
        ? [{ type: CANVAS_COMMAND_TYPES.updateElement, elementId, properties: captured }]
        : [],
  });
}

export function reparentElement(
  elementId: string,
  parentId: string,
  rank: string,
  label = "Move element",
): CanvasCommand {
  return capturing<CanvasDocument, { parentId: string; rank: string } | null, CanvasEdit>({
    type: CANVAS_COMMAND_TYPES.reparentElement,
    label,
    scope: "selection",
    coalesceKey: `${CANVAS_COMMAND_TYPES.reparentElement}:${elementId}`,
    edits: [{ type: CANVAS_COMMAND_TYPES.reparentElement, elementId, parentId, rank }],
    capture: (canvas) => {
      const found = locate(canvas.root, elementId);
      return found?.parentId ? { parentId: found.parentId, rank: found.element.rank ?? "" } : null;
    },
    isEmpty: (_canvas, captured) => captured === null,
    apply: (canvas) =>
      applyEdits(canvas, [
        { type: CANVAS_COMMAND_TYPES.reparentElement, elementId, parentId, rank },
      ]),
    restore: (canvas, captured) =>
      captured
        ? applyEdits(canvas, [
            { type: CANVAS_COMMAND_TYPES.reparentElement, elementId, ...captured },
          ])
        : canvas,
    restoreEdits: (captured) =>
      captured ? [{ type: CANVAS_COMMAND_TYPES.reparentElement, elementId, ...captured }] : [],
  });
}

export function deleteElements(elementIds: readonly string[]): CanvasCommand {
  return composite<CanvasDocument, CanvasEdit>({
    label: "Delete elements",
    scope: "selection",
    commands: elementIds.map((elementId) => removeElement(elementId)),
  });
}
