import { SidebarContent, SidebarHeader } from "@mechane/design-system";

import { AppearanceSection } from "./AppearanceSection";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import {
  FrameSection,
  ImageSection,
  InspectorHeader,
  TextSection,
} from "./CanvasInspectorSections";
import { LayoutSection } from "./LayoutSection";
import { PositionSection } from "./PositionSection";
import type { CanvasInspectorProps } from "./canvas-inspector-types";
import { useCanvasInspectorModel } from "./use-canvas-inspector-model";

function EmptySelection() {
  return (
    <SidebarContent>
      <p className="p-3 text-sm text-muted-foreground">Select an artboard or Element.</p>
    </SidebarContent>
  );
}

function CanvasInspectorContent() {
  return (
    <>
      <SidebarHeader className="border-0">
        <InspectorHeader />
      </SidebarHeader>
      <SidebarContent className="p-0 gap-0">
        <PositionSection />
        <LayoutSection />
        <AppearanceSection />
        <FrameSection />
        <TextSection />
        <ImageSection />
      </SidebarContent>
    </>
  );
}

export function CanvasInspector(props: CanvasInspectorProps) {
  const model = useCanvasInspectorModel(props);
  if (!model) return <EmptySelection />;

  return (
    <CanvasInspectorProvider value={model}>
      <CanvasInspectorContent />
    </CanvasInspectorProvider>
  );
}
