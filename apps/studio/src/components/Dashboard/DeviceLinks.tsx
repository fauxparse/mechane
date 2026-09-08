// Where each of a Show's Devices can be opened (issue #604).
//
// The Player is a different destination from the editor — it is what an
// audience or a projector sees — so it gets one secondary link per Device
// rather than being folded into an ambiguous "open". A Device's pairing code
// resolves to a Player session at `/s/<code>`.
import { buttonVariants } from "@mechane/design-system";

import { playerSessionUrl } from "../../api/client";
// The Show graph's own icon table, so a Device's link wears the same icon as
// the Device node does in the editor: Smartphone for an Audience Device,
// Projector for a shared one. Reusing it means they cannot drift apart.
import { nodeIcon } from "../../editors/show/graph/node-kinds";
import type { DevicePreview } from "./use-show-dossier";

export interface DeviceLinksProps {
  devices: readonly DevicePreview[];
}

export function DeviceLinks({ devices }: DeviceLinksProps) {
  if (devices.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Open in Player
      </p>
      <ul className="flex flex-wrap gap-2">
        {devices.map((device) => {
          const Icon = nodeIcon("device", { perConnection: device.perConnection });
          if (!device.pairingCode) return null;

          return (
            <li key={device.id}>
              <a
                // New tab because the Player is where the performance is: you
                // are putting it on another screen, not leaving the Studio.
                href={playerSessionUrl(device.pairingCode)}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
                title={`Open ${device.name}`}
              >
                <Icon />
                {device.name}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
