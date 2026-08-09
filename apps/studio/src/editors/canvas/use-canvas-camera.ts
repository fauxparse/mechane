import type { PointerEvent, WheelEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { Position } from "@mechane/domain";

import { focusContext } from "../show/keyboard/focus-context";
import { viewportIntentFor } from "../show/keyboard/viewport-keys";
import { panCanvasCamera, zoomCanvasCamera } from "./canvas-camera";
import type { CanvasCamera } from "./canvas-camera";

interface CameraDrag {
  pointerId: number;
  start: Position;
  origin: Position;
}

export function useCanvasCamera(initialCamera: CanvasCamera = { x: 96, y: 64, zoom: 1 }) {
  const [camera, setCamera] = useState(initialCamera);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const spaceHeld = useRef(false);
  const cameraDrag = useRef<CameraDrag | null>(null);

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

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.metaKey || event.ctrlKey) {
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      setCamera((current) =>
        zoomCanvasCamera(current, point, current.zoom * Math.exp(-event.deltaY * 0.002)),
      );
      return;
    }
    setCamera((current) => panCanvasCamera(current, -event.deltaX, -event.deltaY));
  };

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
    handleWheel,
    zoomIn,
    zoomOut,
    resetCamera,
  };
}
