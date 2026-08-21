import { Button } from "@mechane/design-system";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CodeInput } from "../components/join/CodeInput";
import { SplashScreen } from "../components/join/SplashScreen";

export const Route = createFileRoute("/")({
  component: PlayerHome,
});

function PlayerHome() {
  const [code, setCode] = useState("");

  return (
    <SplashScreen>
      <div className="rounded-lg p-6 bg-white/25 shadow-xl inset-shadow-[0_1px_0_0_white] flex flex-col gap-4 items-center justify-center">
        <h1 className="text-2xl text-neutral-800">Enter code</h1>
        <CodeInput length={5} value={code} onChange={setCode} />
        <Button size="lg" className="text-2xl rounded-md p-2 h-auto w-full">
          Continue
        </Button>
      </div>
    </SplashScreen>
  );
}
