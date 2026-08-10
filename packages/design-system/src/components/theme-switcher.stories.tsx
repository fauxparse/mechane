import { DEFAULT_THEME_PALETTE } from "@mechane/domain";
import type { ThemePalette } from "@mechane/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ThemeSwitcher } from "./theme-switcher";

const meta: Meta<typeof ThemeSwitcher> = {
  title: "design-system/ThemeSwitcher",
  component: ThemeSwitcher,
};

export default meta;
type Story = StoryObj<typeof ThemeSwitcher>;

// Interactive: clicking a Button here actually updates Storybook's
// mode/palette toolbar via the args, so switching in the story preview
// looks the same as switching in the real Settings screen.
export const Interactive: Story = {
  render: () => {
    function Wrapper() {
      const [mode, setMode] = useState<"dark" | "light">("dark");
      const [palette, setPalette] = useState<ThemePalette>(DEFAULT_THEME_PALETTE);
      return (
        <ThemeSwitcher
          mode={mode}
          palette={palette}
          onModeChange={setMode}
          onPaletteChange={setPalette}
        />
      );
    }
    return <Wrapper />;
  },
};

export const DarkGruvbox: Story = {
  args: {
    mode: "dark",
    palette: "gruvbox",
    onModeChange: () => {},
    onPaletteChange: () => {},
  },
};
