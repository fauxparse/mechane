import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxTrigger,
} from "./combobox";

const options = ["Apple", "Banana", "Blueberry", "Grape", "Orange", "Strawberry"];

const meta: Meta<typeof Combobox> = {
  title: "design-system/Combobox",
  component: Combobox,
};

export default meta;
type Story = StoryObj<typeof Combobox>;

function FruitCombobox({ disabled = false }: { disabled?: boolean }) {
  const [inputValue, setInputValue] = useState("");
  const [value, setValue] = useState<string | null>(null);
  const filteredOptions = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(inputValue.toLowerCase())),
    [inputValue],
  );

  return (
    <div className="flex w-64 flex-col gap-2">
      <Combobox
        value={value}
        onValueChange={(nextValue) => setValue(nextValue as string | null)}
        onInputValueChange={setInputValue}
        disabled={disabled}
      >
        <ComboboxLabel>Fruit</ComboboxLabel>
        <ComboboxInputGroup>
          <ComboboxInput placeholder="Choose a fruit" />
          <ComboboxTrigger aria-label="Open fruit options" />
        </ComboboxInputGroup>
        <ComboboxContent>
          {filteredOptions.length === 0 ? <ComboboxEmpty>No fruits found.</ComboboxEmpty> : null}
          {filteredOptions.map((option) => (
            <ComboboxItem key={option} value={option}>
              {option}
            </ComboboxItem>
          ))}
        </ComboboxContent>
      </Combobox>
      <p className="text-xs text-muted-foreground">Selected: {value ?? "None"}</p>
    </div>
  );
}

export const Default: Story = {
  render: () => <FruitCombobox />,
};

export const Disabled: Story = {
  render: () => <FruitCombobox disabled />,
};

export const NoResults: Story = {
  render: () => {
    const [inputValue, setInputValue] = useState("kiwi");
    return (
      <Combobox onInputValueChange={setInputValue}>
        <ComboboxInputGroup className="w-64">
          <ComboboxInput
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
          />
          <ComboboxTrigger aria-label="Open fruit options" />
        </ComboboxInputGroup>
        <ComboboxContent>
          <ComboboxEmpty>No fruits found.</ComboboxEmpty>
        </ComboboxContent>
      </Combobox>
    );
  },
};
