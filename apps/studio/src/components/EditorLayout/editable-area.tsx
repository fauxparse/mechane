// The Editable Area: the region of the screen the Editor Chrome leaves visible.
//
// Both editors paint edge to edge, flowing underneath the floating sidebars and
// the toolbar, but every zoom-to-fit frames its target *here* so fitted content
// lands where it can be worked on. See docs/adr/0012.
//
// Sidebar insets are computed from width and open state rather than measured,
// because measuring reports a value that changes on every frame of the slide
// transition — a fit requested mid-slide would frame a rectangle that no longer
// exists by the time the animation lands. Header and footer heights *are*
// measured: they depend on their content and they do not animate.
import { SIDEBAR_BREAKPOINT } from "@mechane/design-system";
import type { PropsWithChildren, RefObject } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

/** Distance in px from each edge of the viewport to the Editable Area. */
export interface EditableAreaInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSET: EditableAreaInset = { top: 0, right: 0, bottom: 0, left: 0 };

const EditableAreaContext = createContext<EditableAreaInset>(NO_INSET);

/**
 * The inset an editor should keep clear when framing content.
 *
 * Defaults to zero on every side, so an editor rendered with no layout around
 * it — in Storybook, or in isolation — frames the whole viewport and behaves
 * exactly as it did before the Editable Area existed.
 */
export function useEditableArea(): EditableAreaInset {
  return useContext(EditableAreaContext);
}

/** Reads the root font size so `rem` sidebar widths can be resolved to px. */
function rootFontSize(): number {
  if (typeof document === "undefined") return 16;
  const parsed = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

/** Tracks a media query, so we know whether the sidebars are rendered at all. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/** Measures an element's height, keeping up with content and font changes. */
function useMeasuredHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      setHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    setHeight(element.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}

export interface EditableAreaProviderProps extends PropsWithChildren {
  /** Sidebar width, in the same `rem`/`px` form given to `--sidebar-width`. */
  sidebarWidth: string;
  /** Whether the sidebars are expanded. One flag: both share a single trigger. */
  sidebarsOpen: boolean;
  /** False when this editor has no left sidebar — the Show Editor. */
  hasLeftSidebar: boolean;
  hasRightSidebar: boolean;
  /** The Chrome's header and footer, measured for the top and bottom inset. */
  headerRef: RefObject<HTMLElement | null>;
  footerRef: RefObject<HTMLElement | null>;
  /** Padding the Chrome keeps between itself and the viewport edge, in px. */
  gutter?: number;
}

export function EditableAreaProvider({
  sidebarWidth,
  sidebarsOpen,
  hasLeftSidebar,
  hasRightSidebar,
  headerRef,
  footerRef,
  gutter = 0,
  children,
}: EditableAreaProviderProps) {
  const sidebarsRendered = useMediaQuery(SIDEBAR_BREAKPOINT);
  const headerHeight = useMeasuredHeight(headerRef);
  const footerHeight = useMeasuredHeight(footerRef);

  const inset = useMemo<EditableAreaInset>(() => {
    const width = sidebarWidth.trim().endsWith("rem")
      ? Number.parseFloat(sidebarWidth) * rootFontSize()
      : Number.parseFloat(sidebarWidth);
    const occupied = sidebarsRendered && sidebarsOpen && Number.isFinite(width) ? width : 0;
    return {
      top: gutter + headerHeight,
      right: hasRightSidebar ? occupied : 0,
      bottom: gutter + footerHeight,
      left: hasLeftSidebar ? occupied : 0,
    };
  }, [
    footerHeight,
    gutter,
    hasLeftSidebar,
    hasRightSidebar,
    headerHeight,
    sidebarWidth,
    sidebarsOpen,
    sidebarsRendered,
  ]);

  return <EditableAreaContext.Provider value={inset}>{children}</EditableAreaContext.Provider>;
}
