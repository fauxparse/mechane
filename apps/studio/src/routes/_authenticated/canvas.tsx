import { Sidebar, SidebarInset, SidebarProvider } from "@mechane/design-system";
import { createFileRoute } from "@tanstack/react-router";
import { Header } from "../../components/Header/Header";
import { Toolbar } from "../../editors/canvas/Toolbar/Toolbar";

export const Route = createFileRoute("/_authenticated/canvas")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <SidebarProvider
      className="h-screen w-screen relative"
      style={
        {
          "--sidebar-width": "20rem",
        } as React.CSSProperties
      }
    >
      <main className="absolute inset-0">
        Visible canvas area extends to the edges of the screen
      </main>
      <Sidebar variant="floating" collapsible="offcanvas">
        <p>
          In the canvas editor, the left sidebar contains the layer tree. There currently isn't
          anything in the left sidebar for the show editor, so maybe hide it altogether in show
          mode.
        </p>
      </Sidebar>
      <SidebarInset className="h-screen py-2 pointer-events-none grid grid-rows-[auto_1fr_auto]">
        <Header title="Show name here" className="grid-row-1 px-2" />
        <div>
          This is the visible area. Use this for zoom/scroll fit calculations. The "show/scenes"
          tabs at the top toggle between the show editor and the canvas editor. Toggling should
          maintain the sidebar state.
        </div>
        <footer className="flex justify-center">
          <Toolbar />
        </footer>
      </SidebarInset>
      <Sidebar variant="floating" side="right" collapsible="offcanvas">
        <p>In the canvas editor, the right sidebar contains the properties panel.</p>
        <p>
          In the show editor, the right sidebar contains properties for the selected nodes, edges,
          or flows.
        </p>
      </Sidebar>
    </SidebarProvider>
  );
}
