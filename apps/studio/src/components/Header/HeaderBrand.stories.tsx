import type { Meta, StoryObj } from "@storybook/react-vite";

import { HeaderBrand } from "./HeaderBrand";

const meta: Meta<typeof HeaderBrand> = {
  title: "studio/Components/Header/HeaderBrand",
  component: HeaderBrand,
};

export default meta;
type Story = StoryObj<typeof HeaderBrand>;

export const Default: Story = {};

/** As the dashboard uses it: the wordmark beside the Logo. */
export const Wordmark: Story = {
  args: {
    className: "pl-2 pr-3",
    children: <span className="px-1 py-1.5 text-sm font-semibold tracking-tight">Mechanē</span>,
  },
};
