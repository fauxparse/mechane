// The Ownership Proof as a DNS record (CONTEXT.md): a TXT record at
// `_mechane.<hostname>` carrying the domain's own token. The checker looks
// for exactly this value, and Studio shows exactly this record.
import type { DnsRecord } from "./provider";

export function ownershipProofRecord(hostname: string, proofToken: string): DnsRecord {
  return { type: "TXT", name: `_mechane.${hostname}`, value: `mechane-proof=${proofToken}` };
}

/** A new domain's Ownership Proof token. */
export function generateProofToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    byte.toString(36).padStart(2, "0"),
  )
    .join("")
    .slice(0, 20);
}
