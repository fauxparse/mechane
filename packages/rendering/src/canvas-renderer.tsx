import { memo } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { createElement } from "react";
import type {
  AnchorPosition,
  AspectRatioLock,
  AxisSize,
  CornerRadiusElement,
  Fill,
  FrameElement,
  LayoutAlignment,
  PropertyConnection,
  ResolvedCanvasValue,
  ResolvedElement,
  Rotation,
  SizeValue,
  Stroke,
} from "@mechane/domain";
import { isPropertyConnection } from "@mechane/domain";
import type { CanvasRendererProps } from "./canvas-render";

type LayoutParent = Extract<ResolvedElement, { type: "frame" | "slot" }>;
function literal<T>(value: T | PropertyConnection | undefined): T | undefined {
  return isPropertyConnection(value) ? undefined : (value as T | undefined);
}
interface RenderElementOptions {
  element: ResolvedElement;
  root?: boolean;
  sceneRoot?: boolean;
  parent?: LayoutParent;
  blocks?: CanvasRendererProps["blocks"];
  mode?: CanvasRendererProps["mode"];
  editingElementId?: string | null;
  imageLoading?: "eager" | "lazy";
  onImageError?: (elementId: string, url: string, event: unknown) => void;
  onTextDoubleClick?: (elementId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onTextKeyDown?: (elementId: string, event: ReactKeyboardEvent<HTMLDivElement>) => void;
}
function sizeValue(
  value: ResolvedCanvasValue<SizeValue> | PropertyConnection | undefined,
): string | undefined {
  if (value === undefined || isPropertyConnection(value)) return undefined;
  if (typeof value === "number") return `${value}px`;
  return `${value.value}${value.unit}`;
}

function sizeFor(
  element: ResolvedElement,
  axis: "width" | "height",
): ResolvedCanvasValue<AxisSize> | undefined {
  return element.sizing?.[axis];
}

function valueFor(
  element: ResolvedElement,
  axis: "minWidth" | "maxWidth" | "minHeight" | "maxHeight",
): ResolvedCanvasValue<SizeValue> | undefined {
  return element.sizing?.[axis];
}

function rotationFor(element: ResolvedElement): Rotation {
  return element.layout?.rotation ?? element.rotation ?? 0;
}

function ratioFor(element: ResolvedElement): AspectRatioLock | undefined {
  return element.layout?.aspectRatio ?? element.aspectRatio;
}

function writingModeFor(rotation: Rotation): CSSProperties["writingMode"] {
  if (rotation === 90) return "vertical-rl";
  if (rotation === 270) return "vertical-lr";
  return "horizontal-tb";
}

function dimensionFor(
  element: ResolvedElement,
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
  element: ResolvedElement,
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
  return `${padding.top ?? 0}px ${padding.right ?? 0}px ${padding.bottom ?? 0}px ${
    padding.left ?? 0
  }px`;
}

function cornerRadiusValue(radius: CornerRadiusElement["cornerRadius"]): string | undefined {
  const value = literal(radius);
  if (value === undefined) return undefined;
  if (typeof value === "number") return `${value}px`;
  return `${value.topLeft ?? 0}px ${value.topRight ?? 0}px ${value.bottomRight ?? 0}px ${
    value.bottomLeft ?? 0
  }px`;
}

function cssFill(fill: Fill | undefined): string | undefined {
  if (fill === undefined) return undefined;
  if (typeof fill === "string") return fill;
  const stops = fill.stops
    .map(
      (stop) => `${stop.color ?? "transparent"} ${Math.max(0, Math.min(1, stop.position)) * 100}%`,
    )
    .join(", ");
  const kind = fill.kind ?? fill.type ?? "linear";
  return kind === "radial"
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${fill.angle ?? 0}deg, ${stops})`;
}
function fillStyles(fill: Fill | undefined): CSSProperties {
  if (fill === undefined || isPropertyConnection(fill)) return {};
  return typeof fill === "string" ? { backgroundColor: fill } : { backgroundImage: cssFill(fill) };
}
function strokeStyles(stroke: Stroke | PropertyConnection | undefined): CSSProperties {
  if (!stroke || isPropertyConnection(stroke)) return {};
  return {
    borderColor: stroke.color,
    borderStyle: stroke.style,
    borderWidth: `${Math.max(0, stroke.width)}px`,
  };
}

function sortedChildren(
  children: readonly ResolvedElement[] | undefined,
): readonly ResolvedElement[] {
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
function elementStyle(element: ResolvedElement, root: boolean, sceneRoot: boolean): CSSProperties {
  const rotation = root ? 0 : rotationFor(element);
  const ratio = ratioFor(element);
  const physicalRatio =
    ratio && (rotation === 90 || rotation === 270) ? 1 / ratio.ratio : ratio?.ratio;
  const paint = element.type === "slot" ? undefined : element;
  const style: CSSProperties = {
    boxSizing: "border-box",
    width: root && sceneRoot ? "100%" : dimensionFor(element, "width", rotation),
    height: root && sceneRoot ? "100%" : dimensionFor(element, "height", rotation),
    minWidth: root ? undefined : constraintFor(element, "minWidth", rotation),
    maxWidth: root ? undefined : constraintFor(element, "maxWidth", rotation),
    minHeight: root ? undefined : constraintFor(element, "minHeight", rotation),
    maxHeight: root ? undefined : constraintFor(element, "maxHeight", rotation),
    aspectRatio: physicalRatio,
    opacity: literal(paint?.opacity),
    mixBlendMode: literal(paint?.blendMode),
    ...fillStyles(literal(paint?.fill)),
    backgroundClip: "border-box",
    backgroundOrigin: "border-box",
    ...strokeStyles(paint?.stroke),
    writingMode: writingModeFor(rotation),
    display: element.type === "image" ? "block" : undefined,
    alignSelf: element.alignSelf ? align(element.alignSelf) : undefined,
    visibility: element.hidden ? "hidden" : undefined,
  };
  if (rotation === 180) style.transform = "rotate(180deg)";
  if (rotation === 90 || rotation === 270) style.textOrientation = "sideways";
  return style;
}

function frameStyle(frame: LayoutParent): CSSProperties {
  const auto = frame.layoutMode === "auto" || frame.autoLayout === true;
  if (auto) {
    const automaticGap = frame.gap === "auto";
    return {
      display: "flex",
      flexDirection: (frame.direction ?? "vertical") === "horizontal" ? "row" : "column",
      gap: automaticGap ? "0px" : `${frame.gap ?? 0}px`,
      padding: paddingValue(frame.padding),
      justifyContent: automaticGap
        ? "space-between"
        : justify(frame.alignPrimary ?? frame.primaryAlign),
      alignItems: align(frame.alignCounter ?? frame.counterAlign),
      overflow: frame.clip ? "hidden" : "visible",
    };
  }
  return {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gridTemplateRows: "minmax(0, 1fr)",
    padding: paddingValue(frame.padding),
  };
}

function contentFor(element: ResolvedElement): ReactNode {
  if (element.type !== "text") return undefined;
  return literal(element.content) ?? literal(element.text) ?? literal(element.value) ?? "";
}

function typeStyle(element: ResolvedElement): CSSProperties {
  if (element.type === "image") {
    return {
      borderRadius: cornerRadiusValue(element.cornerRadius),
      objectFit: literal(element.objectFit) ?? "cover",
      objectPosition: literal(element.objectPosition) ?? "center",
    };
  }
  if (element.type === "rect" || element.type === "frame") {
    return { borderRadius: cornerRadiusValue(element.cornerRadius) };
  }
  if (element.type === "ellipse") return { borderRadius: "50%" };
  if (element.type === "text") {
    const fontSize = literal(element.fontSize);
    const lineHeight = literal(element.lineHeight);
    const textVerticalAlign = literal(element.textVerticalAlign) ?? "top";
    const textOverflow = element.textOverflow ?? "visible";
    const truncates = textOverflow === "ellipsis";
    const justifyContent =
      textVerticalAlign === "center"
        ? "center"
        : textVerticalAlign === "bottom"
          ? "flex-end"
          : "flex-start";
    const numericLineHeight =
      typeof lineHeight === "string" && lineHeight.trim() !== "" ? Number(lineHeight) : NaN;
    const lineHeightStyle =
      lineHeight === undefined || lineHeight === "auto"
        ? "normal"
        : typeof lineHeight === "number"
          ? `${lineHeight}px`
          : Number.isFinite(numericLineHeight)
            ? `${numericLineHeight}px`
            : lineHeight;
    const letterSpacing = literal(element.letterSpacing);
    return {
      color: literal(element.color),
      fontFamily: literal(element.fontFamily),
      fontSize: fontSize === undefined ? undefined : `${fontSize}px`,
      fontWeight: literal(element.fontWeight),
      display: "flex",
      flexDirection: "column",
      justifyContent,
      fontStyle: literal(element.fontStyle),
      lineHeight: lineHeightStyle,
      textDecoration: literal(element.textDecoration),
      letterSpacing: letterSpacing === undefined ? undefined : `${letterSpacing}px`,
      textAlign: literal(element.textAlign),
      padding: paddingValue(element.padding),
      userSelect: "none",
      overflow: textOverflow === "visible" ? "visible" : "hidden",
      textOverflow: truncates ? "ellipsis" : "clip",
      whiteSpace: truncates ? "nowrap" : "pre-wrap",
      overflowWrap: truncates ? "normal" : "anywhere",
    };
  }
  return {};
}

function renderElement({
  element,
  root = false,
  sceneRoot = false,
  parent,
  blocks,
  mode,
  editingElementId,
  imageLoading,
  onImageError,
  onTextDoubleClick,
  onTextKeyDown,
}: RenderElementOptions): ReactNode {
  const parentIsAuto = parent?.layoutMode === "auto" || parent?.autoLayout === true;
  const editing = element.type === "text" && element.id === editingElementId;
  const style = {
    ...elementStyle(element, root, sceneRoot),
    ...(element.type === "frame" || element.type === "slot" ? frameStyle(element) : {}),
    ...typeStyle(element),
    ...(editing ? { userSelect: "text" as const } : {}),
    ...(parent && !parentIsAuto ? { gridArea: "1 / 1", ...anchorStyles(element.anchor) } : {}),
    ...(parentIsAuto &&
    sizeFor(element, parent.direction === "horizontal" ? "width" : "height")?.mode === "fill"
      ? { flexGrow: 1 }
      : {}),
    ...(root ? { isolation: "isolate", ...(sceneRoot ? { overflow: "hidden" } : {}) } : {}),
  };
  const children =
    element.type === "frame"
      ? sortedChildren(element.children).map((child) =>
          createElement(ElementRenderer, {
            key: child.id,
            element: child,
            parent: element,
            blocks,
            mode,
            editingElementId,
            imageLoading,
            onImageError,
            onTextDoubleClick,
            onTextKeyDown,
          }),
        )
      : undefined;
  if (element.type === "slot") {
    const block = blocks?.find((candidate) => candidate.id === element.blockId);
    if (!block) {
      return createElement(
        "div",
        {
          "data-element-id": element.id,
          "data-element-type": "slot",
          "data-slot-diagnostic": "missingBlock",
          style,
        },
        mode === "player" ? undefined : "Invalid Slot",
      );
    }
    return createElement(
      "div",
      {
        "data-element-id": element.id,
        "data-element-type": "slot",
        "data-element-painted": "false",
        style,
      },
      createElement(ElementRenderer, {
        element: block.canvas.root as ResolvedElement,
        parent: element,
        blocks,
        mode,
        editingElementId,
        imageLoading,
        onImageError,
        onTextDoubleClick,
        onTextKeyDown,
      }),
    );
  }
  if (element.type === "image") {
    const image = literal(element.image);
    const resolved =
      image && typeof image === "object" && "url" in image
        ? (image as {
            url: string;
            width?: number;
            height?: number;
            alt?: string;
            blurHash?: string | null;
          })
        : null;
    const hasFill = element.fill !== undefined;
    return createElement("img", {
      "data-element-id": element.id,
      "data-element-type": element.type,
      "data-element-parent-id": parent?.id,
      "data-element-rank": element.rank,
      "data-element-painted": "true",
      draggable: false,
      src: resolved?.url,
      width: resolved?.width,
      height: resolved?.height,
      alt: literal(element.alt) || resolved?.alt || "",
      loading: imageLoading ?? "eager",
      decoding: "async",
      "data-image-preview": resolved?.blurHash ? "blur" : "placeholder",
      style: {
        ...style,
        ...(resolved?.blurHash && !hasFill ? { backgroundColor: "#d8dee9" } : {}),
      },
      hidden: element.hidden,
      onError: resolved?.url
        ? (event: unknown) => onImageError?.(element.id, resolved.url, event)
        : undefined,
    });
  }
  const content =
    element.type === "text"
      ? element.textOverflow === "ellipsis" && !editing
        ? createElement(
            "span",
            {
              style: {
                display: "block",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            },
            contentFor(element),
          )
        : contentFor(element)
      : children;
  return createElement(
    "div",
    {
      "data-element-id": element.id,
      "data-element-type": element.type,
      "data-element-name": element.name ?? undefined,
      "data-element-parent-id": parent?.id,
      "data-element-rank": element.rank,
      "data-element-root": root ? "true" : undefined,
      "data-element-painted":
        element.type === "frame" || element.type === "text" || element.fill !== undefined
          ? "true"
          : "false",
      style,
      hidden: element.hidden,
      contentEditable: editing ? "plaintext-only" : undefined,
      suppressContentEditableWarning: editing || undefined,
      onDoubleClick:
        element.type === "text" && onTextDoubleClick
          ? (event: ReactMouseEvent<HTMLDivElement>) => {
              event.preventDefault();
              onTextDoubleClick(element.id, event);
            }
          : undefined,
      onKeyDown:
        editing && onTextKeyDown
          ? (event: ReactKeyboardEvent<HTMLDivElement>) => onTextKeyDown(element.id, event)
          : undefined,
    },
    content,
  );
}

export function ElementRenderer({
  element,
  parent,
  blocks,
  mode,
  editingElementId,
  imageLoading,
  onImageError,
  onTextDoubleClick,
  onTextKeyDown,
}: RenderElementOptions): ReactNode {
  return renderElement({
    element,
    parent,
    blocks,
    mode,
    editingElementId,
    imageLoading,
    onImageError,
    onTextDoubleClick,
    onTextKeyDown,
  });
}

export const CanvasRenderer = memo(function CanvasRenderer({
  canvas,
  className,
  style,
  editingElementId,
  imageLoading,
  blocks,
  mode,
  onImageError,
  onTextDoubleClick,
  onTextKeyDown,
}: CanvasRendererProps): ReactNode {
  const root = ("root" in canvas ? canvas.root : canvas) as ResolvedElement;
  const sceneRoot = "root" in canvas && canvas.kind === "scene";
  return createElement(
    "div",
    {
      className,
      style: { position: "relative", width: "100%", height: "100%", ...style },
      "data-canvas-root": root.id,
    },
    renderElement({
      element: root,
      root: true,
      sceneRoot,
      blocks,
      mode,
      editingElementId,
      imageLoading,
      onImageError,
      onTextDoubleClick,
      onTextKeyDown,
    }),
  );
});
