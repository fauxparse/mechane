import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@presence/design-system/styles/globals.css";

import { AppThemeProvider } from "./AppThemeProvider";
import { router } from "./router";

// Authoring + show-running app: Show/Flow editor, Scene/Canvas editor,
// Device/Run management, going live. See /PRD.md.
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <RouterProvider router={router} />
      </AppThemeProvider>
    </QueryClientProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
