import type { Meta, StoryObj } from "@storybook/react-vite";
import { Check, Plus } from "@mechane/design-system";

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "./avatar";

const meta: Meta<typeof Avatar> = {
  title: "design-system/Avatar",
  component: Avatar,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" alt="Shadcn" />
      <AvatarFallback id="CN" />
    </Avatar>
  ),
};

export const SizesAndFallbacks: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar size="sm">
        <AvatarFallback id="SM" />
      </Avatar>
      <Avatar>
        <AvatarFallback id="MD" />
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback id="LG" />
      </Avatar>
    </div>
  ),
};

export const WithBadge: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarFallback id="ER" />
        <AvatarBadge className="bg-green-600 dark:bg-green-800" />
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback id="PP" />
        <AvatarBadge>
          <Check aria-hidden="true" />
        </AvatarBadge>
      </Avatar>
      <Avatar size="sm">
        <AvatarFallback id="+" />
        <AvatarBadge>
          <Plus aria-hidden="true" />
        </AvatarBadge>
      </Avatar>
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar>
        <AvatarFallback id="CN" />
      </Avatar>
      <Avatar>
        <AvatarFallback id="LR" />
      </Avatar>
      <Avatar>
        <AvatarFallback id="ER" />
      </Avatar>
      <AvatarGroupCount>+3</AvatarGroupCount>
    </AvatarGroup>
  ),
};
