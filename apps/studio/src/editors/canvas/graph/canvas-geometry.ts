import type { RefObject } from "react";
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
  /** The backdrop Frame, which selection treats as the artboard rather than as a target. */
  readonly rootElementId: string | null;
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
    let rootElementId: string | null = null;
    for (const element of artboard.querySelectorAll<HTMLElement>("[data-element-id]")) {
      const elementId = element.dataset.elementId;
      if (!elementId) continue;
      elements.set(elementId, clientRect(element.getBoundingClientRect()));
      if (element.dataset.elementRoot === "true") rootElementId = elementId;
    }
    geometry.set(artId, {
      rect: clientRect(artboard.getBoundingClientRect()),
      elements,
      rootElementId,
    });
  }
  return geometry;
}

/** A directly selected Canvas uses its artboard bounds, not the renderer's inner root box. */
export function selectedCanvasRects(
  geometry: CanvasArtboardGeometry,
  elementIds: readonly string[],
): CanvasClientRect[] {
  if (elementIds.length === 1 && elementIds[0] === geometry.rootElementId) {
    return [geometry.rect];
  }
  return elementIds.flatMap((elementId) => {
    const rect = geometry.elements.get(elementId);
    return rect ? [rect] : [];
  });
}

/** Re-measures after native layout, resize, camera changes, and model edits. */
export function useCanvasGeometry(
  workspaceRef: RefObject<HTMLElement | null>,
  invalidationKey: unknown,
): CanvasGeometry {
  const [geometry, setGeometry] = useState<CanvasGeometry>(new Map());
  const frame = useRef<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const scheduleRef = useRef<(() => void) | null>(null);

  // Both observers are disconnected below; the rule cannot follow the observer reference through
  // `schedule` while it is also used to subscribe newly mounted Elements.
  // react-doctor-disable-next-line react-doctor/effect-needs-cleanup
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      setGeometry(new Map());
      return;
    }
    const measure = () => {
      frame.current = null;
      setGeometry(measureCanvasGeometry(workspace));
    };
    const observeElements = () => {
      const observer = observerRef.current;
      if (!observer) return;
      for (const element of workspace.querySelectorAll<HTMLElement>(
        "[data-artboard-id], [data-element-id]",
      )) {
        observer.observe(element);
      }
    };
    const schedule = () => {
      observeElements();
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    observerRef.current = observer;
    scheduleRef.current = schedule;
    observer.observe(workspace);
    mutations.observe(workspace, { childList: true, subtree: true });
    schedule();
    return () => {
      mutations.disconnect();
      observer.disconnect();
      observerRef.current = null;
      scheduleRef.current = null;
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [workspaceRef]);

  useLayoutEffect(() => {
    scheduleRef.current?.();
    return () => {
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [invalidationKey, workspaceRef]);

  return geometry;
}
