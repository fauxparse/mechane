import type { Canvas, Element, ResolvedCanvas, ResolvedElement } from "./canvas";
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
  type Type,
} from "./shapes";

export interface CanvasPropertyResolutionContext {
  readonly graph?: ShowGraph;
  readonly variables: readonly SceneVariable[];
  readonly values?: Readonly<Record<string, unknown>>;
  readonly shapes?: readonly Shape[];
  readonly imageAssets?: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
}

const CONNECTION_TARGET_TYPES: Readonly<Record<string, Type>> = {
  content: "text",
  text: "text",
  value: "text",
  color: "color",
  fontFamily: "text",
  fontWeight: "text",
  fontStyle: "text",
  textDecoration: "text",
  lineHeight: "text",
  textAlign: "text",
  textVerticalAlign: "text",
  letterSpacing: "number",
  fontSize: "number",
  cornerRadius: "number",
  opacity: "number",
  fill: "color",
  image: "image",
  alt: "text",
  objectFit: "text",
  objectPosition: "text",
};

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

function resolveConnection(
  connection: { readonly variableId: string; readonly fieldPath?: readonly string[] },
  targetType: Type,
  context: CanvasPropertyResolutionContext,
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
  const fallback = defaultAtPath(variableType, fieldPath, shapes);
  const candidate = rawValue(supplied ?? fallback);
  const sourceValue = conformsToType(candidate, sourceType, shapes)
    ? candidate
    : rawValue(fallback);
  if (!conformsToType(sourceValue, sourceType, shapes)) {
    return rawValue(defaultPropertyValue(targetType));
  }
  return coercePropertyValue(sourceValue, coercion);
}

function resolveProperty(
  property: string,
  value: unknown,
  context: CanvasPropertyResolutionContext,
): unknown {
  if (!isPropertyConnection(value)) return value;
  const targetType = CONNECTION_TARGET_TYPES[property];
  return targetType ? resolveConnection(value, targetType, context) : undefined;
}

function resolveElement(element: Element, context: CanvasPropertyResolutionContext): ResolvedElement {
  const next = {
    ...element,
    children: (element.children ?? []).map((child) => resolveElement(child, context)),
  } as ResolvedElement;
  const record = next as unknown as Record<string, unknown>;

  for (const property of Object.keys(CONNECTION_TARGET_TYPES)) {
    if (property in record) record[property] = resolveProperty(property, record[property], context);
  }

  if (next.sizing) {
    const sizing = { ...next.sizing };
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
    record.sizing = sizing;
  }

  if (next.type === "image") record.image = resolveImageAsset(record.image, context.imageAssets);
  return next;
}

/** Resolves every Property Connection into a renderer-safe, detached Canvas value. */
export function resolveCanvasProperties(
  canvas: Canvas,
  context: CanvasPropertyResolutionContext,
): ResolvedCanvas {
  return {
    ...canvas,
    root: resolveElement(canvas.root, context) as ResolvedCanvas["root"],
  };
}
