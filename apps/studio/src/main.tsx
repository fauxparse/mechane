import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mechane/design-system/styles/globals.css";
import { ToastProvider, ToastViewport, TooltipProvider } from "@mechane/design-system";

import { AppThemeProvider } from "./AppThemeProvider";
import { GoogleFontsProvider } from "./editors/canvas/google-fonts-provider";
import { queryClient, router } from "./router";

// Authoring + show-running app: Show/Flow editor, Scene/Canvas editor,
// Device/Run management, going live. See /PRD.md.

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GoogleFontsProvider>
        <AppThemeProvider>
          <TooltipProvider>
            <ToastProvider>
              <RouterProvider router={router} />
              <ToastViewport />
            </ToastProvider>
          </TooltipProvider>
        </AppThemeProvider>
      </GoogleFontsProvider>
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
