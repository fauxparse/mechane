// Static Custom Domains for stories: one in each state Studio draws.
import type { CustomDomain } from "@mechane/graphql-schema";

import type { DeviceOption } from "./custom-domain-model";

export const SHOW_ID = "sknife01";

export const DEVICES: DeviceOption[] = [
  { showId: SHOW_ID, showName: "Knife Fight", deviceId: "daudienc", deviceName: "Audience" },
  { showId: SHOW_ID, showName: "Knife Fight", deviceId: "dproject", deviceName: "Projector" },
];

const proof = (hostname: string) => ({
  type: "TXT",
  name: `_mechane.${hostname}`,
  value: "mechane-proof=k3v9q2m8x1ab7c0d",
});

function domain(overrides: Partial<CustomDomain> & Pick<CustomDomain, "id" | "hostname">) {
  return {
    status: "unverified",
    reason: null,
    records: [proof(overrides.hostname)],
    dormant: false,
    queued: false,
    inUseByAnotherAccount: false,
    binding: null,
    revocationReason: null,
    addedAt: "2026-09-28T01:00:00.000Z",
    provenAt: null,
    wentLiveAt: null,
    statusChangedAt: "2026-09-28T01:00:00.000Z",
    lastCheckedAt: "2026-09-28T01:05:00.000Z",
    ...overrides,
  } satisfies CustomDomain;
}

const audience = {
  showId: SHOW_ID,
  showName: "Knife Fight",
  deviceId: "daudienc",
  deviceName: "Audience",
};

export const LIVE = domain({
  id: "mlive001",
  hostname: "vote.knifefight.nz",
  status: "live",
  binding: audience,
  provenAt: "2026-09-28T01:02:00.000Z",
  wentLiveAt: "2026-09-28T01:10:00.000Z",
  records: [
    { type: "CNAME", name: "vote.knifefight.nz", value: "d1d4fc829fe7bc7c.vercel-dns-017.com." },
    proof("vote.knifefight.nz"),
  ],
});

export const UNVERIFIED = domain({
  id: "munver01",
  hostname: "screen.knifefight.nz",
  binding: { ...audience, deviceId: "dproject", deviceName: "Projector" },
  reason: "Add the TXT record at _mechane.screen.knifefight.nz to prove the address is yours.",
});

export const QUEUED = domain({
  id: "mqueue01",
  hostname: "knifefight.nz",
  status: "connecting",
  queued: true,
  reason: "Waiting our turn with the hosting provider — nothing for you to do.",
  binding: { ...audience, deviceId: "dproject", deviceName: "Projector" },
});

export const REVOKED = domain({
  id: "mrevok01",
  hostname: "vote.basement.co.nz",
  status: "revoked",
  records: [],
  binding: audience,
  revocationReason: "Reported as impersonating another organisation.",
});

export const UNBOUND = domain({ id: "munbnd01", hostname: "show.basement.co.nz" });
