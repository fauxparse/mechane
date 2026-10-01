import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useGlobals } from "storybook/preview-api";

import { userSettingsQueryKey } from "../../api/settings";
import { MOCK_HEADER } from "../EditorLayout/editor-layout-fixtures";
import { StoryRouter } from "../StoryRouter";
import { AccountMenu } from "./AccountMenu";

const storyQueryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity },
  },
});

const meta: Meta<typeof AccountMenu> = {
  title: "studio/Components/Header/AccountMenu",
  component: AccountMenu,
  render: (args) => {
    const [, updateGlobals] = useGlobals();
    return <AccountMenu {...args} onThemeModeChange={(mode) => updateGlobals({ mode })} />;
  },
  args: {
    user: MOCK_HEADER.user,
    onLogOut: MOCK_HEADER.onLogOut,
  },
  decorators: [
    (Story, context) => {
      storyQueryClient.setQueryData(userSettingsQueryKey, {
        themeMode: context.globals.mode === "light" ? "light" : "dark",
      });

      return (
        <QueryClientProvider client={storyQueryClient}>
          <StoryRouter>
            <Story />
          </StoryRouter>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof AccountMenu>;

export const Default: Story = {};

/** A role that may enter the admin area (issue #826). */
export const WithAdmin: Story = {
  args: { canAdminister: true },
};
