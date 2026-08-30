import type { Canvas, Element, Position } from "@mechane/domain";
import { generateId } from "@mechane/domain";
import {
  ARTBOARD_COMMAND_TYPES,
  CANVAS_COMMAND_TYPES,
  canvasElementParent,
  findCanvasElement,
  applyCanvasEdits,
} from "./canvas-edits";
import type { ArtboardEdit, CanvasEdit, ElementProperties, NewElement } from "./canvas-edits";
import { capturing, composite } from "./command";
import type { Command } from "./command";

/** One editable Canvas and its persisted position in the Show Canvas workspace. */
export interface CanvasArtboard {
  readonly canvasId: string;
  readonly canvas: Canvas;
  readonly position: Position;
}

/** The document state owned by the Canvas editor command stack. */
export interface CanvasWorkspace {
  readonly artboards: readonly CanvasArtboard[];
}

/**
 * What one workspace edit can say: Canvas content, or the framing of the
 * Artboard presenting it. Both name a Canvas; only the first is Canvas
 * content, which is why the two are separate variants (#436).
 */
export type CanvasWorkspaceEditPayload = CanvasEdit | ArtboardEdit;

/** A Canvas or Artboard edit together with the Canvas it targets. */
export interface CanvasWorkspaceEdit {
  readonly canvasId: string;
  readonly edit: CanvasWorkspaceEditPayload;
}

export type CanvasWorkspaceCommand = Command<CanvasWorkspace, CanvasWorkspaceEdit>;

type InverseCapture = { readonly edit: CanvasWorkspaceEditPayload };

function artboardIndex(workspace: CanvasWorkspace, canvasId: string): number {
  const index = workspace.artboards.findIndex((artboard) => artboard.canvasId === canvasId);
  if (index === -1) throw new Error(`Canvas workspace has no Canvas "${canvasId}".`);
  return index;
}

function artboardFor(workspace: CanvasWorkspace, canvasId: string): CanvasArtboard {
  return workspace.artboards[artboardIndex(workspace, canvasId)]!;
}

function replaceArtboard(
  workspace: CanvasWorkspace,
  canvasId: string,
  replace: (artboard: CanvasArtboard) => CanvasArtboard,
): CanvasWorkspace {
  const index = artboardIndex(workspace, canvasId);
  const artboards = [...workspace.artboards];
  artboards[index] = replace(artboards[index]!);
  return { ...workspace, artboards };
}

function applyWorkspaceEdit(
  workspace: CanvasWorkspace,
  target: CanvasWorkspaceEdit,
): CanvasWorkspace {
  return replaceArtboard(workspace, target.canvasId, (artboard) => {
    if (target.edit.type === ARTBOARD_COMMAND_TYPES.move) {
      return { ...artboard, position: { ...target.edit.position } };
    }
    return { ...artboard, canvas: applyCanvasEdits(artboard.canvas, [target.edit]) };
  });
}

function targetEdit(canvasId: string, edit: CanvasWorkspaceEditPayload): CanvasWorkspaceEdit {
  return { canvasId, edit };
}

function subtreeEdits(
  canvasId: string,
  element: Element,
  parentId: string,
  rank: string,
): CanvasWorkspaceEdit[] {
  const edits: CanvasWorkspaceEdit[] = [
    targetEdit(canvasId, {
      type: CANVAS_COMMAND_TYPES.addElement,
      element: { id: element.id, type: element.type, ...elementProperties(element) },
      parentId,
      rank,
    }),
  ];
  for (const child of element.children ?? []) {
    edits.push(...subtreeEdits(canvasId, child, element.id, child.rank ?? ""));
  }
  return edits;
}

function elementProperties(element: Element): ElementProperties {
  const properties: ElementProperties = {};
  for (const [key, value] of Object.entries(element)) {
    if (key === "id" || key === "type" || key === "rank" || key === "children") continue;
    properties[key] = structuredClone(value);
  }
  return properties;
}

function inverseUpdate(
  element: Element,
  edit: Extract<CanvasEdit, { type: "canvas.updateElement" }>,
): CanvasEdit {
  const properties: ElementProperties = {};
  const unsetProperties: string[] = [];
  for (const key of Object.keys(edit.properties)) {
    if (Object.prototype.hasOwnProperty.call(element, key))
      properties[key] = structuredClone((element as unknown as Record<string, unknown>)[key]);
    else unsetProperties.push(key);
  }
  for (const key of edit.unsetProperties ?? []) {
    if (Object.prototype.hasOwnProperty.call(element, key))
      properties[key] = structuredClone((element as unknown as Record<string, unknown>)[key]);
  }
  return {
    type: CANVAS_COMMAND_TYPES.updateElement,
    elementId: edit.elementId,
    properties,
    ...(unsetProperties.length > 0 ? { unsetProperties } : {}),
  };
}

/**
 * Adds an Artboard to the workspace the editor is holding.
 *
 * Nothing goes on the wire: the only Canvas a client creates is a Block's, and that Canvas
 * travels inside the `graph.addBlock` edit that creates the Block itself (#426). This command
 * exists so the editor can show — and immediately edit — the Artboard the server is about to
 * create, and so undo takes it away again.
 */
export function addCanvasArtboard(artboard: CanvasArtboard): CanvasWorkspaceCommand {
  return capturing<CanvasWorkspace, null, CanvasWorkspaceEdit>({
    type: "canvas.addArtboard",
    label: "Add Artboard",
    scope: "canvas",
    capture: () => null,
    apply: (workspace) => ({
      ...workspace,
      artboards: [
        ...workspace.artboards.filter((existing) => existing.canvasId !== artboard.canvasId),
        artboard,
      ],
    }),
    restore: (workspace) => ({
      ...workspace,
      artboards: workspace.artboards.filter((existing) => existing.canvasId !== artboard.canvasId),
    }),
    edits: [],
    restoreEdits: () => [],
  });
}

export function addCanvasElement(
  canvasId: string,
  element: NewElement,
  parentId: string,
  rank: string,
): CanvasWorkspaceCommand {
  const edit = targetEdit(canvasId, {
    type: CANVAS_COMMAND_TYPES.addElement,
    element,
    parentId,
    rank,
  });
  return capturing<CanvasWorkspace, InverseCapture, CanvasWorkspaceEdit>({
    type: CANVAS_COMMAND_TYPES.addElement,
    label: "Add Element",
    scope: "canvas",
    capture: () => ({
      edit: targetEdit(canvasId, {
        type: CANVAS_COMMAND_TYPES.removeElement,
        elementId: element.id,
      }).edit,
    }),
    apply: (workspace) => applyWorkspaceEdit(workspace, edit),
    restore: (workspace, captured) =>
      applyWorkspaceEdit(workspace, targetEdit(canvasId, captured.edit)),
    edits: [edit],
    restoreEdits: (captured) => [targetEdit(canvasId, captured.edit)],
  });
}

/** Places an existing Block as one invisible Slot wrapper. */
export function placeBlockInSlot(
  canvasId: string,
  blockId: string,
  parentId: string,
  rank: string,
  elementId = generateId("canvas"),
): CanvasWorkspaceCommand {
  const element: NewElement = {
    id: elementId,
    type: "slot",
    blockId,
    layoutMode: "auto",
  };
  return addCanvasElement(canvasId, element, parentId, rank);
}

export function configureSlot(
  canvasId: string,
  elementId: string,
  properties: ElementProperties,
): CanvasWorkspaceCommand {
  return updateCanvasElement(canvasId, elementId, properties);
}

export function removeCanvasElement(canvasId: string, elementId: string): CanvasWorkspaceCommand {
  return capturing<
    CanvasWorkspace,
    { readonly restore: readonly CanvasWorkspaceEdit[] },
    CanvasWorkspaceEdit
  >({
    type: CANVAS_COMMAND_TYPES.removeElement,
    label: "Delete Element",
    scope: "selection",
    capture: (workspace) => {
      const artboard = artboardFor(workspace, canvasId);
      const element = findCanvasElement(artboard.canvas.root, elementId);
      if (!element) throw new Error(`Canvas "${canvasId}" has no Element "${elementId}".`);
      const parent = canvasElementParent(artboard.canvas.root, elementId);
      if (!parent) throw new Error("Cannot remove the Canvas root Element.");
      return {
        restore: subtreeEdits(canvasId, structuredClone(element), parent.parentId, parent.rank),
      };
    },
    apply: (workspace) =>
      applyWorkspaceEdit(
        workspace,
        targetEdit(canvasId, { type: CANVAS_COMMAND_TYPES.removeElement, elementId }),
      ),
    restore: (workspace, captured) => captured.restore.reduce(applyWorkspaceEdit, workspace),
    edits: [targetEdit(canvasId, { type: CANVAS_COMMAND_TYPES.removeElement, elementId })],
    restoreEdits: (captured) => captured.restore,
  });
}

export function updateCanvasElement(
  canvasId: string,
  elementId: string,
  properties: ElementProperties,
  unsetProperties: readonly string[] = [],
): CanvasWorkspaceCommand {
  const edit: CanvasEdit = {
    type: CANVAS_COMMAND_TYPES.updateElement,
    elementId,
    properties,
    ...(unsetProperties.length > 0 ? { unsetProperties } : {}),
  };
  return capturing<CanvasWorkspace, InverseCapture, CanvasWorkspaceEdit>({
    type: CANVAS_COMMAND_TYPES.updateElement,
    label: "Update Element",
    scope: "selection",
    coalesceKey: `canvas:update:${canvasId}:${elementId}`,
    capture: (workspace) => {
      const element = findCanvasElement(artboardFor(workspace, canvasId).canvas.root, elementId);
      if (!element) throw new Error(`Canvas "${canvasId}" has no Element "${elementId}".`);
      return { edit: inverseUpdate(element, edit) };
    },
    apply: (workspace) => applyWorkspaceEdit(workspace, targetEdit(canvasId, edit)),
    restore: (workspace, captured) =>
      applyWorkspaceEdit(workspace, targetEdit(canvasId, captured.edit)),
    edits: [targetEdit(canvasId, edit)],
    restoreEdits: (captured) => [targetEdit(canvasId, captured.edit)],
  });
}
export function updateCanvasElements(
  canvasId: string,
  updates: readonly {
    readonly elementId: string;
    readonly properties: ElementProperties;
    readonly unsetProperties?: readonly string[];
  }[],
): CanvasWorkspaceCommand {
  return composite<CanvasWorkspace, CanvasWorkspaceEdit>({
    type: "canvas.updateElements",
    label: "Update Elements",
    scope: "selection",
    commands: updates.map((update) =>
      updateCanvasElement(canvasId, update.elementId, update.properties, update.unsetProperties),
    ),
  });
}

export function reparentCanvasElement(
  canvasId: string,
  elementId: string,
  parentId: string,
  rank: string,
): CanvasWorkspaceCommand {
  const edit: CanvasEdit = {
    type: CANVAS_COMMAND_TYPES.reparentElement,
    elementId,
    parentId,
    rank,
  };
  return capturing<CanvasWorkspace, InverseCapture, CanvasWorkspaceEdit>({
    type: CANVAS_COMMAND_TYPES.reparentElement,
    label: "Move Element",
    scope: "selection",
    coalesceKey: `canvas:reparent:${canvasId}:${elementId}`,
    capture: (workspace) => {
      const element = findCanvasElement(artboardFor(workspace, canvasId).canvas.root, elementId);
      if (!element) throw new Error(`Canvas "${canvasId}" has no Element "${elementId}".`);
      const parent = canvasElementParent(artboardFor(workspace, canvasId).canvas.root, elementId);
      if (!parent) throw new Error("Cannot reparent the Canvas root Element.");
      return {
        edit: {
          type: CANVAS_COMMAND_TYPES.reparentElement,
          elementId,
          parentId: parent.parentId,
          rank: parent.rank,
        },
      };
    },
    apply: (workspace) => applyWorkspaceEdit(workspace, targetEdit(canvasId, edit)),
    restore: (workspace, captured) =>
      applyWorkspaceEdit(workspace, targetEdit(canvasId, captured.edit)),
    edits: [targetEdit(canvasId, edit)],
    restoreEdits: (captured) => [targetEdit(canvasId, captured.edit)],
  });
}
export function moveCanvasElement(
  canvasId: string,
  elementId: string,
  parentId: string,
  rank: string,
  properties: ElementProperties = {},
  unsetProperties: readonly string[] = [],
): CanvasWorkspaceCommand {
  const commands: Command<CanvasWorkspace, CanvasWorkspaceEdit>[] = [
    reparentCanvasElement(canvasId, elementId, parentId, rank),
  ];
  if (Object.keys(properties).length > 0 || unsetProperties.length > 0) {
    commands.push(updateCanvasElement(canvasId, elementId, properties, unsetProperties));
  }
  return composite<CanvasWorkspace, CanvasWorkspaceEdit>({
    type: "canvas.moveElement",
    label: "Move Element",
    scope: "selection",
    commands,
  });
}

/**
 * Moves a complete Element subtree between Canvases as one command. The wire edits are still the
 * ordinary remove/add vocabulary, but they stay in one batch so the server applies both sides
 * transactionally and the generated inverse puts the same subtree back.
 */
export function moveCanvasElementBetweenCanvases(
  sourceCanvasId: string,
  targetCanvasId: string,
  elementId: string,
  parentId: string,
  rank: string,
  properties: ElementProperties = {},
  unsetProperties: readonly string[] = [],
): CanvasWorkspaceCommand {
  return {
    type: "canvas.moveElementBetweenCanvases",
    label: "Move Element",
    scope: "selection",
    isEmpty: false,
    apply(workspace) {
      const source = artboardFor(workspace, sourceCanvasId);
      const target = artboardFor(workspace, targetCanvasId);
      if (sourceCanvasId === targetCanvasId)
        throw new Error("Cross-Canvas move requires different Canvases.");
      const element = findCanvasElement(source.canvas.root, elementId);
      if (!element) throw new Error(`Canvas "${sourceCanvasId}" has no Element "${elementId}".`);
      const originalParent = canvasElementParent(source.canvas.root, elementId);
      if (!originalParent) throw new Error("Cannot move the Canvas root Element.");
      if (!findCanvasElement(target.canvas.root, parentId))
        throw new Error(`Canvas "${targetCanvasId}" has no parent Element "${parentId}".`);
      const inverseProperties = elementProperties(element);
      const updatedCanvas =
        Object.keys(properties).length > 0 || unsetProperties.length > 0
          ? applyCanvasEdits(source.canvas, [
              {
                type: CANVAS_COMMAND_TYPES.updateElement,
                elementId,
                properties,
                unsetProperties,
              },
            ])
          : source.canvas;
      const moved = findCanvasElement(updatedCanvas.root, elementId);
      if (!moved) throw new Error(`Canvas "${sourceCanvasId}" lost Element "${elementId}".`);
      const inverseUnsetProperties = Object.keys(elementProperties(moved)).filter(
        (key) => !(key in inverseProperties),
      );
      const removals = [
        targetEdit(sourceCanvasId, {
          type: CANVAS_COMMAND_TYPES.removeElement,
          elementId,
        }),
      ];
      const additions = subtreeEdits(targetCanvasId, moved, parentId, rank);
      const state = [...removals, ...additions].reduce(applyWorkspaceEdit, workspace);
      return {
        state,
        inverse: moveCanvasElementBetweenCanvases(
          targetCanvasId,
          sourceCanvasId,
          elementId,
          originalParent.parentId,
          originalParent.rank,
          inverseProperties,
          inverseUnsetProperties,
        ),
        edits: [...removals, ...additions],
      };
    },
  };
}
export function moveCanvasArtboard(canvasId: string, position: Position): CanvasWorkspaceCommand {
  const edit: ArtboardEdit = { type: ARTBOARD_COMMAND_TYPES.move, position };
  return capturing<CanvasWorkspace, InverseCapture, CanvasWorkspaceEdit>({
    type: ARTBOARD_COMMAND_TYPES.move,
    label: "Move Artboard",
    scope: "canvas",
    coalesceKey: `canvas:artboard:${canvasId}`,
    capture: (workspace) => ({
      edit: {
        type: ARTBOARD_COMMAND_TYPES.move,
        position: { ...artboardFor(workspace, canvasId).position },
      },
    }),
    apply: (workspace) => applyWorkspaceEdit(workspace, targetEdit(canvasId, edit)),
    restore: (workspace, captured) =>
      applyWorkspaceEdit(workspace, targetEdit(canvasId, captured.edit)),
    edits: [targetEdit(canvasId, edit)],
    restoreEdits: (captured) => [targetEdit(canvasId, captured.edit)],
  });
}

export function applyCanvasWorkspaceEdits(
  workspace: CanvasWorkspace,
  edits: readonly CanvasWorkspaceEdit[],
): CanvasWorkspace {
  return edits.reduce(applyWorkspaceEdit, workspace);
}
function elementLifetime(canvasId: string, elementId: string): string {
  return `${canvasId}:${elementId}`;
}

function workspaceSetter(
  edit: CanvasWorkspaceEdit,
): { key: string; ids: readonly string[] } | null {
  switch (edit.edit.type) {
    case ARTBOARD_COMMAND_TYPES.move:
      return { key: `moveArtboard:${edit.canvasId}`, ids: [] };
    case CANVAS_COMMAND_TYPES.updateElement:
      return {
        key: `updateElement:${edit.canvasId}:${edit.edit.elementId}`,
        ids: [elementLifetime(edit.canvasId, edit.edit.elementId)],
      };
    case CANVAS_COMMAND_TYPES.reparentElement:
      return {
        key: `reparentElement:${edit.canvasId}:${edit.edit.elementId}`,
        ids: [
          elementLifetime(edit.canvasId, edit.edit.elementId),
          elementLifetime(edit.canvasId, edit.edit.parentId),
        ],
      };
    default:
      return null;
  }
}

function workspaceStructuralIds(edit: CanvasWorkspaceEdit): readonly string[] {
  switch (edit.edit.type) {
    case CANVAS_COMMAND_TYPES.addElement:
      return [elementLifetime(edit.canvasId, edit.edit.element.id)];
    case CANVAS_COMMAND_TYPES.removeElement:
      return [elementLifetime(edit.canvasId, edit.edit.elementId)];
    default:
      return [];
  }
}

/** Drops redundant absolute Canvas setters while preserving structural edits. */
export function coalesceCanvasWorkspaceEdits(
  edits: readonly CanvasWorkspaceEdit[],
): CanvasWorkspaceEdit[] {
  const superseded = new Set<number>();
  const seen = new Map<string, readonly string[]>();
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const edit = edits[index]!;
    const barriers = workspaceStructuralIds(edit);
    for (const [key, ids] of seen) {
      if (barriers.some((id) => ids.includes(id))) seen.delete(key);
    }
    const setter = workspaceSetter(edit);
    if (!setter) continue;
    if (seen.has(setter.key)) superseded.add(index);
    else seen.set(setter.key, setter.ids);
  }
  return superseded.size === 0 ? [...edits] : edits.filter((_, index) => !superseded.has(index));
}
