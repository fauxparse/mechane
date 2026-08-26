import type { PropsWithChildren } from "react";
import { createContext, useContext } from "react";

export type Vibe = "default" | "inspector";

const VibeContext = createContext<Vibe>("default");

export function useVibe(override?: Vibe): Vibe {
  const inheritedVibe = useContext(VibeContext);
  return override ?? inheritedVibe;
}

export function VibeProvider({ vibe, children }: PropsWithChildren<{ vibe: Vibe }>) {
  return <VibeContext.Provider value={vibe}>{children}</VibeContext.Provider>;
}

export function InspectorProvider({
  children,
  vibe = "inspector",
}: PropsWithChildren<{ vibe?: Vibe }>) {
  return <VibeProvider vibe={vibe}>{children}</VibeProvider>;
}
