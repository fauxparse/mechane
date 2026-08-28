import { memo } from "react";
import { InspectorProvider, SidebarContent, SidebarHeader } from "@mechane/design-system";

import { AppearanceSection } from "./AppearanceSection";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { BlockVariablesSection, ImageSection, InspectorHeader } from "./CanvasInspectorSections";
import { LayoutSection } from "./LayoutSection";
import { PositionSection } from "./PositionSection";
import type { CanvasInspectorProps } from "./canvas-inspector-types";
import { SlotInputsSection } from "./CanvasInspectorFields";
import { useCanvasInspectorModel } from "./use-canvas-inspector-model";
import { FillSection } from "./FillSection";
import { StrokeSection } from "./StrokeSection";
import { TextSection } from "./TextSection";

const EmptySelection = () => (
  <SidebarContent>
    <p className="p-3 text-sm text-muted-foreground">Select an artboard or Element.</p>
  </SidebarContent>
);

const CanvasInspectorContent = () => (
  <>
    <SidebarHeader className="">
      <InspectorHeader />
    </SidebarHeader>
    <SidebarContent className="gap-0">
      <BlockVariablesSection />
      <ImageSection />
      <PositionSection />
      <SlotInputsSection />
      <LayoutSection />
      <AppearanceSection />
      <FillSection />
      <StrokeSection />
      <TextSection />
    </SidebarContent>
  </>
);

export const CanvasInspector = memo(function CanvasInspector(props: CanvasInspectorProps) {
  const model = useCanvasInspectorModel(props);
  return (
    <InspectorProvider>
      {!model ? (
        <EmptySelection />
      ) : (
        <CanvasInspectorProvider value={model}>
          <CanvasInspectorContent />
        </CanvasInspectorProvider>
      )}
    </InspectorProvider>
  );
});
