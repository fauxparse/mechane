// A Scene painted small (issue #604).
//
// `CanvasRenderer` paints at the authored Artboard size in real DOM, so a
// thumbnail is that output under a `scale()` rather than a separate
// small-size renderer. The container is measured rather than assumed because
// the dashboard asks for previews at four different widths.
import { cn } from "@mechane/design-system";
import { CanvasRenderer } from "@mechane/rendering";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { ScenePreview } from "./use-show-dossier";

export interface ShowPreviewProps {
  scene: ScenePreview | null;
  /** Sizes the preview box. Give it an aspect ratio or a height. */
  className?: string;
  /** Painted instead of the Scene when there is nothing to paint yet. */
  fallback?: ReactNode;
  /** `contain` fits the whole Scene; `cover` fills the box and crops. */
  fit?: "contain" | "cover";
  /**
   * Shapes the box to the Scene rather than the other way round. Combine with
   * a fixed height (`h-full` inside an `h-[38vh]` parent) to get a box whose
   * width follows the Scene's aspect ratio, so a 16:9 projector Scene and a
   * 9:16 phone Scene both fill the height with no letterbox bars.
   */
  shape?: "box" | "scene";
}

export function ShowPreview({
  scene,
  className,
  fallback,
  fit = "contain",
  shape = "box",
}: ShowPreviewProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  const width = scene?.width ?? 0;
  const height = scene?.height ?? 0;

  useEffect(() => {
    const node = boxRef.current;
    if (!node || width === 0 || height === 0) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width: boxWidth, height: boxHeight } = entry.contentRect;
      const ratios = [boxWidth / width, boxHeight / height];
      setScale(fit === "cover" ? Math.max(...ratios) : Math.min(...ratios));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fit, height, width]);

  return (
    <div
      ref={boxRef}
      // The preview is a picture, not a control: whatever wraps it owns the
      // pointer, and the Scene's own interactive Elements must not eat clicks.
      className={cn(
        "pointer-events-none relative overflow-hidden bg-muted",
        // A Scene-shaped box has no shape until there is a Scene to take it
        // from, and a zero-width box would hide the empty state.
        shape === "scene" && width === 0 && "w-full",
        className,
      )}
      style={shape === "scene" && width > 0 ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      {scene && scale > 0 ? (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width,
            height,
            // Both halves matter. `transform-origin: top left` pins the
            // element's own corner to the container's centre, and `scale`
            // outside `translate` makes the -50% offsets scale with it — so
            // the Scene ends up centred whatever it was shrunk by. The default
            // 50% 50% origin instead offsets the result by half the Scene.
            transformOrigin: "top left",
            transform: `scale(${scale}) translate(-50%, -50%)`,
          }}
        >
          <CanvasRenderer presentation={scene.presentation} className="h-full w-full" />
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">{fallback}</div>
      )}
    </div>
  );
}
