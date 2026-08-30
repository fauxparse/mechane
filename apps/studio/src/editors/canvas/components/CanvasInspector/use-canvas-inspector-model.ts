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
const EMPTY_IMAGE_ASSETS = [] as const;
const EMPTY_DEVICE_QR_IMAGES = {} as const;
const EMPTY_BLOCKS = [] as const;
const EMPTY_SHAPES = [] as const;

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (isPropertyConnection(left) || isPropertyConnection(right)) {
    return (
      isPropertyConnection(left) &&
      isPropertyConnection(right) &&
      left.variableId === right.variableId &&
      JSON.stringify(left.fieldPath ?? []) === JSON.stringify(right.fieldPath ?? [])
    );
  }
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        sameValue(Reflect.get(left, key), Reflect.get(right, key)),
    )
  );
}

function propertyValue(element: Element, property: string): unknown {
  return property.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return Reflect.get(value, key);
  }, element);
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
  selected: readonly Element[],
  update: CanvasInspectorUpdate,
): Pick<CanvasInspectorModel, "isAspectRatioLocked" | "setAspectRatioLock"> {
  const target = selected[0];
  const isAspectRatioLocked =
    selected.length > 0 && selected.every((element) => lockedAspectRatio(element) !== null);
  const setAspectRatioLock = useCallback(
    (locked: boolean) => {
      if (!target) return;
      if (!locked) {
        if (!target.layout?.aspectRatio) return;
        const { aspectRatio: _aspectRatio, ...layout } = target.layout;
        if (Object.keys(layout).length > 0) update({ layout });
        else update({}, ["layout"]);
        return;
      }

      const width = numericSizeValue(target.sizing?.width);
      const height = numericSizeValue(target.sizing?.height);
      if (width === null || height === null || width <= 0 || height <= 0) return;
      const aspectRatio = { ratio: width / height, driver: "width" as const };
      update({ layout: { ...target.layout, aspectRatio } });
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
  blocks = EMPTY_BLOCKS,
  shapes = EMPTY_SHAPES,
  imageAssets = EMPTY_IMAGE_ASSETS,
  deviceQrImages = EMPTY_DEVICE_QR_IMAGES,
  onImageUpload,
  inspectorPreview = null,
  currentDimensions = null,
  blockVariableEditing,
  onRenameArtboard,
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
  const target = useMemo(() => {
    if (elements[0]) return elements[0];
    if (!focused || selection.artId !== focused.artId) return null;
    return focused.canvas.root;
  }, [elements, focused, selection.artId]);
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
  const absolute = !parent || parent.type !== "frame" || parent.layoutMode !== "auto";
  const aspectRatioLock = useAspectRatioLock(selected, update);

  return useMemo(
    () =>
      target
        ? {
            focused,
            target,
            elements,
            selected,
            blocks,
            variables,
            shapes,
            deviceQrImages,
            imageAssets,
            onImageUpload,
            onRenameArtboard,
            blockVariableEditing,
            fontFamilies,
            inspectorPreview,
            currentDimensions,
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
      deviceQrImages,
      elements,
      fontFamilies,
      onRenameArtboard,
      imageAssets,
      onImageUpload,
      currentDimensions,
      inspectorPreview,
      selected,
      focused,
      target,
      text,
      update,
      blocks,
      variables,
      shapes,
      blockVariableEditing,
    ],
  );
}
