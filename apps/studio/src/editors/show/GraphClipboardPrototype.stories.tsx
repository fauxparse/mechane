// Throwaway (#875): Storybook entry for the graph clipboard gesture prototype.
// Open the iframe URL directly (not inside the Storybook manager) so clipboard
// events and the async clipboard API run in a top-level, focused document.
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToastProvider, ToastViewport } from "@mechane/design-system";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { userSettingsQueryKey } from "../../api/settings";
import { GraphClipboardPrototype } from "./GraphClipboardPrototype";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
      queryFn: () => {
        throw new Error("The clipboard prototype has no remote data provider.");
      },
    },
  },
});

const meta: Meta<typeof GraphClipboardPrototype> = {
  title: "studio/Editors/Show/GraphClipboardPrototype",
  component: GraphClipboardPrototype,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story, context) => {
      queryClient.setQueryData(userSettingsQueryKey, {
        themeMode: context.globals.mode === "light" ? "light" : "dark",
      });
      return (
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Story />
            <ToastViewport />
          </ToastProvider>
        </QueryClientProvider>
      );
    },
  ],
};

export default meta;
type Story = StoryObj<typeof GraphClipboardPrototype>;
export const CompareGestures: Story = {};
