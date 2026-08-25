import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorProvider } from "@mechane/design-system";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

const meta: Meta<typeof Select> = {
  title: "design-system/Select",
  component: Select,
};

export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { label: "First option", value: "first" },
  { label: "Second option", value: "second" },
  { label: "Third option", value: "third" },
];

export const Default: Story = {
  render: () => (
    <Select defaultValue="first" items={options}>
      <SelectTrigger aria-label="Choose an option">
        <SelectValue placeholder="Choose an option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="first">First option</SelectItem>
        <SelectItem value="second">Second option</SelectItem>
        <SelectItem value="third">Third option</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const InspectorVibe: Story = {
  render: () => (
    <InspectorProvider>
      <Select defaultValue="first" items={options}>
        <SelectTrigger aria-label="Choose an option">
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </InspectorProvider>
  ),
};
