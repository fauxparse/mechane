import { InspectorProvider, SidebarContent, Tabs, TabsContent } from "@mechane/design-system";
import { memo } from "react";

import { AppearanceSection } from "./AppearanceSection";
import type { CanvasInspectorProps } from "./canvas-inspector-types";
import { CanvasInspectorProvider } from "./CanvasInspectorContext";
import { SlotInputsSection } from "./CanvasInspectorFields";
import { BlockVariablesSection, ImageSection } from "./CanvasInspectorSections";
import { FillSection } from "./FillSection";
import { Header } from "./Header";
import { InteractionSection } from "./InteractionSection";
import { LayoutSection } from "./LayoutSection";
import { PositionSection } from "./PositionSection";
import { StrokeSection } from "./StrokeSection";
import { TextSection } from "./TextSection";
import { useCanvasInspectorModel } from "./use-canvas-inspector-model";

const EmptySelection = () => (
  <SidebarContent>
    <p className="p-3 text-sm text-muted-foreground">Select an artboard or Element.</p>
  </SidebarContent>
);

const CanvasInspectorContent = () => (
  <Tabs defaultValue="properties">
    <Header />
    <SidebarContent className="gap-0">
      <TabsContent value="properties">
        <BlockVariablesSection />
        <ImageSection />
        <PositionSection />
        <SlotInputsSection />
        <LayoutSection />
        <AppearanceSection />
        <FillSection />
        <StrokeSection />
        <TextSection />
      </TabsContent>
      <TabsContent value="interactions">
        <InteractionSection />
      </TabsContent>
    </SidebarContent>
  </Tabs>
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
