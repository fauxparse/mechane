// Sidebar open state survives a reload, and survives switching editors — the
// Show/Scenes tabs must not reset the panels a director has arranged.
//
// Persistence lives here rather than inside EditorLayout so the layout stays
// pure and its stories never touch localStorage.
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mechane:editor-sidebars-open";

function read(fallback: boolean): boolean {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? fallback : stored === "true";
  } catch {
    // Private browsing and blocked storage are not worth failing a render over.
    return fallback;
  }
}

export function useStoredSidebarState(fallback = true): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(fallback);

  // Read after mount rather than during the initial state, so a server-rendered
  // or hydrated first paint matches the fallback instead of tearing.
  useEffect(() => setOpenState(read(fallback)), [fallback]);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Non-fatal: the state still applies for this session.
    }
  }, []);

  return [open, setOpen];
}
