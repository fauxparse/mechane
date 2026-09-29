import { useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL } from "../api";
import { isCanonicalPlayerHost, resolveHostEntry, type HostEntry } from "../host-entry";
import { PLAYER_ORIGIN } from "../player-origin";
import { HoldingPage } from "./HoldingPage";
import { SplashScreen } from "./join/SplashScreen";
import { PlayerView } from "./PlayerView";

/** Renders what a resolved host shows; `canonical` renders `pairingForm`. */
export function HostEntryView({
  entry,
  pairingForm,
}: {
  entry: HostEntry | null;
  pairingForm: ReactNode;
}) {
  if (entry === null) return <SplashScreen>{null}</SplashScreen>;
  switch (entry.kind) {
    case "canonical":
      return pairingForm;
    case "device":
      return <PlayerView code={entry.pairingCode} />;
    case "not_found":
      return <HoldingPage />;
    case "busy":
      return <HoldingPage busy />;
  }
}

/**
 * `/` on `host`: the pairing form on the canonical Player host, or the
 * Device a Custom Domain opens, resolved without changing the URL.
 */
export function HostEntryScreen({ host, pairingForm }: { host: string; pairingForm: ReactNode }) {
  const canonical = isCanonicalPlayerHost(host, PLAYER_ORIGIN);
  const [resolved, setResolved] = useState<HostEntry | null>(null);

  useEffect(() => {
    if (canonical) return;
    const controller = new AbortController();
    void resolveHostEntry(host, {
      canonicalOrigin: PLAYER_ORIGIN,
      apiBaseUrl: API_BASE_URL,
      signal: controller.signal,
    }).then((entry) => {
      if (!controller.signal.aborted) setResolved(entry);
    });
    return () => controller.abort();
  }, [canonical, host]);

  return (
    <HostEntryView entry={canonical ? { kind: "canonical" } : resolved} pairingForm={pairingForm} />
  );
}
