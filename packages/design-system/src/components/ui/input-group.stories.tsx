import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, Eye, InspectorProvider, Search as SearchIcon } from "@mechane/design-system";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group";

const meta: Meta<typeof InputGroup> = {
  title: "design-system/InputGroup",
  component: InputGroup,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof InputGroup>;

export const Search: Story = {
  render: () => (
    <InputGroup className="max-w-sm">
      <InputGroupInput placeholder="Search Shows…" />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">4 results</InputGroupAddon>
    </InputGroup>
  ),
};

export const WithButton: Story = {
  render: () => (
    <InputGroup className="max-w-sm">
      <InputGroupInput type="password" defaultValue="secret" aria-label="Password" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Show password" size="icon-xs">
          <Eye />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

export const WithPrefix: Story = {
  render: () => (
    <InputGroup className="max-w-sm">
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" aria-label="Website" />
    </InputGroup>
  ),
};

export const Textarea: Story = {
  render: () => (
    <InputGroup className="max-w-sm">
      <InputGroupTextarea placeholder="Write a comment…" aria-label="Comment" />
      <InputGroupAddon align="block-end">
        <InputGroupText>0/280</InputGroupText>
        <InputGroupButton size="icon-xs" className="ml-auto" aria-label="Copy comment">
          <Copy />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

export const InspectorVibe: Story = {
  render: () => (
    <InspectorProvider>
      <InputGroup className="w-80">
        <InputGroupAddon>W</InputGroupAddon>
        <InputGroupInput placeholder="Inspector field" aria-label="Inspector field" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Clear">×</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </InspectorProvider>
  ),
};
