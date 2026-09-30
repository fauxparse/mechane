import type { Meta, StoryObj } from "@storybook/react-vite";

import { ListIcon, PuzzleIcon, TypeIcon } from "lucide-react";
import { BadgedIcon } from "./badged-icon";

const meta: Meta<typeof BadgedIcon> = {
  title: "design-system/BadgedIcon",
  component: BadgedIcon,
  args: {
    icon: ListIcon,
    badge: TypeIcon,
    badgeColor: "default",
  },
  argTypes: {
    badgeColor: {
      control: "select",
      options: ["default", "success", "destructive"],
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgedIcon>;

export const Default: Story = {};

export const ArrayOfShape: Story = {
  args: {
    icon: ListIcon,
    badge: PuzzleIcon,
  },
};

export const Small: Story = {
  args: {
    className: "size-4",
  },
};
