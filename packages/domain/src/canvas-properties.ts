import type { Element, ElementKind } from "./canvas";
import type { ShapeValue, Type } from "./shapes";
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
