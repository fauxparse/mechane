import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Authoring + show-running app: Show/Flow editor, Scene/Canvas editor,
// Device/Run management, going live. See /PRD.md.
function App() {
  return <div>Presence Studio</div>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
