import { useSyncExternalStore } from "react";

export type ShapeEditorStatus = {
  invalidReason: string | null;
  activeRunWarning: boolean;
};

const EMPTY_STATUS: ShapeEditorStatus = { invalidReason: null, activeRunWarning: false };
let status = EMPTY_STATUS;
const listeners = new Set<() => void>();

export function setShapeEditorStatus(next: ShapeEditorStatus): void {
  if (status.invalidReason === next.invalidReason && status.activeRunWarning === next.activeRunWarning) return;
  status = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ShapeEditorStatus {
  return status;
}

export function useShapeEditorStatus(): ShapeEditorStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
