// A deploy replaces Studio's lazily loaded chunks. A window opened before the
// deploy still asks for the old ones the first time it visits a route — the
// source value editor, the Canvas editor — finds them gone, and has to reload
// to pick up the new build.
//
// That reload is Studio's doing, not the director's, so nothing may ask the
// director to confirm it: `useLastWindowRunPrompt` checks
// `isReloadingForNewBuild()` before stopping an unload. Vite announces the
// failure with `vite:preloadError` before the import rejects, which is early
// enough to record it. TanStack Router reloads on the same failure too
// (`lazyRouteComponent`); this reloads first so the record and the reload
// cannot come apart, and so a stylesheet that failed to load, which the router
// does not reload for, recovers the same way.
//
// One attempt per failure per tab: if the new build is missing the chunk as
// well, reloading again would loop forever. The error then reaches the route's
// error boundary instead.

let reloading = false;

export function reloadOnStaleBuild() {
  window.addEventListener("vite:preloadError", (event) => {
    const key = `mechane:stale-build-reload:${event.payload.message}`;
    if (sessionStorage.getItem(key) !== null) return;
    sessionStorage.setItem(key, "1");
    reloading = true;
    window.location.reload();
  });
}

export function isReloadingForNewBuild() {
  return reloading;
}
