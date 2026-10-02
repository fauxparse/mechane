import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { userSettingsQueryKey } from "../../api/settings";
import {
  GraphPasteRepairFixtureProvider,
  GraphPasteRepairPrototype,
} from "./GraphPasteRepairPrototype";
import { STATIC_PASTE_REPAIR_FIXTURE } from "./graph-paste-repair-prototype-fixture";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
      queryFn: () => {
        throw new Error("The repair prototype has no remote data provider.");
      },
    },
  },
});

const meta: Meta<typeof GraphPasteRepairPrototype> = {
  title: "studio/Editors/Show/GraphPasteRepairPrototype",
  component: GraphPasteRepairPrototype,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => {
      queryClient.setQueryData(userSettingsQueryKey, {
        themeMode: context.globals.mode === "light" ? "light" : "dark",
      });
      return (
        <QueryClientProvider client={queryClient}>
          <GraphPasteRepairFixtureProvider value={STATIC_PASTE_REPAIR_FIXTURE}>
            <Story />
          </GraphPasteRepairFixtureProvider>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof GraphPasteRepairPrototype>;
export const CompareLayouts: Story = {};
