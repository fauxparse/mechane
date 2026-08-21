import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mechane/design-system/styles/globals.css";

import { router } from "./router";

// Device client: renders whatever Scene the paired Device is showing and
// emits Events. Runs on audience phones, projectors, and laptops. See /PRD.md.
function App() {
  return <RouterProvider router={router} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
