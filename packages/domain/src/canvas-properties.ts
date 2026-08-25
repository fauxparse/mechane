import { DEVICE_SOURCE_HANDLES } from "./graph";
import type { Canvas, Element, ElementKind } from "./canvas";
import { deviceQrImageValue } from "./device-qr";
import {
  coercePropertyValue,
  defaultPropertyValue,
  isPropertyConnection,
  propertyCoercion,
  typeAtPath,
  valueAtPath,
} from "./property-values";
import { isImageAssetReference } from "./shapes";
import type { SceneVariable, ShowGraph } from "./graph";
import type { ImageAssetReference, ResolvedImageValue, Shape, ShapeValue, Type } from "./shapes";
import type { VariableReference } from "./property-values";

export type CanvasPropertyInputValue = ShapeValue | VariableReference;

function identityInput<T>(value: T): T {
  return value;
}

function isVariableReference(value: CanvasPropertyInputValue): value is VariableReference {
  return typeof value === "object" && value !== null && "id" in value && "name" in value;
}

function opacityInputValue(
  value: CanvasPropertyInputValue | null,
  transform: (value: number) => number,
): CanvasPropertyInputValue | null {
  if (value && isVariableReference(value)) {
    return {
      ...value,
      current:
        value.current?.kind === "number"
          ? { ...value.current, value: transform(value.current.value) }
          : value.current,
    };
  }
  return value?.kind === "number" ? { ...value, value: transform(value.value) } : value;
}
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
  readonly defaultValue: unknown;
  readonly unit?: "px" | "%";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly allowAuto?: boolean;
  readonly toInput: (value: CanvasPropertyInputValue | null) => CanvasPropertyInputValue | null;
  readonly fromInput: (value: unknown) => unknown;
}

const ALL_ELEMENTS: readonly ElementKind[] = ["rect", "ellipse", "text", "image", "frame"];

export const CANVAS_PROPERTY_DESCRIPTORS: readonly CanvasPropertyDescriptor[] = [
  {
    name: "opacity",
    targetType: "number",
    elementKinds: ALL_ELEMENTS,
    defaultValue: 1,
    unit: "%",
    min: 0,
    max: 100,
    step: 1,
    toInput: (value) => opacityInputValue(value, (input) => input * 100),
    fromInput: (value) => (typeof value === "number" ? value / 100 : value),
  },
  {
    name: "fill",
    targetType: "color",
    elementKinds: ALL_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "content",
    targetType: "text",
    elementKinds: ["text"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "color",
    targetType: "color",
    elementKinds: ["text"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "fontFamily",
    targetType: "text",
    elementKinds: ["text"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "fontSize",
    targetType: "number",
    elementKinds: ["text"],
    defaultValue: 16,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "cornerRadius",
    targetType: "number",
    elementKinds: ["rect", "image", "frame"],
    defaultValue: 0,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "lineHeight",
    targetType: "text",
    elementKinds: ["text"],
    defaultValue: "auto",
    allowAuto: true,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "image",
    targetType: "image",
    elementKinds: ["image"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "alt",
    targetType: "text",
    elementKinds: ["image"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "objectFit",
    targetType: "text",
    elementKinds: ["image"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "objectPosition",
    targetType: "text",
    elementKinds: ["image"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "textAlign",
    targetType: "text",
    elementKinds: ["text"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "textVerticalAlign",
    targetType: "text",
    elementKinds: ["text"],
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "letterSpacing",
    targetType: "number",
    elementKinds: ["text"],
    defaultValue: 0,
    toInput: identityInput,
    fromInput: identityInput,
  },
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
      const sourceType = variable?.type
        ? typeAtPath(variable.type, fieldPath, context.shapes ?? [])
        : null;
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
