import { PAIRING_CODE_PATTERN } from "@mechane/domain/pairing-code";
import { Button } from "@mechane/design-system";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HostEntryScreen } from "../components/HostEntry";
import { CodeInput } from "../components/join/CodeInput";
import { SplashScreen } from "../components/join/SplashScreen";

const CODE_LENGTH = 5;

export const Route = createFileRoute("/")({
  component: PlayerHome,
});

// On a Custom Domain, `/` opens the Device the domain is bound to; on the
// Player's own host it is the pairing code form (host-entry.ts).
function PlayerHome() {
  return <HostEntryScreen host={window.location.host} pairingForm={<PairingCodeForm />} />;
}

function PairingCodeForm() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const normalizedCode = code.trim().toUpperCase();
  const valid = PAIRING_CODE_PATTERN.test(normalizedCode);

  function continueToPlayer() {
    if (!valid) return;
    void navigate({ to: "/s/$code", params: { code: normalizedCode } });
  }

  return (
    <SplashScreen>
      <form
        className="flex flex-col items-center justify-center gap-4 rounded-lg bg-white/25 p-6 shadow-xl inset-shadow-[0_1px_0_0_white]"
        onSubmit={(event) => {
          event.preventDefault();
          continueToPlayer();
        }}
      >
        <h1 className="text-2xl text-neutral-800">Enter pairing code</h1>
        <CodeInput length={CODE_LENGTH} value={code} onChange={setCode} />
        <Button
          type="submit"
          size="lg"
          disabled={!valid}
          className="h-auto w-full rounded-md p-2 text-2xl"
        >
          Continue
        </Button>
      </form>
    </SplashScreen>
  );
}
