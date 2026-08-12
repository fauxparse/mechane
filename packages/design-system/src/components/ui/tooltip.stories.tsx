import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info, Settings } from "lucide-react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

const meta: Meta<typeof Tooltip> = {
  title: "design-system/Tooltip",
  component: Tooltip,
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>Hover for details</TooltipTrigger>
      <TooltipContent>Additional information about this control.</TooltipContent>
    </Tooltip>
  ),
};

export const IconButton: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Settings" />}>
        <Settings />
      </TooltipTrigger>
      <TooltipContent>Open settings</TooltipContent>
    </Tooltip>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger render={<Button variant="outline" />}>
        What is this? <Info />
      </TooltipTrigger>
      <TooltipContent side="right">This tooltip opens to the right of its trigger.</TooltipContent>
    </Tooltip>
  ),
};
