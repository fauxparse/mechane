import type { ShowId } from "@mechane/domain";
import {
  BeginImageUploadMutation,
  CompleteImageUploadMutation,
  FinalizeImageUploadMutation,
  ImageAssetsQuery,
  graphqlRequest,
} from "@mechane/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT, resolveApiUrl } from "./client";

export const imageAssetsQueryKey = (showId: ShowId) => ["image-assets", showId] as const;

export function useImageAssets(showId: ShowId | null) {
  return useQuery({
    queryKey: imageAssetsQueryKey(showId ?? ("" as ShowId)),
    enabled: showId !== null,
    queryFn: async () => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, ImageAssetsQuery, {
        showId: showId as ShowId,
      });
      return data.imageAssets.map((asset) => ({ ...asset, url: resolveApiUrl(asset.url) }));
    },
  });
}

export function useImageUpload(showId: ShowId | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!showId) throw new Error("Cannot upload an image without a Show.");
      const { beginImageUpload } = await graphqlRequest(
        GRAPHQL_ENDPOINT,
        BeginImageUploadMutation,
        {
          showId,
          mimeType: file.type,
          byteLength: file.size,
        },
      );
      const upload = await fetch(resolveApiUrl(beginImageUpload.plan.url), {
        method: beginImageUpload.plan.method,
        credentials: "include",
        headers: Object.fromEntries(
          Object.entries(beginImageUpload.plan.requiredHeaders as Record<string, string>),
        ),
        body: file,
      });
      if (!upload.ok) throw new Error(`Image upload failed (${upload.status}).`);
      await graphqlRequest(GRAPHQL_ENDPOINT, CompleteImageUploadMutation, {
        sessionId: beginImageUpload.id,
      });
      const { finalizeImageUpload } = await graphqlRequest(
        GRAPHQL_ENDPOINT,
        FinalizeImageUploadMutation,
        { sessionId: beginImageUpload.id, alt: file.name },
      );
      return finalizeImageUpload;
    },
    onSuccess: () => {
      if (showId) void queryClient.invalidateQueries({ queryKey: imageAssetsQueryKey(showId) });
    },
  });
}
