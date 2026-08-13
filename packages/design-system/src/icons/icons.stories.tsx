import type { Meta, StoryObj } from "@storybook/react-vite";
import type { LucideIcon } from "lucide-react";

// Each `./*Icon.tsx` file exports a named component matching its filename,
// so a glob is enough to discover them without maintaining a list by hand.
// `import.meta.glob` is provided by vite/client via the storybook tsconfig; the
// design-system program excludes this file and reports a false positive here.
// @ts-ignore
const modules = import.meta.glob<{ [name: string]: LucideIcon }>("./*Icon.tsx", {
  eager: true,
}) as Record<string, { [name: string]: LucideIcon }>;

const customIcons = Object.entries(modules)
  .flatMap(([path, exports]) => {
    const name = path.slice(2, -".tsx".length);
    const Icon = exports[name];
    return [{ name, Icon }];
  })
  .sort((a, b) => a.name.localeCompare(b.name)) as { name: string; Icon: LucideIcon }[];

const meta = {
  title: "design-system/Icons",
  component: customIcons[0]?.Icon,
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
} satisfies Meta<LucideIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllCustomIcons: Story = {};
