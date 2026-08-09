import { useLayoutEffect, useRef, useState } from "react";

export interface CanvasClientRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

export interface CanvasArtboardGeometry {
  readonly rect: CanvasClientRect;
  readonly elements: ReadonlyMap<string, CanvasClientRect>;
}

export type CanvasGeometry = ReadonlyMap<string, CanvasArtboardGeometry>;

export function clientRect(rect: Pick<DOMRect, "x" | "y" | "width" | "height">): CanvasClientRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
  };
}

/** Reads post-layout browser rectangles without deriving geometry from the Canvas model. */
export function measureCanvasGeometry(workspace: HTMLElement): CanvasGeometry {
  const geometry = new Map<string, CanvasArtboardGeometry>();
  for (const artboard of workspace.querySelectorAll<HTMLElement>("[data-artboard-id]")) {
    const artId = artboard.dataset.artboardId;
    if (!artId) continue;
    const elements = new Map<string, CanvasClientRect>();
    for (const element of artboard.querySelectorAll<HTMLElement>("[data-element-id]")) {
      const elementId = element.dataset.elementId;
      if (elementId) elements.set(elementId, clientRect(element.getBoundingClientRect()));
    }
    geometry.set(artId, { rect: clientRect(artboard.getBoundingClientRect()), elements });
  }
  return geometry;
}

/** Re-measures after native layout, resize, camera changes, and model edits. */
export function useCanvasGeometry(
  workspace: HTMLElement | null,
  invalidationKey: unknown,
): CanvasGeometry {
  const [geometry, setGeometry] = useState<CanvasGeometry>(new Map());
  const frame = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!workspace) {
      setGeometry(new Map());
      return;
    }
    const measure = () => {
      frame.current = null;
      setGeometry(measureCanvasGeometry(workspace));
    };
    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(workspace);
    for (const element of workspace.querySelectorAll<HTMLElement>("[data-artboard-id], [data-element-id]")) {
      observer.observe(element);
    }
    schedule();
    return () => {
      observer.disconnect();
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [invalidationKey, workspace]);

  return geometry;
}
