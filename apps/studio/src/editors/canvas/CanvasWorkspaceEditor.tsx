import { Box, Layers3, PanelLeft, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@mechane/design-system";
import { CanvasRenderer } from "@mechane/rendering";

import type { CanvasArtboardDocument } from "../../api/canvas";

export interface CanvasWorkspaceEditorProps {
  artboards: readonly CanvasArtboardDocument[];
  focusedArtId: string | null;
  onFocusArtboard(artId: string): void;
}

function artboardLabel(artboard: CanvasArtboardDocument): string {
  return (
    artboard.name.trim() || `${artboard.kind === "scene" ? "Scene" : "Block"} ${artboard.artId}`
  );
}

export function CanvasWorkspaceEditor({
  artboards,
  focusedArtId,
  onFocusArtboard,
}: CanvasWorkspaceEditorProps) {
  const ordered = useMemo(
    () =>
      [...artboards].sort(
        (left, right) =>
          left.kind.localeCompare(right.kind) ||
          artboardLabel(left).localeCompare(artboardLabel(right)) ||
          left.artId.localeCompare(right.artId),
      ),
    [artboards],
  );
  const [layersOpen, setLayersOpen] = useState(true);
  const focused = ordered.find((artboard) => artboard.artId === focusedArtId) ?? ordered[0] ?? null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1">
        <SidebarProvider open={layersOpen} onOpenChange={setLayersOpen} className="h-full shrink-0">
          <Sidebar aria-label="Canvas layers">
            <SidebarHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <Layers3 aria-hidden="true" className="size-4 shrink-0" />
                  <strong className="truncate group-data-[state=collapsed]/sidebar:hidden">
                    Layers
                  </strong>
                </div>
                <SidebarTrigger aria-label="Toggle layers">
                  <PanelLeft aria-hidden="true" />
                </SidebarTrigger>
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Artboards</SidebarGroupLabel>
                <SidebarGroupContent>
                  {ordered.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground group-data-[state=collapsed]/sidebar:hidden">
                      No artboards yet.
                    </p>
                  ) : (
                    <SidebarMenu>
                      {ordered.map((artboard) => (
                        <SidebarMenuItem key={artboard.artId}>
                          <SidebarMenuButton
                            aria-label={artboardLabel(artboard)}
                            isActive={artboard.artId === focused?.artId}
                            data-artboard-id={artboard.artId}
                            onClick={() => onFocusArtboard(artboard.artId)}
                          >
                            <Box aria-hidden="true" />
                            <span className="truncate group-data-[state=collapsed]/sidebar:hidden">
                              {artboardLabel(artboard)}
                            </span>
                            <small className="ml-auto text-xs text-muted-foreground group-data-[state=collapsed]/sidebar:hidden">
                              {artboard.kind === "scene" ? "Scene" : "Block"}
                            </small>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>

        <SidebarProvider defaultOpen className="h-full min-w-0 flex-1">
          <SidebarInset>
            <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={layersOpen ? "Collapse layers" : "Expand layers"}
                aria-expanded={layersOpen}
                onClick={() => setLayersOpen((open) => !open)}
              >
                <PanelLeft aria-hidden="true" />
              </Button>
              <div className="flex min-w-0 flex-col gap-0.5">
                <strong className="truncate text-sm">Canvas workspace</strong>
                <span className="text-xs text-muted-foreground">
                  {ordered.length} artboard{ordered.length === 1 ? "" : "s"}
                </span>
              </div>
              <SidebarTrigger aria-label="Toggle inspector">
                <SlidersHorizontal aria-hidden="true" />
              </SidebarTrigger>
            </div>

            <main
              className="relative min-h-0 flex-1 overflow-auto bg-muted/20"
              aria-label="Canvas workspace"
            >
              <div className="relative min-h-[1600px] min-w-[2400px]">
                {ordered.map((artboard) => (
                  <section
                    key={artboard.artId}
                    className="absolute w-[720px] min-h-[520px] cursor-pointer rounded-lg border border-border bg-background shadow-xl data-[focused=true]:border-primary data-[focused=true]:ring-2 data-[focused=true]:ring-primary/35"
                    data-artboard-id={artboard.artId}
                    data-focused={artboard.artId === focused?.artId ? "true" : "false"}
                    style={{ left: artboard.position.x, top: artboard.position.y }}
                    aria-label={artboardLabel(artboard)}
                    onClick={() => onFocusArtboard(artboard.artId)}
                  >
                    <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2 text-xs">
                      <span className="truncate">{artboardLabel(artboard)}</span>
                      <small className="text-[0.6875rem] uppercase text-muted-foreground">
                        {artboard.kind === "scene" ? "Scene" : "Block"}
                      </small>
                    </div>
                    <div className="h-[480px] overflow-hidden p-4">
                      <CanvasRenderer canvas={artboard.canvas} />
                    </div>
                  </section>
                ))}
              </div>
            </main>
          </SidebarInset>

          <Sidebar side="right" aria-label="Canvas inspector">
            <SidebarHeader>
              <div className="flex items-center gap-2 text-sm">
                <SlidersHorizontal aria-hidden="true" className="size-4" />
                <strong>Inspector</strong>
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupLabel>Selection</SidebarGroupLabel>
                <SidebarGroupContent>
                  {focused ? (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted p-3 text-xs">
                      <strong>{artboardLabel(focused)}</strong>
                      <span className="text-muted-foreground">
                        {focused.kind === "scene" ? "Scene" : "Block"} artboard
                      </span>
                      <span className="text-muted-foreground">
                        Position {focused.position.x}, {focused.position.y}
                      </span>
                    </div>
                  ) : (
                    <p className="p-2 text-sm text-muted-foreground">Select an artboard.</p>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </div>
    </div>
  );
}
