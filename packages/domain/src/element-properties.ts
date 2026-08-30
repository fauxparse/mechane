import type {
  Canvas,
  Element,
  ElementKind,
  GradientFill,
  ResolvedCanvas,
  ResolvedElement,
} from "./canvas";
import { DEVICE_SOURCE_HANDLES } from "./graph";
import type { SceneVariable, ShowGraph } from "./graph";
import { deviceQrImageValue } from "./device-qr";
import {
  coercePropertyValue,
  defaultPropertyValue,
  isPropertyConnection,
  propertyCoercion,
  typeAtPath,
  valueAtPath,
} from "./property-values";
import { defaultValueForType } from "./source-defaults";
import {
  conformsToType,
  isImageAssetReference,
  type ImageAssetReference,
  type ResolvedImageValue,
  type Shape,
  type ShapeValue,
  type Type,
} from "./shapes";
import type { VariableReference } from "./property-values";

export type ElementPropertyInputValue = ShapeValue | VariableReference;

export type ElementPropertyKey =
  | "layout"
  | "sizing"
  | "opacity"
  | "blendMode"
  | "alignSelf"
  | "fill"
  | "stroke"
  | "anchor"
  | "cornerRadius"
  | "content"
  | "color"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontStyle"
  | "textDecoration"
  | "lineHeight"
  | "letterSpacing"
  | "textAlign"
  | "textVerticalAlign"
  | "textOverflow"
  | "padding"
  | "image"
  | "alt"
  | "objectFit"
  | "objectPosition"
  | "layoutMode"
  | "direction"
  | "gap"
  | "alignPrimary"
  | "alignCounter"
  | "clip"
  | "hidden";

export const ELEMENT_PROPERTY_KEYS: readonly ElementPropertyKey[] = [
  "layout",
  "sizing",
  "opacity",
  "blendMode",
  "alignSelf",
  "fill",
  "stroke",
  "anchor",
  "cornerRadius",
  "content",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textVerticalAlign",
  "textOverflow",
  "padding",
  "image",
  "alt",
  "objectFit",
  "objectPosition",
  "layoutMode",
  "direction",
  "gap",
  "alignPrimary",
  "alignCounter",
  "clip",
  "hidden",
];

export type ElementPropertyName =
  | "opacity"
  | "fill"
  | "content"
  | "color"
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "fontStyle"
  | "textDecoration"
  | "lineHeight"
  | "letterSpacing"
  | "textAlign"
  | "textVerticalAlign"
  | "cornerRadius"
  | "image"
  | "alt"
  | "objectFit"
  | "objectPosition";

export interface ElementPropertyDescriptor {
  readonly name: ElementPropertyName;
  readonly targetType: Type;
  readonly elementKinds: readonly ElementKind[];
  readonly defaultValue: unknown;
  readonly unit?: "px" | "%";
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly allowAuto?: boolean;
  readonly toInput: (value: ElementPropertyInputValue | null) => ElementPropertyInputValue | null;
  readonly fromInput: (value: unknown) => unknown;
}

const PAINTABLE_ELEMENTS: readonly ElementKind[] = ["rect", "ellipse", "text", "image", "frame"];
const TEXT_ELEMENTS: readonly ElementKind[] = ["text"];
const IMAGE_ELEMENTS: readonly ElementKind[] = ["image"];
const CORNER_RADIUS_ELEMENTS: readonly ElementKind[] = ["rect", "image", "frame"];
const SHAPE_VALUE_KINDS = new Set([
  "array",
  "boolean",
  "color",
  "date",
  "datetime",
  "image",
  "number",
  "text",
]);
function identityInput<T>(value: T): T {
  return value;
}

function isVariableReference(value: ElementPropertyInputValue): value is VariableReference {
  return typeof value === "object" && value !== null && "id" in value && "name" in value;
}

function opacityInputValue(
  value: ElementPropertyInputValue | null,
  transform: (value: number) => number,
): ElementPropertyInputValue | null {
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

export const ELEMENT_PROPERTY_DESCRIPTORS: readonly ElementPropertyDescriptor[] = [
  {
    name: "opacity",
    targetType: "number",
    elementKinds: PAINTABLE_ELEMENTS,
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
    elementKinds: PAINTABLE_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "content",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "color",
    targetType: "color",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "fontFamily",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "fontSize",
    targetType: "number",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: 16,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "fontWeight",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "fontStyle",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "textDecoration",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "lineHeight",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: "auto",
    allowAuto: true,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "letterSpacing",
    targetType: "number",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: 0,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "textAlign",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "textVerticalAlign",
    targetType: "text",
    elementKinds: TEXT_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "cornerRadius",
    targetType: "number",
    elementKinds: CORNER_RADIUS_ELEMENTS,
    defaultValue: 0,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "image",
    targetType: "image",
    elementKinds: IMAGE_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "alt",
    targetType: "text",
    elementKinds: IMAGE_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "objectFit",
    targetType: "text",
    elementKinds: IMAGE_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
  {
    name: "objectPosition",
    targetType: "text",
    elementKinds: IMAGE_ELEMENTS,
    defaultValue: undefined,
    toInput: identityInput,
    fromInput: identityInput,
  },
];

const DESCRIPTORS_BY_NAME = new Map<string, ElementPropertyDescriptor>(
  ELEMENT_PROPERTY_DESCRIPTORS.map((descriptor) => [descriptor.name, descriptor]),
);
const ELEMENT_PROPERTY_KEY_SET = new Set<string>(ELEMENT_PROPERTY_KEYS);

export function isElementPropertyKey(value: string): value is ElementPropertyKey {
  return ELEMENT_PROPERTY_KEY_SET.has(value);
}

export function elementPropertyDescriptor(
  name: string,
  element: Element | ElementKind,
): ElementPropertyDescriptor | null {
  const kind = typeof element === "string" ? element : element.type;
  const descriptor = DESCRIPTORS_BY_NAME.get(name);
  return descriptor?.elementKinds.includes(kind) ? descriptor : null;
}

export function elementPropertyType(name: string, element: Element | ElementKind): Type | null {
  return elementPropertyDescriptor(name, element)?.targetType ?? null;
}

function rawValue(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "kind" in value &&
    typeof Reflect.get(value, "kind") === "string" &&
    SHAPE_VALUE_KINDS.has(Reflect.get(value, "kind") as string) &&
    "value" in value
  ) {
    return Reflect.get(value, "value");
  }
  return value;
}

function isGradientFill(value: unknown): value is GradientFill {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "stops" in value &&
    Array.isArray(value.stops)
  );
}

function defaultAtPath(type: Type, path: readonly string[], shapes: readonly Shape[]): unknown {
  const value = defaultValueForType(type, shapes);
  return path.length === 0 ? value : valueAtPath(value, path);
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

export interface ElementPropertyResolutionContext {
  readonly graph?: ShowGraph;
  readonly variables: readonly SceneVariable[];
  readonly values?: Readonly<Record<string, unknown>>;
  readonly shapes?: readonly Shape[];
  readonly imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
}

function resolveConnection(
  connection: { readonly variableId: string; readonly fieldPath?: readonly string[] },
  targetType: Type,
  context: ElementPropertyResolutionContext,
): unknown {
  const shapes = context.shapes ?? [];
  const variable = context.variables.find((candidate) => candidate.id === connection.variableId);
  const fieldPath = connection.fieldPath ?? [];
  const variableType = variable?.type;
  if (!variable || !variableType) return rawValue(defaultPropertyValue(targetType));

  const sourceType = typeAtPath(variableType, fieldPath, shapes);
  if (!sourceType) return rawValue(defaultPropertyValue(targetType));

  const coercion = propertyCoercion(sourceType, targetType);
  if (!coercion) return rawValue(defaultPropertyValue(targetType));

  const qrValue =
    fieldPath.length === 0 ? deviceQrValueForVariable(variable.id, context.graph) : undefined;
  const supplied = qrValue ?? valueAtPath(rawValue(context.values?.[variable.id]), fieldPath);
  const variableDefault =
    variable.defaultValue === undefined ? undefined : valueAtPath(variable.defaultValue, fieldPath);
  const fallback = variableDefault ?? defaultAtPath(variableType, fieldPath, shapes);
  const candidate = rawValue(supplied ?? fallback);
  const sourceValue = conformsToType(candidate, sourceType, shapes)
    ? candidate
    : rawValue(defaultAtPath(variableType, fieldPath, shapes));
  if (!conformsToType(sourceValue, sourceType, shapes)) {
    return rawValue(defaultPropertyValue(targetType));
  }
  return coercePropertyValue(sourceValue, coercion);
}

function resolveElementProperty(
  element: ResolvedElement,
  descriptor: ElementPropertyDescriptor,
  context: ElementPropertyResolutionContext,
): void {
  const record = element as unknown as Record<string, unknown>;
  const value = record[descriptor.name];
  if (isPropertyConnection(value)) {
    record[descriptor.name] = resolveConnection(value, descriptor.targetType, context);
  }
  if (descriptor.name === "image") {
    record.image = resolveImageAsset(record.image, context.imageAssets);
  }
}

function resolveSizing(element: ResolvedElement, context: ElementPropertyResolutionContext): void {
  if (!element.sizing) return;
  const sizing = { ...element.sizing };
  for (const axis of ["width", "height"] as const) {
    const size = sizing[axis];
    if (size?.value && isPropertyConnection(size.value)) {
      sizing[axis] = {
        ...size,
        value: resolveConnection(size.value, "number", context) as number,
      };
    }
  }
  for (const axis of ["minWidth", "maxWidth", "minHeight", "maxHeight"] as const) {
    const value = sizing[axis];
    if (isPropertyConnection(value)) {
      sizing[axis] = resolveConnection(value, "number", context) as never;
    }
  }
  (element as unknown as Record<string, unknown>).sizing = sizing;
}

function resolveElement(
  element: Element,
  context: ElementPropertyResolutionContext,
): ResolvedElement {
  const next = {
    ...element,
    children: (element.children ?? []).map((child) => resolveElement(child, context)),
  } as ResolvedElement;
  for (const descriptor of ELEMENT_PROPERTY_DESCRIPTORS) {
    if (descriptor.elementKinds.includes(element.type))
      resolveElementProperty(next, descriptor, context);
  }
  resolveSizing(next, context);
  return next;
}

export class InvalidElementPropertyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidElementPropertyError";
  }
}

export function assertElementPropertyConnections(element: Element): void {
  const record = element as unknown as Record<string, unknown>;
  for (const [name, value] of Object.entries(record)) {
    if (!isPropertyConnection(value)) continue;
    if (!elementPropertyDescriptor(name, element)) {
      throw new InvalidElementPropertyError(
        `${element.id} has an invalid Property Connection for "${name}".`,
      );
    }
  }
}

export function assertValidElementProperties(element: Element): Element {
  assertElementPropertyConnections(element);

  const record = element as unknown as Record<string, unknown>;
  const layout = element.layout;
  if (layout?.rotation !== undefined && ![0, 90, 180, 270].includes(layout.rotation)) {
    throw new InvalidElementPropertyError(`${element.id} has an invalid rotation.`);
  }
  if (
    layout?.aspectRatio &&
    (!Number.isFinite(layout.aspectRatio.ratio) || layout.aspectRatio.ratio <= 0)
  ) {
    throw new InvalidElementPropertyError(`${element.id} has an invalid aspect ratio.`);
  }
  const opacity = record.opacity;
  if (typeof opacity === "number" && (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)) {
    throw new InvalidElementPropertyError(`${element.id} opacity must be between 0 and 1.`);
  }
  const fill = record.fill;
  if (isGradientFill(fill)) {
    if (fill.kind !== "linear" && fill.kind !== "radial") {
      throw new InvalidElementPropertyError(`${element.id} has an unknown gradient kind.`);
    }
    if (fill.stops.length < 2) {
      throw new InvalidElementPropertyError(`${element.id} gradients require at least two stops.`);
    }
    let previous = -Infinity;
    for (const stop of fill.stops) {
      if (
        !stop.color ||
        !Number.isFinite(stop.position) ||
        stop.position < 0 ||
        stop.position > 1 ||
        stop.position < previous
      ) {
        throw new InvalidElementPropertyError(`${element.id} has invalid gradient stops.`);
      }
      previous = stop.position;
    }
  }
  return element;
}

/** Resolves every Property Connection into a renderer-safe, detached Canvas value. */
export function resolveCanvasProperties(
  canvas: Canvas,
  context: ElementPropertyResolutionContext,
): ResolvedCanvas {
  return {
    ...canvas,
    root: resolveElement(canvas.root, context) as ResolvedCanvas["root"],
  };
}
