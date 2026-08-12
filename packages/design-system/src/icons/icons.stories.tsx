import type { Meta, StoryObj } from "@storybook/react-vite";

import { MechaneIcon } from "./MechaneIcon";

const customIcons = [{ name: "MechaneIcon", Icon: MechaneIcon }];

const meta = {
  title: "design-system/Icons",
  component: MechaneIcon,
  render: () => (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4">
      {customIcons.map(({ name, Icon }) => (
        <div className="flex flex-col items-center gap-2 rounded-lg border p-4" key={name}>
          <Icon aria-hidden="true" className="size-12" />
          <span className="text-sm">{name}</span>
        </div>
      ))}
    </div>
  ),
} satisfies Meta<typeof MechaneIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllCustomIcons: Story = {};
