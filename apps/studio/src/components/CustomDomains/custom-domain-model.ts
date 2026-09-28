// What Studio says about a Custom Domain (#817, #818, #822): status labels,
// remedies, why each DNS record exists, and what a bind would disturb.
// Shared by Show settings and the Device Share dialog so they read the same.
import type { CustomDomain, CustomDomainStatus } from "@mechane/graphql-schema";

/** A saved Device a domain can be bound to. */
export interface DeviceOption {
  showId: string;
  showName: string;
  deviceId: string;
  deviceName: string;
}

export type DnsRecordView = CustomDomain["records"][number];

export const CUSTOM_DOMAIN_CAP = 10;

export const STATUS_LABEL: Record<CustomDomainStatus, string> = {
  unverified: "Unverified",
  connecting: "Connecting",
  securing: "Securing",
  live: "Live",
  needs_attention: "Needs attention",
  revoked: "Revoked",
};

const REMEDY: Record<CustomDomainStatus, string> = {
  unverified: "Add this record at your domain provider so we know the address is yours.",
  connecting: "Ownership proven. Now point the address at Mechanē.",
  securing: "The DNS is right. We're issuing a certificate, which usually takes a few minutes.",
  live: "Working. Keep these records in place.",
  needs_attention: "Something changed at your domain provider.",
  revoked: "Mechanē has taken this address offline.",
};

export function statusOf(domain: Pick<CustomDomain, "status">): CustomDomainStatus {
  return domain.status as CustomDomainStatus;
}

/** Whether visitors reach the Device at this domain (#825: live or needs attention). */
export function isLiveDomain(domain: Pick<CustomDomain, "status">): boolean {
  return domain.status === "live" || domain.status === "needs_attention";
}

/** The remedy sentence shown with a domain's detail. */
export function remedyFor(domain: CustomDomain): string {
  const status = statusOf(domain);
  if (status === "unverified" && domain.inUseByAnotherAccount) {
    return "This address is in use by another Mechanē account. Add the record below to show it's yours now.";
  }
  if (status === "revoked" && domain.revocationReason) {
    return `${REMEDY.revoked} ${domain.revocationReason}`;
  }
  if (domain.dormant) {
    return `${REMEDY[status]} We've stopped checking automatically; use Check now once the records are in place.`;
  }
  return REMEDY[status];
}

export function recordPurpose(record: DnsRecordView): string {
  if (record.type === "TXT" && record.name.startsWith("_mechane.")) {
    return "Proves the address is yours. Leave it in place for as long as you use the address.";
  }
  if (record.type === "TXT") {
    return "Another hosting account already uses this address; this record releases it to Mechanē.";
  }
  if (record.type === "A")
    return "Sends visitors to Mechanē. Remove any AAAA records for this name.";
  return "Sends visitors to Mechanē.";
}

export function deviceLabel(binding: Pick<DeviceOption, "showName" | "deviceName">): string {
  return `${binding.showName} › ${binding.deviceName}`;
}

/** What binding a domain to a Device would disturb, so Studio can ask first. */
export interface BindConsequence {
  /** The domain currently opens another Device. */
  moves: NonNullable<CustomDomain["binding"]> | null;
  /** The Device already has a different domain, which will be unbound. */
  displaces: CustomDomain | null;
}

/**
 * `domainId` is null for a domain that is about to be added, which can only
 * displace the Device's existing one.
 */
export function bindConsequence(
  domains: readonly CustomDomain[],
  domainId: string | null,
  device: Pick<DeviceOption, "showId" | "deviceId">,
): BindConsequence {
  const domain = domainId ? domains.find((candidate) => candidate.id === domainId) : undefined;
  const moves =
    domain?.binding &&
    (domain.binding.deviceId !== device.deviceId || domain.binding.showId !== device.showId)
      ? domain.binding
      : null;
  const displaces =
    domains.find(
      (candidate) =>
        candidate.id !== domainId &&
        candidate.binding?.deviceId === device.deviceId &&
        candidate.binding.showId === device.showId,
    ) ?? null;
  return { moves, displaces };
}
