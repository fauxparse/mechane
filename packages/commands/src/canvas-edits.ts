import type { Canvas, Element, FrameElement, Position } from "@mechane/domain";
import { ELEMENT_KINDS } from "@mechane/domain";
import type { GraphEdit } from "./graph-edits";

export const CANVAS_COMMAND_TYPES = {
  addElement: "canvas.addElement",
  removeElement: "canvas.removeElement",
  updateElement: "canvas.updateElement",
  reparentElement: "canvas.reparentElement",
  moveArtboard: "canvas.moveArtboard",
} as const;

export type ElementProperties = Record<string, unknown>;
export type NewElement = {
  readonly id: string;
  readonly type: Element["type"];
  readonly [property: string]: unknown;
};

export type CanvasEdit =
  | {
      readonly type: typeof CANVAS_COMMAND_TYPES.addElement;
      readonly element: NewElement;
      readonly parentId: string;
      readonly rank: string;
    }
  | {
      readonly type: typeof CANVAS_COMMAND_TYPES.removeElement;
      readonly elementId: string;
    }
  | {
      readonly type: typeof CANVAS_COMMAND_TYPES.updateElement;
      readonly elementId: string;
      readonly properties: ElementProperties;
      readonly unsetProperties?: readonly string[];
    }
  | {
      readonly type: typeof CANVAS_COMMAND_TYPES.reparentElement;
      readonly elementId: string;
      readonly parentId: string;
      readonly rank: string;
    }
  | {
      readonly type: typeof CANVAS_COMMAND_TYPES.moveArtboard;
      readonly position: Position;
    };

export class CanvasEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasEditError";
  }
}


function cloneElement(element: Element): Element {
  return {
    ...element,
    ...(element.children ? { children: element.children.map(cloneElement) } : {}),
  } as Element;
}

function walk(element: Element, visit: (element: Element) => void): void {
  visit(element);
  for (const child of element.children ?? []) walk(child, visit);
}

function hasElement(root: Element, id: string): boolean {
  let found = false;
  walk(root, (element) => {
    if (element.id === id) found = true;
  });
  return found;
}

function findElement(root: Element, id: string): Element | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findElement(child, id);
    if (found) return found;
  }
  return null;
}

function replaceElement(
  root: Element,
  id: string,
  replace: (element: Element) => Element | null,
): Element {
  if (root.id === id) {
    const next = replace(root);
    if (!next) throw new CanvasEditError(`Cannot remove Canvas root Element "${id}".`);
    return next;
  }
  return {
    ...root,
    ...(root.children
      ? {
          children: root.children
            .map((child) => (child.id === id ? replace(child) : replaceElement(child, id, replace)))
            .filter((child): child is Element => child !== null),
        }
      : {}),
  } as Element;
}

function appendChild(root: Element, parentId: string, child: Element): Element {
  if (root.id === parentId) {
    if (root.type !== "frame")
      throw new CanvasEditError(`Element "${parentId}" cannot contain children.`);
    return { ...root, children: [...(root.children ?? []), child] } as FrameElement;
  }
  if (!root.children) return root;
  return {
    ...root,
    children: root.children.map((existing) => appendChild(existing, parentId, child)),
  } as Element;
}

function sortChildren(root: Element): Element {
  if (!root.children) return root;
  return {
    ...root,
    children: [...root.children]
      .sort(
        (left, right) =>
          (left.rank ?? "").localeCompare(right.rank ?? "") || left.id.localeCompare(right.id),
      )
      .map(sortChildren),
  } as Element;
}

function updateElement(
  root: Element,
  id: string,
  properties: ElementProperties,
  unsetProperties: readonly string[],
): Element {
  if (root.id === id) {
    const next: Record<string, unknown> = { ...root, ...properties };
    for (const property of unsetProperties) delete next[property];
    return next as unknown as Element;
  }
  return {
    ...root,
    ...(root.children
      ? { children: root.children.map((child) => updateElement(child, id, properties, unsetProperties)) }
      : {}),
  } as Element;
}
function assertNewElement(element: NewElement): void {
  if (!element.id || typeof element.id !== "string")
    throw new CanvasEditError("Added Element needs an id.");
  if (!ELEMENT_KINDS.includes(element.type))
    throw new CanvasEditError(`Unknown Element type "${element.type}".`);
  if ("children" in element)
    throw new CanvasEditError("canvas.addElement cannot include children.");
}


export function findCanvasElement(root: Element, id: string): Element | null {
  return findElement(root, id);
}

export function canvasElementParent(
  root: Element,
  childId: string,
): { parentId: string; rank: string } | null {
  for (const child of root.children ?? []) {
    if (child.id === childId) return { parentId: root.id, rank: child.rank ?? "" };
    const nested = canvasElementParent(child, childId);
    if (nested) return nested;
  }
  return null;
}

function assertMutableProperties(
  properties: ElementProperties,
  unsetProperties: readonly string[],
): void {
  for (const key of ["id", "type", "children", "parentId", "rank"]) {
    if (key in properties)
      throw new CanvasEditError(`canvas.updateElement cannot update "${key}".`);
  }
  for (const property of unsetProperties) {
    if (["id", "type", "children", "parentId", "rank"].includes(property)) {
      throw new CanvasEditError(`canvas.updateElement cannot unset "${property}".`);
    }
  }
}

/** Applies serialisable tree edits without mutating the input Canvas. */
export function applyCanvasEdits(canvas: Canvas, edits: readonly CanvasEdit[]): Canvas {
  let root = cloneElement(canvas.root);
  for (const edit of edits) {
    switch (edit.type) {
      case CANVAS_COMMAND_TYPES.addElement: {
        assertNewElement(edit.element);
        if (hasElement(root, edit.element.id))
          throw new CanvasEditError(`Element "${edit.element.id}" already exists.`);
        if (!findElement(root, edit.parentId))
          throw new CanvasEditError(`Unknown parent Element "${edit.parentId}".`);
        root = appendChild(root, edit.parentId, { ...edit.element, rank: edit.rank } as Element);
        root = sortChildren(root);
        break;
      }
      case CANVAS_COMMAND_TYPES.removeElement:
        if (!findElement(root, edit.elementId))
          throw new CanvasEditError(`Unknown Element "${edit.elementId}".`);
        root = replaceElement(root, edit.elementId, () => null);
        break;
      case CANVAS_COMMAND_TYPES.updateElement:
        assertMutableProperties(edit.properties, edit.unsetProperties ?? []);
        if (!findElement(root, edit.elementId))
          throw new CanvasEditError(`Unknown Element "${edit.elementId}".`);
        root = updateElement(root, edit.elementId, edit.properties, edit.unsetProperties ?? []);
        break;
      case CANVAS_COMMAND_TYPES.reparentElement: {
        const element = findElement(root, edit.elementId);
        if (!element) throw new CanvasEditError(`Unknown Element "${edit.elementId}".`);
        if (element.id === root.id)
          throw new CanvasEditError("Cannot reparent the Canvas root Element.");
        if (hasElement(element, edit.parentId))
          throw new CanvasEditError("Cannot reparent an Element into its own descendant.");
        if (!findElement(root, edit.parentId))
          throw new CanvasEditError(`Unknown parent Element "${edit.parentId}".`);
        const moved = { ...element, rank: edit.rank } as Element;
        root = replaceElement(root, edit.elementId, () => null);
        root = appendChild(root, edit.parentId, moved);
        root = sortChildren(root);
        break;
      }
      case CANVAS_COMMAND_TYPES.moveArtboard:
        throw new CanvasEditError("canvas.moveArtboard requires a Canvas workspace.");
    }
  }
  return { ...canvas, root: root as FrameElement };
}

export type ShowEdit = GraphEdit | CanvasEdit;
