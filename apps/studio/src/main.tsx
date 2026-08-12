import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mechane/design-system/styles/globals.css";

import { AppThemeProvider } from "./AppThemeProvider";
import { queryClient, router } from "./router";
import { TooltipProvider } from "@mechane/design-system";

// Authoring + show-running app: Show/Flow editor, Scene/Canvas editor,
// Device/Run management, going live. See /PRD.md.

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
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
