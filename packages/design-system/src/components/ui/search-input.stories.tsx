import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";

import { ComponentProps } from "react";
import { SearchInput } from "./search-input";

const meta: Meta<typeof SearchInput> = {
  title: "design-system/SearchInput",
  component: SearchInput,
  args: {
    placeholder: "Search…",
    value: "",
  },
  render: (args) => {
    const [{ value }, updateArgs] = useArgs<Omit<ComponentProps<typeof SearchInput>, "onChange">>();

    return <SearchInput {...args} value={value} onValueChange={(value) => updateArgs({ value })} />;
  },
};

export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = {};
