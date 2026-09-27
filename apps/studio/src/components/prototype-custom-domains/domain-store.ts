// PROTOTYPE (issue #818) — a stub of the Custom Domain model settled by #817.
//
// No API: the store lives in memory and is mirrored to sessionStorage under a
// PROTOTYPE key only so Settings and the Show Editor see the same domains
// across a full reload. Status transitions are driven by the state panel's
// "simulate" buttons standing in for the checker.
import { useSyncExternalStore } from "react";

import { PLAYER_BASE_URL } from "../../api/client";

export type DomainStatus =
  | "unverified"
  | "connecting"
  | "securing"
  | "live"
  | "attention"
  | "revoked";

export interface DeviceRef {
  showId: string;
  showName: string;
  deviceId: string;
  deviceName: string;
}

export interface CustomDomain {
  id: string;
  hostname: string;
  status: DomainStatus;
  token: string;
  boundTo: DeviceRef | null;
  /** Unverified only: another Mechanē account holds this hostname proven. */
  contested: boolean;
  /** Pending for 72 hours; only Check now wakes it. */
  dormant: boolean;
  /** Present only when Vercel returned a `_vercel` challenge. */
  vercelTxt: string | null;
  /** The failing check, in words, while Connecting/Securing/Needs attention. */
  problem: string | null;
  revokedReason: string | null;
  history: { at: number; text: string }[];
}

export interface DnsRecord {
  type: "TXT" | "A" | "CNAME";
  name: string;
  value: string;
  why: string;
}

export const STATUS_LABEL: Record<DomainStatus, string> = {
  unverified: "Unverified",
  connecting: "Connecting",
  securing: "Securing",
  live: "Live",
  attention: "Needs attention",
  revoked: "Revoked",
};

const PROJECT_CNAME = "d1d4fc829fe7bc7c.vercel-dns-017.com.";
const PROJECT_A = "76.76.21.21";
const TWO_LEVEL_SUFFIXES = ["co.nz", "org.nz", "net.nz", "ac.nz", "co.uk", "org.uk", "com.au"];
const PUBLIC_SUFFIXES = new Set(["nz", "com", "org", "net", "uk", "au", "io", ...TWO_LEVEL_SUFFIXES]);
const STORAGE_KEY = "PROTOTYPE-818-custom-domains-wipe-me";
const HOUR = 60 * 60 * 1000;

export const FAKE_OTHER_SHOW: { showId: string; showName: string; devices: DeviceRef[] } = {
  showId: "show_knifefight2025",
  showName: "Knife Fight 2025",
  devices: [
    {
      showId: "show_knifefight2025",
      showName: "Knife Fight 2025",
      deviceId: "device_kf_phones",
      deviceName: "Audience phones",
    },
    {
      showId: "show_knifefight2025",
      showName: "Knife Fight 2025",
      deviceId: "device_kf_projector",
      deviceName: "Foyer projector",
    },
  ],
};

function token(): string {
  return Math.random().toString(36).slice(2, 14);
}

function seed(): CustomDomain[] {
  const now = Date.now();
  return [
    {
      id: "cd_vote",
      hostname: "vote.knifefight.nz",
      status: "live",
      token: "k3v9q2m8x1ab",
      boundTo: FAKE_OTHER_SHOW.devices[0] ?? null,
      contested: false,
      dormant: false,
      vercelTxt: null,
      problem: null,
      revokedReason: null,
      history: [
        { at: now - 400 * HOUR, text: "Added" },
        { at: now - 399 * HOUR, text: "Ownership proven" },
        { at: now - 398 * HOUR, text: "DNS pointed at Mechanē" },
        { at: now - 398 * HOUR, text: "Certificate issued — live" },
      ],
    },
    {
      id: "cd_apex",
      hostname: "knifefight.nz",
      status: "connecting",
      token: "p0w7c4n5z6de",
      boundTo: null,
      contested: false,
      dormant: false,
      vercelTxt: null,
      problem: "No A record for knifefight.nz yet.",
      revokedReason: null,
      history: [
        { at: now - 3 * HOUR, text: "Added" },
        { at: now - 2 * HOUR, text: "Ownership proven" },
      ],
    },
    {
      id: "cd_basement",
      hostname: "show.basement.co.nz",
      status: "unverified",
      token: "r8t2y6u1i9op",
      boundTo: null,
      contested: true,
      dormant: true,
      vercelTxt: null,
      problem: null,
      revokedReason: null,
      history: [{ at: now - 100 * HOUR, text: "Added" }],
    },
  ];
}

function load(): CustomDomain[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CustomDomain[];
  } catch {
    // fall through to the seed
  }
  return seed();
}

let domains: CustomDomain[] = typeof window === "undefined" ? [] : load();
const listeners = new Set<() => void>();

function commit(next: CustomDomain[]): void {
  domains = next;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(domains));
  for (const listener of listeners) listener();
}

function patch(id: string, change: (domain: CustomDomain) => Partial<CustomDomain>, note?: string) {
  commit(
    domains.map((domain) => {
      if (domain.id !== id) return domain;
      const next = { ...domain, ...change(domain) };
      return note ? { ...next, history: [...next.history, { at: Date.now(), text: note }] } : next;
    }),
  );
}

export function useCustomDomains(): CustomDomain[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => domains,
    () => domains,
  );
}

export function resetPrototype(): void {
  commit(seed());
}

// Devices the Show Editor has seen this session, so Settings can offer them.
const DEVICES_KEY = "PROTOTYPE-818-known-devices-wipe-me";

export function registerDevices(devices: readonly DeviceRef[]): void {
  const known = knownDevices().filter(
    (device) => !devices.some((candidate) => candidate.deviceId === device.deviceId),
  );
  window.sessionStorage.setItem(DEVICES_KEY, JSON.stringify([...known, ...devices]));
}

export function knownDevices(): DeviceRef[] {
  const raw = window.sessionStorage.getItem(DEVICES_KEY);
  const seen = raw ? (JSON.parse(raw) as DeviceRef[]) : [];
  return [
    ...FAKE_OTHER_SHOW.devices,
    ...seen.filter((device) => device.showId !== FAKE_OTHER_SHOW.showId),
  ];
}

// ── Hostnames ──────────────────────────────────────────────────────────────

export function normalizeHostname(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

/** #817's refusals, in words a director can act on. */
export function hostnameProblem(hostname: string): string | null {
  if (!hostname) return "Enter a web address, like vote.yourshow.com.";
  if (hostname.includes("*")) return "Wildcards aren't supported — enter one exact address.";
  if (/^\d+(\.\d+){3}$/.test(hostname) || hostname.includes(":"))
    return "That's an IP address. Enter a domain name instead.";
  if (!hostname.includes(".")) return "That doesn't look like a web address.";
  if (/(^|\.)mechane\.(live|dev)$/.test(hostname)) return "That address already belongs to Mechanē.";
  if (PUBLIC_SUFFIXES.has(hostname)) return `Nobody can own “${hostname}” on its own.`;
  if (domains.some((domain) => domain.hostname === hostname))
    return "You've already added this address.";
  return null;
}

export function isApex(hostname: string): boolean {
  const labels = hostname.split(".");
  const suffix = labels.slice(-2).join(".");
  return TWO_LEVEL_SUFFIXES.includes(suffix) ? labels.length === 3 : labels.length === 2;
}

// ── Records and links ──────────────────────────────────────────────────────

export function recordsFor(domain: CustomDomain): DnsRecord[] {
  if (domain.status === "unverified") {
    return [
      {
        type: "TXT",
        name: `_mechane.${domain.hostname}`,
        value: `mechane-proof=${domain.token}`,
        why: "Proves the address is yours. Leave it in place for as long as you use the address.",
      },
    ];
  }
  if (domain.status === "revoked") return [];
  const pointer: DnsRecord = isApex(domain.hostname)
    ? {
        type: "A",
        name: domain.hostname,
        value: PROJECT_A,
        why: "Sends visitors to Mechanē. Remove any AAAA records for this name.",
      }
    : {
        type: "CNAME",
        name: domain.hostname,
        value: PROJECT_CNAME,
        why: "Sends visitors to Mechanē.",
      };
  const records: DnsRecord[] = [pointer];
  if (domain.vercelTxt) {
    records.push({
      type: "TXT",
      name: `_vercel.${domain.hostname}`,
      value: domain.vercelTxt,
      why: "Another hosting account already uses this address; this record releases it to Mechanē.",
    });
  }
  records.push({
    type: "TXT",
    name: `_mechane.${domain.hostname}`,
    value: `mechane-proof=${domain.token}`,
    why: "Keep this one — removing it takes the address offline after 7 days.",
  });
  return records;
}

export function pairingUrl(pairingCode: string): string {
  return new URL(`/s/${pairingCode}`, PLAYER_BASE_URL).toString();
}

export function domainForDevice(
  list: readonly CustomDomain[],
  deviceId: string,
): CustomDomain | undefined {
  return list.find((domain) => domain.boundTo?.deviceId === deviceId);
}

/** #817: Studio's link and QR use the Custom Domain only once it is Live. */
export function effectiveDeviceUrl(
  list: readonly CustomDomain[],
  deviceId: string,
  pairingCode: string,
): { url: string; viaDomain: boolean } {
  const domain = domainForDevice(list, deviceId);
  if (domain?.status === "live") return { url: `https://${domain.hostname}/`, viaDomain: true };
  return { url: pairingUrl(pairingCode), viaDomain: false };
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function addDomain(rawHostname: string, bindTo?: DeviceRef): CustomDomain | string {
  const hostname = normalizeHostname(rawHostname);
  const problem = hostnameProblem(hostname);
  if (problem) return problem;
  const domain: CustomDomain = {
    id: `cd_${token()}`,
    hostname,
    status: "unverified",
    token: token(),
    boundTo: null,
    contested: false,
    dormant: false,
    vercelTxt: null,
    problem: null,
    revokedReason: null,
    history: [{ at: Date.now(), text: "Added" }],
  };
  commit([...domains, domain]);
  if (bindTo) bindDomain(domain.id, bindTo);
  return domain;
}

export function removeDomain(id: string): void {
  commit(domains.filter((domain) => domain.id !== id));
}

/** What binding would disturb, so the caller can ask first. */
export interface BindConsequence {
  /** The domain currently opens another Device. */
  moves: DeviceRef | null;
  /** The target Device already has a different domain, which will be unbound. */
  displaces: CustomDomain | null;
}

export function bindConsequence(id: string, device: DeviceRef): BindConsequence {
  const domain = domains.find((candidate) => candidate.id === id);
  const moves =
    domain?.boundTo && domain.boundTo.deviceId !== device.deviceId ? domain.boundTo : null;
  const displaces =
    domains.find(
      (candidate) => candidate.id !== id && candidate.boundTo?.deviceId === device.deviceId,
    ) ?? null;
  return { moves, displaces };
}

export function bindDomain(id: string, device: DeviceRef): void {
  commit(
    domains.map((domain) => {
      if (domain.id === id) {
        return {
          ...domain,
          boundTo: device,
          history: [
            ...domain.history,
            { at: Date.now(), text: `Now opens ${device.deviceName} in ${device.showName}` },
          ],
        };
      }
      if (domain.boundTo?.deviceId === device.deviceId) {
        return {
          ...domain,
          boundTo: null,
          history: [...domain.history, { at: Date.now(), text: `Unbound from ${device.deviceName}` }],
        };
      }
      return domain;
    }),
  );
}

export function unbindDomain(id: string): void {
  patch(id, () => ({ boundTo: null }), "Unbound — visitors see the Mechanē holding page");
}

export function checkNow(id: string): void {
  patch(id, () => ({ dormant: false }), "Checked now");
}

// ── Simulated checker (the state panel drives these) ───────────────────────

export type SimulatedEvent =
  | "proofFound"
  | "vercelChallenge"
  | "dnsCorrect"
  | "dnsWrong"
  | "certificateIssued"
  | "recheckFails"
  | "recheckPasses"
  | "proofLapsed"
  | "goDormant"
  | "contest"
  | "revoke"
  | "liftRevocation";

export const SIMULATED_EVENTS: { event: SimulatedEvent; label: string; from: DomainStatus[] }[] = [
  { event: "proofFound", label: "Proof found", from: ["unverified"] },
  { event: "contest", label: "Another account holds it", from: ["unverified"] },
  { event: "vercelChallenge", label: "Vercel asks for _vercel TXT", from: ["connecting"] },
  { event: "dnsWrong", label: "DNS still wrong", from: ["connecting"] },
  { event: "dnsCorrect", label: "DNS correct", from: ["connecting"] },
  { event: "certificateIssued", label: "Certificate issued", from: ["securing"] },
  { event: "recheckFails", label: "Recheck fails (proof missing)", from: ["live"] },
  { event: "recheckPasses", label: "Recheck passes", from: ["attention"] },
  { event: "proofLapsed", label: "7 days without proof", from: ["attention"] },
  { event: "goDormant", label: "72 hours pass", from: ["unverified", "connecting", "securing"] },
  {
    event: "revoke",
    label: "Admin revokes",
    from: ["unverified", "connecting", "securing", "live", "attention"],
  },
  { event: "liftRevocation", label: "Admin lifts revocation", from: ["revoked"] },
];

export function simulate(id: string, event: SimulatedEvent): void {
  switch (event) {
    case "proofFound":
      return patch(
        id,
        () => ({ status: "connecting", contested: false, dormant: false, problem: null }),
        "Ownership proven",
      );
    case "contest":
      return patch(id, () => ({ contested: true }), "In use by another Mechanē account");
    case "vercelChallenge":
      return patch(
        id,
        () => ({
          vercelTxt: `vc-domain-verify=${token()}`,
          problem: "Another hosting account already uses this address.",
        }),
        "Vercel asked for a _vercel record",
      );
    case "dnsWrong":
      return patch(
        id,
        (domain) => ({
          problem: isApex(domain.hostname)
            ? `The A record for ${domain.hostname} points somewhere else.`
            : `The CNAME for ${domain.hostname} points somewhere else.`,
        }),
        "DNS checked — not pointing at Mechanē yet",
      );
    case "dnsCorrect":
      return patch(
        id,
        () => ({ status: "securing", problem: null, vercelTxt: null, dormant: false }),
        "DNS pointed at Mechanē",
      );
    case "certificateIssued":
      return patch(id, () => ({ status: "live", problem: null }), "Certificate issued — live");
    case "recheckFails":
      return patch(
        id,
        () => ({
          status: "attention",
          problem: "The _mechane proof record has gone. Put it back within 7 days.",
        }),
        "Daily check failed: proof record missing",
      );
    case "recheckPasses":
      return patch(id, () => ({ status: "live", problem: null }), "Recheck passed — live again");
    case "proofLapsed":
      return patch(
        id,
        () => ({ status: "unverified", problem: null }),
        "Proof missing for 7 days — removed from Vercel",
      );
    case "goDormant":
      return patch(id, () => ({ dormant: true }), "Stopped checking automatically");
    case "revoke":
      return patch(
        id,
        () => ({
          status: "revoked",
          revokedReason: "Reported as impersonating another organisation.",
          problem: null,
        }),
        "Revoked by Mechanē",
      );
    case "liftRevocation":
      return patch(
        id,
        () => ({ status: "unverified", revokedReason: null }),
        "Revocation lifted",
      );
  }
}
