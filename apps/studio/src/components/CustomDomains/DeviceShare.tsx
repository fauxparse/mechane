// "Share this Device…" in the Device inspector (#838). The inspector is also
// rendered where there is no API (tests, stories), so the button appears
// only inside a DeviceShareProvider, which the Show editor route supplies.
import { Button, Share2Icon } from "@mechane/design-system";
import type { ShowId } from "@mechane/domain/id";
import { useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useState, type ReactNode } from "react";

import { PLAYER_BASE_URL } from "../../api/client";
import { useCustomDomainMutations, useCustomDomains } from "../../api/custom-domains";
import { useShow } from "../../api/shows";
import { DeviceShareDialog } from "./DeviceShareDialog";

const DeviceShareShow = createContext<ShowId | null>(null);

export function DeviceShareProvider({ showId, children }: { showId: ShowId; children: ReactNode }) {
  return <DeviceShareShow.Provider value={showId}>{children}</DeviceShareShow.Provider>;
}

export interface DeviceShareButtonProps {
  deviceId: string;
  deviceName: string;
  pairingCode: string;
}

export function DeviceShareButton(props: DeviceShareButtonProps) {
  const showId = useContext(DeviceShareShow);
  if (showId === null) return null;
  return <DeviceShare showId={showId} {...props} />;
}

function DeviceShare({
  showId,
  deviceId,
  deviceName,
  pairingCode,
}: DeviceShareButtonProps & { showId: ShowId }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const show = useShow(showId);
  const domains = useCustomDomains();
  const mutations = useCustomDomainMutations();
  const device = {
    showId,
    showName: show.data?.name ?? "",
    deviceId,
    deviceName: deviceName.trim() || "Untitled Device",
    pairingCode,
  };

  return (
    <>
      <Button variant="secondary" size="sm" className="col-span-2" onClick={() => setOpen(true)}>
        <Share2Icon /> Share this Device…
      </Button>
      {open ? (
        <DeviceShareDialog
          open
          onOpenChange={setOpen}
          device={device}
          domains={domains.data?.customDomains ?? []}
          playerOrigin={PLAYER_BASE_URL}
          settingsHref={`/shows/${showId}/settings`}
          onManage={() => void navigate({ to: "/shows/$showId/settings", params: { showId } })}
          onAdd={async (hostname) => {
            await mutations.add.mutateAsync({ hostname, showId, deviceId });
          }}
          onBind={async (domain) => {
            await mutations.bind.mutateAsync({ id: domain.id, showId, deviceId });
          }}
          onCheckNow={async (domain) => {
            await mutations.checkNow.mutateAsync(domain.id);
          }}
        />
      ) : null}
    </>
  );
}
