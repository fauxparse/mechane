import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bot, Hash, Plus, Projector, TvMinimal, Workflow } from "@mechane/design-system";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuSubmenuContent,
  ContextMenuSubmenuTrigger,
  ContextMenuTrigger,
} from "./context-menu";

const meta: Meta<typeof ContextMenu> = {
  title: "design-system/ContextMenu",
  component: ContextMenu,
};

export default meta;
type Story = StoryObj<typeof ContextMenu>;

/** Right-click (or long-press) the panel. The menu opens at the pointer. */
export const Default: Story = {
  render: () => (
    <ContextMenu>
      <ContextMenuTrigger className="grid h-64 w-full place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Right-click anywhere in here
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuLabel>Canvas</ContextMenuLabel>
        </ContextMenuGroup>
        <ContextMenuSubmenu>
          <ContextMenuSubmenuTrigger>
            <Plus /> Create
          </ContextMenuSubmenuTrigger>
          <ContextMenuSubmenuContent>
            <ContextMenuItem>
              <TvMinimal /> Scene
            </ContextMenuItem>
            <ContextMenuItem>
              <Workflow /> Flow
            </ContextMenuItem>
            <ContextMenuItem>
              <Hash /> Source
            </ContextMenuItem>
            <ContextMenuItem>
              <Bot /> Transformer
            </ContextMenuItem>
            <ContextMenuItem>
              <Projector /> Device
            </ContextMenuItem>
          </ContextMenuSubmenuContent>
        </ContextMenuSubmenu>
        <ContextMenuSeparator />
        <ContextMenuItem>Fit whole Show</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  ),
};
