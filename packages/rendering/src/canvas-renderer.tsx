import type { CSSProperties, ReactNode } from "react";
import { createElement } from "react";
import type {
  AnchorPosition,
  AspectRatioLock,
  AxisSize,
  Element,
  Fill,
  FrameElement,
  LayoutAlignment,
  Rotation,
  SizeValue,
} from "@mechane/domain";
import type { CanvasRendererProps } from "./canvas-render";

interface RenderElementOptions {
  element: Element;
  root?: boolean;
  sceneRoot?: boolean;
  parent?: FrameElement;
}

function sizeValue(value: SizeValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return `${value}px`;
  return `${value.value}${value.unit}`;
}

function sizeFor(element: Element, axis: "width" | "height"): AxisSize | undefined {
  return element.layout?.[axis] ?? element.sizing?.[axis] ?? element[axis];
}

function valueFor(
  element: Element,
  axis: "minWidth" | "maxWidth" | "minHeight" | "maxHeight",
): SizeValue | undefined {
  return element.layout?.[axis] ?? element.sizing?.[axis] ?? element[axis];
}

function rotationFor(element: Element): Rotation {
  return element.layout?.rotation ?? element.rotation ?? 0;
}

function ratioFor(element: Element): AspectRatioLock | undefined {
  return element.layout?.aspectRatio ?? element.aspectRatio;
}

function writingModeFor(rotation: Rotation): CSSProperties["writingMode"] {
  if (rotation === 90) return "vertical-rl";
  if (rotation === 270) return "vertical-lr";
  return "horizontal-tb";
}

function dimensionFor(
  element: Element,
  axis: "width" | "height",
  rotation: Rotation,
): string | undefined {
  const authored = sizeFor(element, axis);
  if (authored?.mode === "hug") return "max-content";
  if (authored?.mode === "fill") return "100%";
  if (rotation === 90 || rotation === 270) {
    const transposed = sizeFor(element, axis === "width" ? "height" : "width");
    if (transposed?.mode === "hug") return "max-content";
    if (transposed?.mode === "fill") return "100%";
    return sizeValue(transposed?.value);
  }
  return sizeValue(authored?.value);
}
function constraintFor(
  element: Element,
  axis: "minWidth" | "maxWidth" | "minHeight" | "maxHeight",
  rotation: Rotation,
): string | undefined {
  if (rotation !== 90 && rotation !== 270) return sizeValue(valueFor(element, axis));
  const transposed = axis.endsWith("Width")
    ? axis.replace("Width", "Height")
    : axis.replace("Height", "Width");
  return sizeValue(valueFor(element, transposed as typeof axis));
}

function paddingValue(padding: FrameElement["padding"]): string | undefined {
  if (padding === undefined) return undefined;
  if (typeof padding === "number") return `${padding}px`;
  return `${padding.top ?? 0}px ${padding.right ?? 0}px ${padding.bottom ?? 0}px ${padding.left ?? 0}px`;
}

function cssFill(fill: Fill | undefined): string | undefined {
  if (fill === undefined) return undefined;
  if (typeof fill === "string") return fill;
  const stops = fill.stops
    .map(
      (stop) =>
        `${stop.color ?? stop.colour ?? "transparent"} ${Math.max(0, Math.min(1, stop.position)) * 100}%`,
    )
    .join(", ");
  const kind = fill.kind ?? fill.type ?? "linear";
  return kind === "radial"
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${fill.angle ?? 0}deg, ${stops})`;
}

function sortedChildren(children: readonly Element[] | undefined): readonly Element[] {
  if (!children || children.length < 2) return children ?? [];
  return [...children].sort((a, b) => (a.rank ?? "").localeCompare(b.rank ?? ""));
}

function justify(value: LayoutAlignment | undefined): CSSProperties["justifyContent"] {
  if (value === "center" || value === "centre") return "center";
  if (value === "end") return "flex-end";
  if (value === "space-between") return "space-between";
  if (value === "space-around") return "space-around";
  if (value === "space-evenly") return "space-evenly";
  return "flex-start";
}

function align(value: LayoutAlignment | undefined): CSSProperties["alignItems"] {
  if (value === "center" || value === "centre") return "center";
  if (value === "end") return "flex-end";
  if (value === "space-between") return "space-between";
  if (value === "space-around") return "space-around";
  if (value === "space-evenly") return "space-evenly";
  return "flex-start";
}

function anchorStyles(anchor: AnchorPosition | undefined): CSSProperties {
  if (!anchor) return {};
  const horizontal = anchor.horizontal ?? "left";
  const vertical = anchor.vertical ?? "top";
  const horizontalCenter = horizontal === "center" || horizontal === "centre";
  const verticalCenter = vertical === "center" || vertical === "centre";
  return {
    position: "relative",
    justifySelf: horizontalCenter ? "center" : horizontal === "right" ? "end" : "start",
    alignSelf: verticalCenter ? "center" : vertical === "bottom" ? "end" : "start",
    left: horizontal === "left" || horizontalCenter ? `${anchor.offsetX ?? 0}px` : undefined,
    right: horizontal === "right" ? `${anchor.offsetX ?? 0}px` : undefined,
    top: vertical === "top" || verticalCenter ? `${anchor.offsetY ?? 0}px` : undefined,
    bottom: vertical === "bottom" ? `${anchor.offsetY ?? 0}px` : undefined,
  };
}
function elementStyle(element: Element, root: boolean, sceneRoot: boolean): CSSProperties {
  const rotation = root ? 0 : rotationFor(element);
  const ratio = ratioFor(element);
  const physicalRatio =
    ratio && (rotation === 90 || rotation === 270) ? 1 / ratio.ratio : ratio?.ratio;
  const style: CSSProperties = {
    boxSizing: "border-box",
    width: root && sceneRoot ? "100%" : dimensionFor(element, "width", rotation),
    height: root && sceneRoot ? "100%" : dimensionFor(element, "height", rotation),
    minWidth: root ? undefined : constraintFor(element, "minWidth", rotation),
    maxWidth: root ? undefined : constraintFor(element, "maxWidth", rotation),
    minHeight: root ? undefined : constraintFor(element, "minHeight", rotation),
    maxHeight: root ? undefined : constraintFor(element, "maxHeight", rotation),
    aspectRatio: physicalRatio,
    opacity: element.opacity,
    mixBlendMode: element.blendMode,
    background: cssFill(element.fill),
    writingMode: writingModeFor(rotation),
    display: element.type === "image" ? "block" : undefined,
    alignSelf: element.alignSelf ? align(element.alignSelf) : undefined,
    visibility: element.hidden ? "hidden" : undefined,
  };
  if (sizeFor(element, "width")?.mode === "fill") style.flexGrow = 1;
  if (sizeFor(element, "height")?.mode === "fill") style.flexGrow = 1;
  if (rotation === 180) style.transform = "rotate(180deg)";
  if (rotation === 90 || rotation === 270) style.textOrientation = "sideways";
  return style;
}

function frameStyle(frame: FrameElement): CSSProperties {
  const auto = frame.layoutMode === "auto" || frame.mode === "auto" || frame.autoLayout === true;
  if (auto) {
    return {
      display: "flex",
      flexDirection: (frame.direction ?? "vertical") === "horizontal" ? "row" : "column",
      gap: `${frame.gap ?? 0}px`,
      padding: paddingValue(frame.padding),
      justifyContent: justify(frame.alignPrimary ?? frame.primaryAlign),
      alignItems: align(frame.alignCounter ?? frame.counterAlign),
      overflow: frame.clip ? "hidden" : "visible",
    };
  }
  return {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "minmax(0, 1fr)",
    padding: paddingValue(frame.padding),
    overflow: frame.clip ? "hidden" : "visible",
  };
}

function contentFor(element: Element): ReactNode {
  if (element.type !== "text") return undefined;
  return element.content ?? element.text ?? element.value ?? "";
}

function typeStyle(element: Element): CSSProperties {
  if (element.type === "rect") {
    return {
      borderRadius: element.cornerRadius === undefined ? undefined : `${element.cornerRadius}px`,
    };
  }
  if (element.type === "text") {
    return {
      color: element.color,
      fontFamily: element.fontFamily,
      fontSize: element.fontSize === undefined ? undefined : `${element.fontSize}px`,
      fontWeight: element.fontWeight,
      lineHeight: element.lineHeight,
      letterSpacing: element.letterSpacing === undefined ? undefined : `${element.letterSpacing}px`,
      textAlign: element.textAlign,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    };
  }
  if (element.type === "image") return { objectFit: element.objectFit ?? "fill" };
  return {};
}

function renderElement({
  element,
  root = false,
  sceneRoot = false,
  parent,
}: RenderElementOptions): ReactNode {
  const parentIsAuto =
    parent?.layoutMode === "auto" || parent?.mode === "auto" || parent?.autoLayout === true;
  const style = {
    ...elementStyle(element, root, sceneRoot),
    ...(element.type === "frame" ? frameStyle(element) : {}),
    ...typeStyle(element),
    ...(parent && !parentIsAuto ? { gridArea: "1 / 1", ...anchorStyles(element.anchor) } : {}),
    ...(root ? { isolation: "isolate", ...(sceneRoot ? { overflow: "hidden" } : {}) } : {}),
  };
  const children =
    element.type === "frame"
      ? sortedChildren(element.children).map((child) =>
          createElement(ElementRenderer, {
            key: child.id,
            element: child,
            parent: element,
          }),
        )
      : undefined;

  if (element.type === "image") {
    return createElement("img", {
      "data-element-id": element.id,
      "data-element-type": element.type,
      "data-element-parent-id": parent?.id,
      "data-element-rank": element.rank,
      "data-element-painted": "true",
      src: element.src ?? element.image ?? element.source,
      alt: element.alt ?? "",
      style,
      hidden: element.hidden,
    });
  }
  return createElement(
    "div",
    {
      "data-element-id": element.id,
      "data-element-type": element.type,
      "data-element-name": element.name ?? undefined,
      "data-element-parent-id": parent?.id,
      "data-element-rank": element.rank,
      // Editors hit-test against this: the root frame is the artboard backdrop, never a target.
      "data-element-root": root ? "true" : undefined,
      "data-element-painted":
        element.type === "text" || element.fill !== undefined ? "true" : "false",
      style,
      hidden: element.hidden,
    },
    element.type === "text" ? contentFor(element) : children,
  );
}

export function ElementRenderer({
  element,
  parent,
}: {
  element: Element;
  parent?: FrameElement;
}): ReactNode {
  return <>{renderElement({ element, parent })}</>;
}

export function CanvasRenderer({ canvas, className, style }: CanvasRendererProps): ReactNode {
  const root = "root" in canvas ? canvas.root : canvas;
  const sceneRoot = "root" in canvas && canvas.kind === "scene";
  return createElement(
    "div",
    {
      className,
      style: { position: "relative", width: "100%", height: "100%", ...style },
      "data-canvas-root": root.id,
      "data-canvas-kind": "root" in canvas ? canvas.kind : undefined,
    },
    renderElement({ element: root, root: true, sceneRoot }),
  );
}
