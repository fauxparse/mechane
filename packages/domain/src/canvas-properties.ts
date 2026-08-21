import { DEVICE_SOURCE_HANDLES } from "./graph";
import type { Canvas, Element, ElementKind } from "./canvas";
import { deviceQrImageValue } from "./device-qr";
import {
  coercePropertyValue,
  defaultPropertyValue,
  isPropertyConnection,
  propertyCoercion,
} from "./property-values";
import { isImageAssetReference } from "./shapes";
import type { SceneVariable, ShowGraph } from "./graph";
import type { ImageAssetReference, ResolvedImageValue, Shape, Type } from "./shapes";
export type CanvasPropertyName =
  | "opacity"
  | "fill"
  | "content"
  | "color"
  | "fontFamily"
  | "fontSize"
  | "cornerRadius"
  | "image"
  | "alt"
  | "objectFit"
  | "objectPosition"
  | "textAlign"
  | "textVerticalAlign"
  | "lineHeight"
  | "letterSpacing";
export interface CanvasPropertyDescriptor {
  readonly name: CanvasPropertyName;
  readonly targetType: Type;
  readonly elementKinds: readonly ElementKind[];
}

const ALL_ELEMENTS: readonly ElementKind[] = ["rect", "ellipse", "text", "image", "frame"];

export const CANVAS_PROPERTY_DESCRIPTORS: readonly CanvasPropertyDescriptor[] = [
  { name: "opacity", targetType: "number", elementKinds: ALL_ELEMENTS },
  { name: "fill", targetType: "color", elementKinds: ALL_ELEMENTS },
  { name: "content", targetType: "text", elementKinds: ["text"] },
  { name: "color", targetType: "color", elementKinds: ["text"] },
  { name: "fontFamily", targetType: "text", elementKinds: ["text"] },
  { name: "fontSize", targetType: "number", elementKinds: ["text"] },
  { name: "lineHeight", targetType: "text", elementKinds: ["text"] },
  { name: "image", targetType: "image", elementKinds: ["image"] },
  { name: "alt", targetType: "text", elementKinds: ["image"] },
  { name: "objectFit", targetType: "text", elementKinds: ["image"] },
  { name: "objectPosition", targetType: "text", elementKinds: ["image"] },
  { name: "textAlign", targetType: "text", elementKinds: ["text"] },
  { name: "textVerticalAlign", targetType: "text", elementKinds: ["text"] },
  { name: "letterSpacing", targetType: "number", elementKinds: ["text"] },
];

export function canvasPropertyDescriptor(
  name: string,
  element: Element,
): CanvasPropertyDescriptor | null {
  const descriptor = CANVAS_PROPERTY_DESCRIPTORS.find(
    (candidate) => candidate.name === name && candidate.elementKinds.includes(element.type),
  );
  return descriptor ?? null;
}

function elementRecord(element: Element): Record<string, unknown> {
  return element as unknown as Record<string, unknown>;
}

export function canvasPropertyValue(element: Element, name: CanvasPropertyName): unknown {
  return elementRecord(element)[name];
}

export function canvasPropertyEdit(
  name: CanvasPropertyName,
  value: unknown,
): Record<string, unknown> {
  return { [name]: value };
}
/** The inspector exposes opacity as a whole-number percentage. Canvas stores a fraction. */
export function opacityToPercent(value: number): number {
  return value * 100;
}

export function opacityFromPercent(value: number): number {
  return value / 100;
}

export interface CanvasPropertyContext {
  readonly graph?: ShowGraph;
  readonly variables: readonly SceneVariable[];
  readonly values?: Readonly<Record<string, unknown>>;
  readonly shapes?: readonly Shape[];
  readonly imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
}

function rawValue(value: unknown): unknown {
  if (value && typeof value === "object" && "kind" in value && "value" in value) {
    return (value as { value: unknown }).value;
  }
  return value;
}

function defaultFor(targetType: Type): unknown {
  return rawValue(defaultPropertyValue(targetType));
}

function typeAtPath(type: Type, path: readonly string[], shapes: readonly Shape[]): Type | null {
  let current: Type = type;
  for (const fieldId of path) {
    if (typeof current !== "object") return null;
    const shapeId = Reflect.get(current, "shapeId");
    if (typeof shapeId !== "string") return null;
    const shape = shapes.find((candidate) => candidate.id === shapeId);
    const field = shape?.fields.find((candidate) => candidate.id === fieldId);
    if (!field) return null;
    current = field.type;
  }
  return current;
}

function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const fieldId of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current) || !(fieldId in current)) {
      return undefined;
    }
    current = Reflect.get(current, fieldId);
  }
  return current;
}
function deviceQrValueForVariable(
  variableId: string,
  graph: ShowGraph | undefined,
): (ResolvedImageValue & Pick<ImageAssetReference, "revision">) | undefined {
  if (!graph) return undefined;
  const edge = graph.edges.find(
    (candidate) =>
      candidate.kind === "wiring" &&
      candidate.targetPath[0] === variableId &&
      candidate.sourcePath[0] === DEVICE_SOURCE_HANDLES.qrCode,
  );
  if (!edge) return undefined;
  const device = graph.nodes.find((node) => node.id === edge.sourceId);
  if (device?.kind !== "device" || !device.pairingCode) return undefined;
  return deviceQrImageValue(device.id, device.pairingCode);
}

function resolveImageAsset(
  value: unknown,
  imageAssets: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[] | undefined,
): unknown {
  if (!isImageAssetReference(value)) return value;
  return (
    imageAssets?.find(
      (asset) => asset.assetId === value.assetId && asset.revision === value.revision,
    ) ?? value
  );
}

function resolveElement(element: Element, context: CanvasPropertyContext): Element {
  const next = {
    ...element,
    children: (element.children ?? []).map((child) => resolveElement(child, context)),
  } as Element;
  const record = elementRecord(next);
  for (const descriptor of CANVAS_PROPERTY_DESCRIPTORS) {
    if (!descriptor.elementKinds.includes(element.type)) continue;
    const value = record[descriptor.name];
    if (isPropertyConnection(value)) {
      const variable = context.variables.find((candidate) => candidate.id === value.variableId);
      const fieldPath = value.fieldPath ?? [];
      const sourceType = variable?.type ? typeAtPath(variable.type, fieldPath, context.shapes ?? []) : null;
      const coercion = sourceType ? propertyCoercion(sourceType, descriptor.targetType) : null;
      if (!variable || !sourceType || !coercion) {
        record[descriptor.name] = defaultFor(descriptor.targetType);
      } else {
        const sourceValue =
          deviceQrValueForVariable(variable.id, context.graph) ??
          valueAtPath(rawValue(context.values?.[variable.id]), fieldPath) ??
          defaultFor(sourceType);
        record[descriptor.name] = coercePropertyValue(sourceValue, coercion);
      }
    }
    if (descriptor.name === "image") {
      record.image = resolveImageAsset(record.image, context.imageAssets);
    }
  }
  return next;
}

export function resolveCanvasProperties(canvas: Canvas, context: CanvasPropertyContext): Canvas {
  return {
    ...canvas,
    root: resolveElement(canvas.root, context) as Extract<Canvas["root"], { type: "frame" }>,
  };
}
