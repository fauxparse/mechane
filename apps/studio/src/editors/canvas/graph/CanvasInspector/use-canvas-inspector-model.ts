import { useCallback, useMemo } from "react";
import type { Element } from "@mechane/domain";
import { isPropertyConnection } from "@mechane/domain";
import { canvasElementParent, findCanvasElement } from "@mechane/commands";
import type { CanvasArtboardDocument } from "../../../../api/canvas";
import { lockedAspectRatio } from "../../commands/canvas-resize";
import { numericSizeValue } from "./canvas-inspector-values";
import type {
  CanvasInspectorModel,
  CanvasInspectorProps,
  CanvasInspectorUpdate,
} from "./canvas-inspector-types";

function collectFontFamilies(artboards: readonly CanvasArtboardDocument[]): readonly string[] {
  const families = new Set<string>();
  const visit = (element: Element) => {
    if (element.type === "text" && typeof element.fontFamily === "string") {
      const family = element.fontFamily.trim();
      if (family) families.add(family);
    }
    element.children?.forEach(visit);
  };
  artboards.forEach((artboard) => visit(artboard.canvas.root));
  return [...families];
}
const EMPTY_VARIABLES = [] as const;

function sameValue(left: unknown, right: unknown): boolean {
  if (isPropertyConnection(left) || isPropertyConnection(right)) {
    return (
      isPropertyConnection(left) &&
      isPropertyConnection(right) &&
      left.variableId === right.variableId
    );
  }
  return Object.is(left, right);
}

function propertyValue(element: Element, property: string): unknown {
  return property in element ? Reflect.get(element, property) : undefined;
}

function commonValue(selected: readonly Element[], property: string): unknown {
  const first = selected[0];
  if (!first) return undefined;
  const firstValue = propertyValue(first, property);
  return selected.every((element) => sameValue(propertyValue(element, property), firstValue))
    ? firstValue
    : undefined;
}

function applyInspectorUpdate(
  focused: CanvasInspectorProps["focused"],
  elements: readonly Element[],
  target: Element | null,
  onUpdateElement: CanvasInspectorProps["onUpdateElement"],
  onUpdateElements: CanvasInspectorProps["onUpdateElements"],
  properties: Record<string, unknown>,
  unset: readonly string[],
): void {
  if (!focused) return;
  const selected = elements.length > 0 ? elements : target ? [target] : [];
  const updates = selected.map((element) => ({
    elementId: element.id,
    properties,
    ...(unset.length > 0 ? { unsetProperties: unset } : {}),
  }));
  if (onUpdateElements) onUpdateElements(focused.canvasId, updates);
  else {
    for (const item of updates) {
      onUpdateElement?.(focused.canvasId, item.elementId, properties, unset);
    }
  }
}

function useAspectRatioLock(
  target: Element | null,
  update: CanvasInspectorUpdate,
): Pick<CanvasInspectorModel, "isAspectRatioLocked" | "setAspectRatioLock"> {
  const isAspectRatioLocked = target ? lockedAspectRatio(target) !== null : false;
  const setAspectRatioLock = useCallback(
    (locked: boolean) => {
      if (!target) return;
      if (!locked) {
        if (target.layout?.aspectRatio) {
          const { aspectRatio: _aspectRatio, ...layout } = target.layout;
          update({ layout }, ["aspectRatio"]);
        } else {
          update({}, ["aspectRatio"]);
        }
        return;
      }

      const width = numericSizeValue(target.layout?.width ?? target.sizing?.width ?? target.width);
      const height = numericSizeValue(
        target.layout?.height ?? target.sizing?.height ?? target.height,
      );
      if (width === null || height === null || width <= 0 || height <= 0) return;
      const aspectRatio = { ratio: width / height, driver: "width" as const };
      if (target.layout) {
        update({ layout: { ...target.layout, aspectRatio } }, ["aspectRatio"]);
      }
    },
    [target, update],
  );

  return { isAspectRatioLocked, setAspectRatioLock };
}

export function useCanvasInspectorModel({
  focused,
  artboards,
  selection,
  variables = EMPTY_VARIABLES,
  inspectorPreview = null,
  onUpdateElement,
  onUpdateElements,
}: CanvasInspectorProps): CanvasInspectorModel | null {
  const elements = useMemo(() => {
    if (!focused || selection.artId !== focused.artId) return [];
    return selection.elementIds.flatMap((id) => {
      const element = findCanvasElement(focused.canvas.root, id);
      return element ? [element] : [];
    });
  }, [focused, selection.artId, selection.elementIds]);
  const target = useMemo(
    () =>
      elements[0] ?? (focused && selection.artId === focused.artId ? focused.canvas.root : null),
    [elements, focused, selection.artId],
  );
  const selected = useMemo(
    () => (elements.length > 0 ? elements : target ? [target] : []),
    [elements, target],
  );
  const fontFamilies = useMemo(() => collectFontFamilies(artboards), [artboards]);
  const common = useCallback((property: string) => commonValue(selected, property), [selected]);
  const update = useCallback<CanvasInspectorUpdate>(
    (properties, unset = []) =>
      applyInspectorUpdate(
        focused,
        elements,
        target,
        onUpdateElement,
        onUpdateElements,
        properties,
        unset,
      ),
    [elements, focused, onUpdateElement, onUpdateElements, target],
  );
  const text = useCallback(
    (property: string, fallback = "") => {
      const value = common(property);
      return value === undefined ? fallback : String(value ?? "");
    },
    [common],
  );
  const parentInfo = target && focused ? canvasElementParent(focused.canvas.root, target.id) : null;
  const parent =
    parentInfo && focused ? findCanvasElement(focused.canvas.root, parentInfo.parentId) : null;
  const absolute =
    !parent ||
    parent.type !== "frame" ||
    (parent.layoutMode !== "auto" && parent.autoLayout !== true);
  const aspectRatioLock = useAspectRatioLock(target, update);

  return useMemo(
    () =>
      target
        ? {
            focused,
            target,
            elements,
            selected,
            variables,
            fontFamilies,
            inspectorPreview,
            absolute,
            common,
            update,
            text,
            ...aspectRatioLock,
          }
        : null,
    [
      absolute,
      aspectRatioLock,
      common,
      fontFamilies,
      elements,
      focused,
      inspectorPreview,
      selected,
      target,
      text,
      update,
      variables,
    ],
  );
}
