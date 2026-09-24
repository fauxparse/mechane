// The image upload lifecycle slice: begin → upload → complete → finalize
// (with abort anywhere along the way), plus the ImageAsset catalog and the
// ImageValue shape field that resolves an asset by id+revision. Ownership is
// Show-scoped for mutations that name a Show (`findOwnShowOrThrow`,
// ./show.ts) and session-scoped for the ones that only name the upload
// session the same user began; image-processing failures translate to
// GraphQL errors with the processing code, not a generic 500.
import {
  assertValidImageName,
  DEFAULT_IMAGE_UPLOAD_POLICY,
  InvalidImageNameError,
} from "@mechane/domain/images";
import { and, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";

import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { commitBlob, imageDeliveryUrl, listImageAssets, toImageAsset } from "../db/images";
import { blobUploadSessions, imageAssets } from "../db/schema";
import { ImageProcessingError, processImage } from "../images";
import { blobStore } from "../storage/blob-store";
import type { Resolvers } from "./context";
import { requireUserId } from "./context";
import { findOwnShowOrThrow } from "./show";

function validImageName(name: string): string {
  try {
    return assertValidImageName(name);
  } catch (error) {
    if (error instanceof InvalidImageNameError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

function imageUploadError(error: unknown): never {
  if (error instanceof ImageProcessingError) {
    throw new GraphQLError(error.message, { extensions: { code: error.code } });
  }
  throw error;
}

function imageUploadSession(session: typeof blobUploadSessions.$inferSelect) {
  return {
    id: session.id,
    expiresAt: session.expiresAt.toISOString(),
    constraints: DEFAULT_IMAGE_UPLOAD_POLICY,
    plan: {
      method: "PUT",
      url: `/api/uploads/${encodeURIComponent(session.id)}`,
      requiredHeaders: {
        "content-type": session.declaredMimeType,
        "content-length": String(session.byteLength),
      },
    },
  };
}

export const typeDefs = /* GraphQL */ `
    type ImageValue {
      assetId: ID!
      url: String!
      width: Int!
      height: Int!
      alt: String!
      mimeType: String!
      blurHash: String
    }

    type ImageUploadConstraints {
      maxSourceBytes: Int!
      maxPixels: Int!
      maxAxis: Int!
      maxNormalizedBytes: Int!
      sessionTtlMs: Int!
      candidateTtlMs: Int!
    }

    type ImageUploadPlan {
      method: String!
      url: String!
      requiredHeaders: JSON!
    }

    type ImageUploadSession {
      id: ID!
      expiresAt: String!
      constraints: ImageUploadConstraints!
      plan: ImageUploadPlan!
    }

    type ImageUploadCandidate {
      sessionId: ID!
      digest: String!
      byteLength: Int!
      mimeType: String!
    }

    type ImageAsset {
      id: ID!
      revision: String!
      url: String!
      width: Int!
      height: Int!
      mimeType: String!
      name: String!
      alt: String!
      blurHash: String
    }

    type Query {
      imageAssets(showId: ID!): [ImageAsset!]!
    }

    type Mutation {
      beginImageUpload(showId: ID!, mimeType: String!, byteLength: Int!): ImageUploadSession!
      completeImageUpload(sessionId: ID!): ImageUploadCandidate!
      finalizeImageUpload(sessionId: ID!, name: String!): ImageAsset!
      renameImageAsset(showId: ID!, assetId: ID!, name: String!): ImageAsset!
      abortImageUpload(sessionId: ID!): Boolean!
      deleteImageAsset(showId: ID!, assetId: ID!): Boolean!
    }
`;

export const resolvers: Resolvers = {
  ImageValue: {
    assetId: (value: { value: { assetId: string } }) => value.value.assetId,
    url: async (value: { value: { assetId: string; revision: string } }) => {
      const asset = await db
        .select()
        .from(imageAssets)
        .where(
          and(
            eq(imageAssets.id, value.value.assetId),
            eq(imageAssets.revision, value.value.revision),
            eq(imageAssets.state, "active"),
          ),
        )
        .then(([row]) => row);
      if (!asset)
        throw new GraphQLError("Image asset not found.", { extensions: { code: "NOT_FOUND" } });
      return imageDeliveryUrl(asset.id, asset.revision);
    },
    width: async (value: { value: { assetId: string; revision: string } }) => {
      const [asset] = await db
        .select({ width: imageAssets.width })
        .from(imageAssets)
        .where(
          and(
            eq(imageAssets.id, value.value.assetId),
            eq(imageAssets.revision, value.value.revision),
          ),
        );
      return asset?.width ?? 0;
    },
    height: async (value: { value: { assetId: string; revision: string } }) => {
      const [asset] = await db
        .select({ height: imageAssets.height })
        .from(imageAssets)
        .where(
          and(
            eq(imageAssets.id, value.value.assetId),
            eq(imageAssets.revision, value.value.revision),
          ),
        );
      return asset?.height ?? 0;
    },
    alt: async (value: { value: { assetId: string; revision: string } }) => {
      const [asset] = await db
        .select({ alt: imageAssets.alt })
        .from(imageAssets)
        .where(
          and(
            eq(imageAssets.id, value.value.assetId),
            eq(imageAssets.revision, value.value.revision),
          ),
        );
      return asset?.alt ?? "";
    },
    mimeType: async (value: { value: { assetId: string; revision: string } }) => {
      const [asset] = await db
        .select({ mimeType: imageAssets.mimeType })
        .from(imageAssets)
        .where(
          and(
            eq(imageAssets.id, value.value.assetId),
            eq(imageAssets.revision, value.value.revision),
          ),
        );
      return asset?.mimeType ?? "application/octet-stream";
    },
    blurHash: async (value: { value: { assetId: string; revision: string } }) => {
      const [asset] = await db
        .select({ blurHash: imageAssets.blurHash })
        .from(imageAssets)
        .where(
          and(
            eq(imageAssets.id, value.value.assetId),
            eq(imageAssets.revision, value.value.revision),
          ),
        );
      return asset?.blurHash ?? null;
    },
  },
  Query: {
    imageAssets: async (_parent, { showId }: { showId: string }, context) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      return listImageAssets(showId);
    },
  },
  Mutation: {
    beginImageUpload: async (
      _parent,
      { showId, mimeType, byteLength }: { showId: string; mimeType: string; byteLength: number },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      if (!Number.isInteger(byteLength) || byteLength < 1) {
        throw new GraphQLError("byteLength must be a positive integer.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const id = randomUUID();
      const expiresAt = new Date(Date.now() + DEFAULT_IMAGE_UPLOAD_POLICY.sessionTtlMs);
      const [session] = await db
        .insert(blobUploadSessions)
        .values({ id, userId, showId, expiresAt, declaredMimeType: mimeType, byteLength })
        .returning();
      if (!session) throw new GraphQLError("Upload session could not be created.");
      return imageUploadSession(session);
    },
    completeImageUpload: async (_parent, { sessionId }: { sessionId: string }, context) => {
      const userId = requireUserId(context);
      const [session] = await db
        .select()
        .from(blobUploadSessions)
        .where(and(eq(blobUploadSessions.id, sessionId), eq(blobUploadSessions.userId, userId)));
      if (!session)
        throw new GraphQLError("Upload session not found.", {
          extensions: { code: "NOT_FOUND" },
        });
      if (session.expiresAt <= new Date()) {
        throw new GraphQLError("Upload session expired.", {
          extensions: { code: "SESSION_EXPIRED" },
        });
      }
      try {
        const bytes = await blobStore.readUpload(sessionId);
        if (bytes.byteLength !== session.byteLength) {
          throw new ImageProcessingError(
            "INTEGRITY_MISMATCH",
            "Uploaded byte count does not match the declared length.",
          );
        }
        const processed = processImage(
          bytes,
          session.declaredMimeType ?? "application/octet-stream",
        );
        await db
          .update(blobUploadSessions)
          .set({ state: "candidate", candidateDigest: processed.digest })
          .where(eq(blobUploadSessions.id, sessionId));
        return {
          sessionId,
          digest: processed.digest,
          byteLength: processed.byteLength,
          mimeType: processed.mimeType,
        };
      } catch (error) {
        return imageUploadError(error);
      }
    },
    finalizeImageUpload: async (
      _parent,
      { sessionId, name }: { sessionId: string; name: string },
      context,
    ) => {
      const userId = requireUserId(context);
      const validName = validImageName(name);
      const [session] = await db
        .select()
        .from(blobUploadSessions)
        .where(and(eq(blobUploadSessions.id, sessionId), eq(blobUploadSessions.userId, userId)));
      if (!session || !session.candidateDigest) {
        throw new GraphQLError("Upload candidate not found.", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      try {
        const bytes = await blobStore.readUpload(sessionId);
        const processed = processImage(
          bytes,
          session.declaredMimeType ?? "application/octet-stream",
        );
        await commitBlob(processed);
        await blobStore.commitUpload(sessionId, processed);
        const [existing] = await db
          .select()
          .from(imageAssets)
          .where(
            and(
              eq(imageAssets.showId, session.showId),
              eq(imageAssets.blobDigest, session.candidateDigest),
            ),
          );
        if (existing) {
          await db
            .update(blobUploadSessions)
            .set({ state: "finalized" })
            .where(eq(blobUploadSessions.id, sessionId));
          return toImageAsset(existing);
        }
        const [asset] = await db
          .insert(imageAssets)
          .values({
            showId: session.showId,
            blobDigest: processed.digest,
            revision: processed.digest,
            width: processed.width,
            height: processed.height,
            mimeType: processed.mimeType,
            name: validName,
            alt: "",
            blurHash: processed.blurHash,
          })
          .returning();
        if (!asset) throw new GraphQLError("Image asset could not be created.");
        await db
          .update(blobUploadSessions)
          .set({ state: "finalized" })
          .where(eq(blobUploadSessions.id, sessionId));
        return toImageAsset(asset);
      } catch (error) {
        return imageUploadError(error);
      }
    },
    renameImageAsset: async (
      _parent,
      { showId, assetId, name }: { showId: string; assetId: string; name: string },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      const [asset] = await db
        .update(imageAssets)
        .set({ name: validImageName(name), updatedAt: new Date() })
        .where(
          and(
            eq(imageAssets.showId, showId),
            eq(imageAssets.id, assetId),
            eq(imageAssets.state, "active"),
          ),
        )
        .returning();
      if (!asset) {
        throw new GraphQLError("Image asset not found.", {
          extensions: { code: "NOT_FOUND" },
        });
      }
      return toImageAsset(asset);
    },
    abortImageUpload: async (_parent, { sessionId }: { sessionId: string }, context) => {
      const userId = requireUserId(context);
      await db
        .update(blobUploadSessions)
        .set({ state: "aborted" })
        .where(and(eq(blobUploadSessions.id, sessionId), eq(blobUploadSessions.userId, userId)));
      await blobStore.deleteUpload(sessionId);
      return true;
    },
    deleteImageAsset: async (
      _parent,
      { showId, assetId }: { showId: string; assetId: string },
      context,
    ) => {
      const userId = requireUserId(context);
      await findOwnShowOrThrow(showId, userId);
      await db
        .update(imageAssets)
        .set({ state: "deleted", deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(imageAssets.showId, showId), eq(imageAssets.id, assetId)));
      return true;
    },
  },
};

