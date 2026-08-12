import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, SlidersHorizontal } from "@mechane/design-system";

import {
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
} from "./sidebar";

const meta: Meta<typeof SidebarProvider> = {
  title: "design-system/Sidebar",
  component: SidebarProvider,
  parameters: { layout: "fullscreen" },
  args: { defaultOpen: true },
};

export default meta;
type Story = StoryObj<typeof SidebarProvider>;
export const IndependentPanels: Story = {
  render: (args: ComponentProps<typeof SidebarProvider>) => (
    <div className="flex h-120 w-full overflow-hidden border border-border">
      <SidebarProvider {...args} className="shrink-0">
        <Sidebar aria-label="Layers">
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2">
              <strong>Layers</strong>
              <SidebarTrigger aria-label="Toggle layers" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Artboards</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive>
                      <Box />
                      <span>Lobby</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
      <SidebarProvider {...args} className="min-w-0 flex-1">
        <SidebarInset>
          <div className="flex h-12 items-center justify-between border-b border-border px-3">
            <span className="text-sm text-muted-foreground">Workspace</span>
            <SidebarTrigger aria-label="Toggle inspector">
              <SlidersHorizontal />
            </SidebarTrigger>
          </div>
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Canvas
          </div>
        </SidebarInset>
        <Sidebar side="right" aria-label="Inspector">
          <SidebarHeader>
            <strong>Inspector</strong>
          </SidebarHeader>
          <SidebarContent>
            <p className="p-2 text-sm text-muted-foreground">Select an artboard.</p>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </div>
  ),
};

export const BothPanelsCollapsed: Story = {
  args: { defaultOpen: false },
  render: IndependentPanels.render,
};
