import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { Position } from "@mechane/domain";

import { focusContext } from "../../show/keyboard/focus-context";
import { viewportIntentFor } from "../../show/keyboard/viewport-keys";
import { panCanvasCamera, zoomCanvasCamera } from "./canvas-camera";
import type { CanvasCamera } from "./canvas-camera";

interface CameraDrag {
  pointerId: number;
  start: Position;
  origin: Position;
}

export function useCanvasCamera(
  initialCamera: CanvasCamera = { x: 96, y: 64, zoom: 1 },
  /**
   * While an Element is selected the arrow keys belong to nudging it, so panning must stand down —
   * otherwise one press both moves the Element and flies the camera. Zoom keys are unaffected.
   */
  arrowKeysReserved = false,
) {
  const [camera, setCamera] = useState(initialCamera);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const spaceHeld = useRef(false);
  const cameraDrag = useRef<CameraDrag | null>(null);
  const arrowsReserved = useRef(arrowKeysReserved);
  useEffect(() => {
    arrowsReserved.current = arrowKeysReserved;
  }, [arrowKeysReserved]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const focus = focusContext();
      if (event.code === "Space" && !focus.inKeyConsumingWidget) {
        spaceHeld.current = true;
        event.preventDefault();
        return;
      }
      const intent = viewportIntentFor(event, focus);
      if (!intent) return;
      if (intent.type === "pan" && arrowsReserved.current) {
        // Still swallow the key: the nudge owns it, and letting it through would scroll whatever
        // is behind the workspace on top of the nudge.
        event.preventDefault();
        return;
      }
      event.preventDefault();
      if (intent.type === "pan") {
        setCamera((current) => panCanvasCamera(current, -intent.dx, -intent.dy));
        return;
      }
      const bounds = workspaceRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setCamera((current) =>
        zoomCanvasCamera(
          current,
          { x: bounds.width / 2, y: bounds.height / 2 },
          current.zoom * (intent.direction === "in" ? 1.2 : 1 / 1.2),
        ),
      );
    };
    const onKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const beginCameraDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !spaceHeld.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    cameraDrag.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: camera.x, y: camera.y },
    };
  };

  const moveCameraDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = cameraDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    setCamera((current) => ({
      ...current,
      x: drag.origin.x + event.clientX - drag.start.x,
      y: drag.origin.y + event.clientY - drag.start.y,
    }));
  };

  const endCameraDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = cameraDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cameraDrag.current = null;
  };

  // React routes onWheel through a passive root listener, so preventDefault there is a no-op and
  // a trackpad pinch (a ctrlKey wheel event) falls through to the browser's own page zoom.
  // The workspace needs its own non-passive listener to keep the gesture on the camera.
  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    let frame: number | null = null;
    let panX = 0;
    let panY = 0;
    let zoomDelta = 0;
    let zoomPoint = { x: 0, y: 0 };
    const flushWheel = () => {
      frame = null;
      const nextPanX = panX;
      const nextPanY = panY;
      const nextZoomDelta = zoomDelta;
      const nextZoomPoint = zoomPoint;
      panX = 0;
      panY = 0;
      zoomDelta = 0;
      setCamera((current) => {
        let next = current;
        if (nextPanX !== 0 || nextPanY !== 0) {
          next = panCanvasCamera(next, nextPanX, nextPanY);
        }
        if (nextZoomDelta !== 0) {
          next = zoomCanvasCamera(
            next,
            nextZoomPoint,
            next.zoom * Math.exp(nextZoomDelta),
          );
        }
        return next;
      });
    };
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const bounds = workspace.getBoundingClientRect();
      if (event.metaKey || event.ctrlKey) {
        zoomPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        zoomDelta += -event.deltaY * 0.002;
      } else {
        panX -= event.deltaX;
        panY -= event.deltaY;
      }
      if (frame === null) frame = window.requestAnimationFrame(flushWheel);
    };
    // Safari reports trackpad pinches as gesture events rather than ctrlKey wheel events.
    const onGesture = (event: Event) => event.preventDefault();
    workspace.addEventListener("wheel", onWheel, { passive: false });
    workspace.addEventListener("gesturestart", onGesture);
    workspace.addEventListener("gesturechange", onGesture);
    return () => {
      workspace.removeEventListener("wheel", onWheel);
      workspace.removeEventListener("gesturestart", onGesture);
      workspace.removeEventListener("gesturechange", onGesture);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const zoomAtCenter = (factor: number) => {
    const bounds = workspaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setCamera((current) =>
      zoomCanvasCamera(
        current,
        { x: bounds.width / 2, y: bounds.height / 2 },
        current.zoom * factor,
      ),
    );
  };

  const zoomIn = () => zoomAtCenter(1.2);
  const zoomOut = () => zoomAtCenter(1 / 1.2);
  const resetCamera = () => setCamera(initialCamera);

  return {
    camera,
    workspaceRef,
    beginCameraDrag,
    moveCameraDrag,
    endCameraDrag,
    zoomIn,
    zoomOut,
    resetCamera,
  };
}
