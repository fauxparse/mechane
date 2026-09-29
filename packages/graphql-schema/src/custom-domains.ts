// Typed Custom Domain documents (issue #835): the owner operations Studio's
// Show settings and Device Share dialog build on. See
// apps/api/src/graphql/custom-domains.ts for the rules behind each one.
import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

export const CustomDomainFields = graphql(`
  fragment CustomDomainFields on CustomDomain {
    id
    hostname
    status
    reason
    records {
      type
      name
      value
    }
    dormant
    queued
    inUseByAnotherAccount
    binding {
      showId
      showName
      deviceId
      deviceName
    }
    revocationReason
    addedAt
    provenAt
    wentLiveAt
    statusChangedAt
    lastCheckedAt
  }
`);

export const CustomDomainsQuery = graphql(
  `
    query CustomDomains($showId: ID) {
      customDomains(showId: $showId) {
        ...CustomDomainFields
      }
      unboundCustomDomains {
        ...CustomDomainFields
      }
    }
  `,
  [CustomDomainFields],
);

export const AddCustomDomainMutation = graphql(
  `
    mutation AddCustomDomain($hostname: String!, $showId: ID!, $deviceId: ID!) {
      addCustomDomain(hostname: $hostname, showId: $showId, deviceId: $deviceId) {
        ...CustomDomainFields
      }
    }
  `,
  [CustomDomainFields],
);

export const BindCustomDomainMutation = graphql(
  `
    mutation BindCustomDomain($id: ID!, $showId: ID!, $deviceId: ID!) {
      bindCustomDomain(id: $id, showId: $showId, deviceId: $deviceId) {
        ...CustomDomainFields
      }
    }
  `,
  [CustomDomainFields],
);

export const UnbindCustomDomainMutation = graphql(
  `
    mutation UnbindCustomDomain($id: ID!) {
      unbindCustomDomain(id: $id) {
        ...CustomDomainFields
      }
    }
  `,
  [CustomDomainFields],
);

export const RemoveCustomDomainMutation = graphql(`
  mutation RemoveCustomDomain($id: ID!) {
    removeCustomDomain(id: $id)
  }
`);

export const CheckCustomDomainNowMutation = graphql(
  `
    mutation CheckCustomDomainNow($id: ID!) {
      checkCustomDomainNow(id: $id) {
        ...CustomDomainFields
      }
    }
  `,
  [CustomDomainFields],
);

export type CustomDomain = ResultOf<typeof CustomDomainFields>;
export type CustomDomainStatus =
  | "unverified"
  | "connecting"
  | "securing"
  | "live"
  | "needs_attention"
  | "revoked";
