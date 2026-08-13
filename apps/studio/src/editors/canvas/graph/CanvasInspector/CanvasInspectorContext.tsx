import { createContext, useContext, type PropsWithChildren } from "react";

import type { CanvasInspectorModel } from "./canvas-inspector-types";

const CanvasInspectorContext = createContext<CanvasInspectorModel | null>(null);

export function CanvasInspectorProvider({
  value,
  children,
}: PropsWithChildren<{ value: CanvasInspectorModel }>) {
  return (
    <CanvasInspectorContext.Provider value={value}>{children}</CanvasInspectorContext.Provider>
  );
}

export function useCanvasInspectorContext(): CanvasInspectorModel {
  const context = useContext(CanvasInspectorContext);
  if (!context) throw new Error("Canvas inspector fields must be rendered inside CanvasInspector.");
  return context;
}
