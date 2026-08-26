import type { Meta, StoryObj } from "@storybook/react-vite";
import { InspectorProvider } from "@mechane/design-system";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  useComboboxAnchor,
} from "./combobox";

const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"] as const;

const meta: Meta<typeof Combobox> = {
  title: "design-system/Combobox",
  component: Combobox,
};

export default meta;
type Story = StoryObj<typeof Combobox>;

export const Default: Story = {
  render: () => (
    <Combobox items={frameworks}>
      <ComboboxInput placeholder="Select a framework" />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
};

export const CustomItems: Story = {
  render: () => {
    const items = frameworks.map((framework) => ({
      label: framework,
      value: framework.toLowerCase().replace(".", ""),
    }));

    return (
      <Combobox items={items} itemToStringValue={(item: (typeof items)[number]) => item.label}>
        <ComboboxInput placeholder="Select a framework" />
        <ComboboxContent>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  },
};

export const Multiple: Story = {
  render: () => {
    const anchor = useComboboxAnchor();

    return (
      <Combobox multiple autoHighlight items={frameworks} defaultValue={[frameworks[0]]}>
        <ComboboxChips ref={anchor} className="w-full max-w-xs">
          <ComboboxValue>
            {(values) => (
              <>
                {(values as string[]).map((value) => (
                  <ComboboxChip key={value}>{value}</ComboboxChip>
                ))}
                <ComboboxChipsInput placeholder="Add frameworks" />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    );
  },
};

export const Groups: Story = {
  render: () => (
    <Combobox
      items={[
        { group: "Popular", items: ["Next.js", "SvelteKit"] },
        { group: "Other", items: ["Nuxt.js", "Remix", "Astro"] },
      ].flatMap(({ items }) => items)}
    >
      <ComboboxInput placeholder="Select a framework" />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxGroup>
            <ComboboxLabel>Popular</ComboboxLabel>
            <ComboboxItem value="Next.js">Next.js</ComboboxItem>
            <ComboboxItem value="SvelteKit">SvelteKit</ComboboxItem>
          </ComboboxGroup>
          <ComboboxSeparator />
          <ComboboxGroup>
            <ComboboxLabel>Other</ComboboxLabel>
            <ComboboxItem value="Nuxt.js">Nuxt.js</ComboboxItem>
            <ComboboxItem value="Remix">Remix</ComboboxItem>
            <ComboboxItem value="Astro">Astro</ComboboxItem>
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Combobox items={frameworks}>
      <ComboboxInput placeholder="Select a framework" disabled />
      <ComboboxContent>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
};

export const Empty: Story = {
  render: () => (
    <Combobox items={[]}>
      <ComboboxInput placeholder="No frameworks available" />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList />
      </ComboboxContent>
    </Combobox>
  ),
};

export const InspectorVibe: Story = {
  render: () => (
    <InspectorProvider>
      <Combobox items={frameworks}>
        <ComboboxInput placeholder="Inspector combobox" />
        <ComboboxContent>
          <ComboboxEmpty>No items found.</ComboboxEmpty>
          <ComboboxList>
            {(item) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </InspectorProvider>
  ),
};
