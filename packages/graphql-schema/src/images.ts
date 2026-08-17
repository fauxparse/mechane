import { graphql } from "./graphql";
import type { ResultOf } from "gql.tada";

export const ImageAssetsQuery = graphql(`
  query ImageAssets($showId: ID!) {
    imageAssets(showId: $showId) {
      id
      revision
      url
      width
      height
      mimeType
      alt
      blurHash
    }
  }
`);

export const BeginImageUploadMutation = graphql(`
  mutation BeginImageUpload($showId: ID!, $mimeType: String!, $byteLength: Int!) {
    beginImageUpload(showId: $showId, mimeType: $mimeType, byteLength: $byteLength) {
      id
      expiresAt
      constraints {
        maxSourceBytes
        maxPixels
        maxAxis
        maxNormalizedBytes
        sessionTtlMs
        candidateTtlMs
      }
      plan {
        method
        url
        requiredHeaders
      }
    }
  }
`);

export const CompleteImageUploadMutation = graphql(`
  mutation CompleteImageUpload($sessionId: ID!) {
    completeImageUpload(sessionId: $sessionId) {
      sessionId
      digest
      byteLength
      mimeType
    }
  }
`);

export const FinalizeImageUploadMutation = graphql(`
  mutation FinalizeImageUpload($sessionId: ID!, $alt: String) {
    finalizeImageUpload(sessionId: $sessionId, alt: $alt) {
      id
      revision
      url
      width
      height
      mimeType
      alt
      blurHash
    }
  }
`);

export type ImageAsset = ResultOf<typeof ImageAssetsQuery>["imageAssets"][number];
export type ImageUploadSession = ResultOf<typeof BeginImageUploadMutation>["beginImageUpload"];
