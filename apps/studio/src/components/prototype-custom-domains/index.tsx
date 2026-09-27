// PROTOTYPE (issue #818) — the prototype's whole surface to the real Studio.
//
// Three wire points, each marked `PROTOTYPE #818` where it lands:
//   - SingleNode.tsx          the Device inspector (every variant)
//   - settings.tsx            the Domains library (variant A only)
//   - _authenticated/route.tsx the variant bar and state panel
//
// With no `?variant=` in the URL every one of them renders what main renders.
import type { GraphNode } from "@mechane/domain/graph";
import type { ShowId } from "@mechane/domain/id";
import { useParams } from "@tanstack/react-router";
import { useEffect } from "react";

import { useShow } from "../../api/shows";
import { registerDevices } from "./domain-store";
import { activeVariant } from "./prototype-variant";
import { devicesOf } from "./shared";
import { VariantAInspector, VariantASettings } from "./VariantA";
import { VariantBInspector } from "./VariantB";
import { VariantCInspector } from "./VariantC";

export { PrototypeChrome } from "./PrototypeChrome";
export { activeVariant } from "./prototype-variant";

export function DeviceDomainPrototype({
  node,
  graphNodes,
}: {
  node: Extract<GraphNode, { kind: "device" }>;
  graphNodes: readonly GraphNode[];
}) {
  const variant = activeVariant();
  const { showId } = useParams({ strict: false }) as { showId?: string };
  const { data: show } = useShow((showId ?? null) as ShowId | null);
  const showName = show?.name ?? "This Show";

  useEffect(() => {
    if (showId) registerDevices(devicesOf(graphNodes, showId, showName));
  }, [graphNodes, showId, showName]);

  if (!variant || !node.pairingCode || !showId) return null;
  const device = { showId, showName, deviceId: node.id, deviceName: node.name };
  if (variant === "A") return <VariantAInspector device={device} pairingCode={node.pairingCode} />;
  if (variant === "B") return <VariantBInspector device={device} pairingCode={node.pairingCode} />;
  return <VariantCInspector device={device} pairingCode={node.pairingCode} />;
}

export function SettingsDomainsPrototype() {
  const variant = activeVariant();
  if (variant === "A") return <VariantASettings />;
  if (variant) {
    return (
      <p className="rounded-md bg-yellow-100 p-3 text-sm text-black">
        PROTOTYPE #818 · Variant {variant} has no Settings surface — domains live with their
        Device. Open a Show and select a Device.
      </p>
    );
  }
  return null;
}
