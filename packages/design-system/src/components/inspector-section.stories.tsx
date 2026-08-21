import type { PropsWithChildren } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoreHorizontal, RotateCcw, SlidersHorizontal } from "lucide-react";

import { Section, SectionRow } from "./inspector-section";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider } from "./ui/sidebar";

const meta: Meta<typeof Section> = {
  title: "design-system/InspectorSection",
  component: Section,
  parameters: { layout: "centered" },
};

export default meta;
type Story = StoryObj<typeof Section>;

function InspectorSurface({ children }: PropsWithChildren) {
  return (
    <div className="flex h-120 w-64 overflow-hidden rounded-md border border-border bg-background">
      <SidebarProvider className="min-w-0 flex-1">
        <Sidebar aria-label="Inspector" collapsible="none" side="right">
          <SidebarHeader>
            <div className="flex items-center gap-2">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              <span className="truncate">Selected element</span>
            </div>
          </SidebarHeader>
          <SidebarContent className="gap-0 p-0">{children}</SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </div>
  );
}

export const Basic: Story = {
  render: () => (
    <InspectorSurface>
      <Section label="Layout">
        <SectionRow>
          <label className="flex items-center text-sm" htmlFor="width">
            Width
          </label>
          <Input id="width" defaultValue="320" inputMode="numeric" />
        </SectionRow>
        <SectionRow>
          <label className="flex items-center text-sm" htmlFor="height">
            Height
          </label>
          <Input id="height" defaultValue="180" inputMode="numeric" />
        </SectionRow>
      </Section>
    </InspectorSurface>
  ),
};

export const WithActions: Story = {
  render: () => (
    <InspectorSurface>
      <Section
        label="Appearance"
        buttons={
          <>
            <Button aria-label="Reset appearance" size="icon-sm" type="button" variant="ghost">
              <RotateCcw />
            </Button>
            <Button
              aria-label="More appearance actions"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreHorizontal />
            </Button>
          </>
        }
      >
        <SectionRow>
          <span className="flex items-center text-sm">Opacity</span>
          <Input defaultValue="100%" inputMode="numeric" />
        </SectionRow>
      </Section>
    </InspectorSurface>
  ),
};
