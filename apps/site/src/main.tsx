import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@mechane/design-system/styles/globals.css";
import { ThemeProvider } from "@mechane/design-system";

import { useJoinWaitlist, useStudioSession } from "./api";
import { HoldingPage } from "./components/HoldingPage";
import { STUDIO_DASHBOARD_URL, STUDIO_SIGN_IN_URL } from "./config";

// Holding page at the apex domain: what Mechanē is, a way into Studio for
// existing users, and a waitlist for prospective ones.

const queryClient = new QueryClient();

function App() {
  const session = useStudioSession();
  const waitlist = useJoinWaitlist();

  return (
    <HoldingPage
      studio={{
        session,
        signInUrl: STUDIO_SIGN_IN_URL,
        dashboardUrl: STUDIO_DASHBOARD_URL,
      }}
      waitlist={{ status: waitlist.status, onJoin: waitlist.join }}
    />
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
