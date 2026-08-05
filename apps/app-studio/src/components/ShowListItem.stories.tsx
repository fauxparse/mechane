import type { Meta, StoryObj } from "@storybook/react-vite";

import { ShowListItem } from "./ShowListItem";

const meta: Meta<typeof ShowListItem> = {
  title: "app-studio/ShowListItem",
  component: ShowListItem,
  args: {
    name: "Hamlet",
    updatedAt: new Date("2026-08-01T12:00:00Z").toISOString(),
    onOpen: () => {},
    onDelete: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof ShowListItem>;

export const Default: Story = {};

export const Deleting: Story = {
  args: { deleting: true },
};
