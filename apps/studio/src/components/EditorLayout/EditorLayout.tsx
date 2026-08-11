// The Editor Chrome: the furniture wrapped around whichever editor is open.
//
// The editor itself is a sibling of the sidebars, absolutely positioned across
// the whole viewport, so it paints edge to edge and flows *underneath* the
// floating sidebars and toolbar. The Chrome sits above it on the z axis, not
// beside it in the layout. What the editor should frame when it zooms to fit is
// therefore not the viewport it paints into but the Editable Area — see
// docs/adr/0012 and ./editable-area.ts.
//
// Presentational: every callback and every piece of data arrives as a prop, so
// EditorLayout.stories.tsx can render the whole Chrome with no router, no query
// client, and a placeholder editor.
import { Sidebar, SidebarInset, SidebarProvider } from "@mechane/design-system";
import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Header } from "../Header/Header";
import type { HeaderProps } from "../Header/Header";
import { EditableAreaProvider } from "./EditableAreaProvider";
import { EditorSlotsProvider, useEditorSlotRef, useFilledEditorSlots } from "./editor-slots";

/** Wide enough for a layer tree or a properties panel without crowding the editor. */
const DEFAULT_SIDEBAR_WIDTH = "20rem";

/** The `py-2` the Chrome keeps between itself and the viewport edge, in px. */
const CHROME_GUTTER = 8;

export interface EditorLayoutProps extends PropsWithChildren {
  /** Everything the top bar needs; forwarded verbatim. */
  header: Omit<HeaderProps, "className">;
  sidebarWidth?: string;
  /** Controlled sidebar state. Both sidebars share one flag and one trigger. */
  sidebarsOpen?: boolean;
  onSidebarsOpenChange?(open: boolean): void;
  defaultSidebarsOpen?: boolean;
}

export function EditorLayout(props: EditorLayoutProps) {
  return (
    <EditorSlotsProvider>
      <EditorChrome {...props} />
    </EditorSlotsProvider>
  );
}

function EditorChrome({
  header,
  children,
  sidebarWidth = DEFAULT_SIDEBAR_WIDTH,
  sidebarsOpen: openProp,
  onSidebarsOpenChange,
  defaultSidebarsOpen = true,
}: EditorLayoutProps) {
  const [openState, setOpenState] = useState(defaultSidebarsOpen);
  const open = openProp ?? openState;
  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setOpenState(next);
      onSidebarsOpenChange?.(next);
    },
    [onSidebarsOpenChange, openProp],
  );

  // An editor declares its panels by filling slots. The Show Editor fills no
  // left slot, so its left sidebar — and the space it would reserve in the
  // Editable Area — simply does not exist.
  const filled = useFilledEditorSlots();
  const hasLeft = filled.has("left");
  const hasRight = filled.has("right");
  const leftRef = useEditorSlotRef("left");
  const rightRef = useEditorSlotRef("right");
  const toolbarRef = useEditorSlotRef("toolbar");

  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);

  // The editors own the viewport; stop scroll chaining to the document.
  useEffect(() => {
    const previous = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overscrollBehavior = previous;
    };
  }, []);

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      className="relative h-screen w-screen overflow-hidden"
      style={{ "--sidebar-width": sidebarWidth } as CSSProperties}
    >
      <EditableAreaProvider
        sidebarWidth={sidebarWidth}
        sidebarsOpen={open}
        hasLeftSidebar={hasLeft}
        hasRightSidebar={hasRight}
        headerRef={headerRef}
        footerRef={footerRef}
        gutter={CHROME_GUTTER}
      >
        {/* The editor: full-bleed, beneath the Chrome. The toolbar lives in this
            layer so its backdrop filter samples the editor pixels. */}
        <div className="absolute inset-0">
          {children}
          <div
            ref={footerRef}
            className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center"
          >
            <div ref={toolbarRef} className="contents" />
          </div>
        </div>

        {hasLeft ? (
          <Sidebar variant="floating" collapsible="offcanvas" aria-label="Layers">
            <div ref={leftRef} className="flex min-h-0 flex-1 flex-col" />
          </Sidebar>
        ) : null}

        <SidebarInset className="pointer-events-none grid h-screen grid-rows-[auto_1fr_auto] py-2">
          <div ref={headerRef}>
            <Header {...header} className="px-2" />
          </div>

          {/*
            The Editable Area. Empty by design: it reserves the region the
            editor underneath should frame its content into, and stays
            click-through so the editor receives the pointer.
          */}
          <div aria-hidden="true" />

          <footer />
        </SidebarInset>

        {hasRight ? (
          <Sidebar variant="floating" side="right" collapsible="offcanvas" aria-label="Properties">
            <div ref={rightRef} className="flex min-h-0 flex-1 flex-col" />
          </Sidebar>
        ) : null}
      </EditableAreaProvider>
    </SidebarProvider>
  );
}

/** The panel chrome both sidebars share: a titled header over scrolling content. */
export function EditorPanel({ title, children }: PropsWithChildren<{ title: ReactNode }>) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border p-3 text-sm">
        <strong className="truncate">{title}</strong>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
    </>
  );
}
