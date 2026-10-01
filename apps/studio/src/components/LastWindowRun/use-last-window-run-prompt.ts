// Closing the last Studio window on a live Show (issue #857).
//
// A Run keeps going after Studio closes: Devices stay connected and nobody is
// left with the End run control. A browser will not let a page put its own
// question in the way of a close, so this asks in two steps. The browser's
// generic "Leave site?" stops the close; if the director stays, the page is
// still alive to ask the real question — end the Run or keep it — in-app.
//
// The in-app question is scheduled from inside `beforeunload`. Chrome holds
// the page's timers while its leave dialog is up, so the question appears only
// once the director has chosen to stay; a browser that lets it fire sooner
// shows it behind the leave dialog, where it waits for the same answer.
import { useEffect, useRef, useState } from "react";

import { createShowWindowPresence, type ShowWindowPresence } from "./show-window-presence";

export function useLastWindowRunPrompt({
  showId,
  activeRunId,
  enabled,
}: {
  showId: string | null;
  activeRunId: string | null;
  /** The user's `askToEndRunOnClose` preference. Presence is kept either way,
   * so this window still counts for the others. */
  enabled: boolean;
}): { open: boolean; dismiss(): void } {
  const presence = useRef<ShowWindowPresence | null>(null);
  // The Run the question was asked about. Tying it to a Run, rather than
  // holding a bare flag, means a Run ended from another window closes the
  // question instead of leaving it to reappear when the next Run starts.
  const [promptedRunId, setPromptedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (showId === null) return;
    const current = createShowWindowPresence({ showId });
    presence.current = current;
    current.join();

    // A page put into the back/forward cache is not open; one restored from
    // it is again. Coming back into view takes a fresh roll call, which
    // drops any window that disappeared without saying goodbye.
    const onPageHide = () => current.leave();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) current.join();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") current.join();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      current.leave();
      presence.current = null;
    };
  }, [showId]);

  useEffect(() => {
    if (!enabled || activeRunId === null) return;
    let prompt: number | undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (presence.current?.otherWindows() !== 0) return;
      event.preventDefault();
      window.clearTimeout(prompt);
      prompt = window.setTimeout(() => setPromptedRunId(activeRunId));
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.clearTimeout(prompt);
    };
  }, [activeRunId, enabled]);

  return {
    open: enabled && promptedRunId !== null && promptedRunId === activeRunId,
    dismiss: () => setPromptedRunId(null),
  };
}
