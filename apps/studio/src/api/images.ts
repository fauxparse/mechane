import type { ShowId } from "@mechane/domain";
import {
  AbortImageUploadMutation,
  BeginImageUploadMutation,
  CompleteImageUploadMutation,
  FinalizeImageUploadMutation,
  ImageAssetsQuery,
  graphqlRequest,
} from "@mechane/graphql-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { GRAPHQL_ENDPOINT, resolveApiUrl } from "./client";

export const imageAssetsQueryKey = (showId: ShowId) => ["image-assets", showId] as const;

export type ImageUploadRequest = {
  file: File;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

const uploadCancelledError = () => {
  const error = new Error("Image upload was cancelled.");
  error.name = "AbortError";
  return error;
};

const putUpload = async ({
  url,
  method,
  headers,
  file,
  signal,
  onProgress,
}: {
  url: string;
  method: string;
  headers: Record<string, string>;
  file: File;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}) => {
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const cleanup = () => signal?.removeEventListener("abort", handleAbort);
    const handleAbort = () => request.abort();
    const settle = (callback: () => void) => {
      cleanup();
      callback();
    };

    if (signal?.aborted) {
      reject(uploadCancelledError());
      return;
    }

    request.open(method, resolveApiUrl(url));
    request.withCredentials = true;
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.((event.loaded / event.total) * 100);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) settle(resolve);
      else settle(() => reject(new Error(`Image upload failed (${request.status}).`)));
    };
    request.onerror = () => settle(() => reject(new Error("Image upload failed.")));
    request.onabort = () => settle(() => reject(uploadCancelledError()));
    signal?.addEventListener("abort", handleAbort, { once: true });
    request.send(file);
  });
};

const abortUploadSession = async (sessionId: string) => {
  try {
    await graphqlRequest(GRAPHQL_ENDPOINT, AbortImageUploadMutation, { sessionId });
  } catch {
    // Cleanup is best effort; preserve the original upload error for the caller.
  }
};

export async function uploadImageFile(
  showId: ShowId,
  { file, signal, onProgress }: ImageUploadRequest,
) {
  if (!showId) throw new Error("Cannot upload an image without a Show.");

  let sessionId: string | null = null;
  try {
    const { beginImageUpload } = await graphqlRequest(
      GRAPHQL_ENDPOINT,
      BeginImageUploadMutation,
      {
        showId,
        mimeType: file.type,
        byteLength: file.size,
      },
      { signal },
    );
    sessionId = beginImageUpload.id;
    await putUpload({
      url: beginImageUpload.plan.url,
      method: beginImageUpload.plan.method,
      headers: Object.fromEntries(
        Object.entries(beginImageUpload.plan.requiredHeaders as Record<string, string>),
      ),
      file,
      signal,
      onProgress,
    });
    await graphqlRequest(GRAPHQL_ENDPOINT, CompleteImageUploadMutation, { sessionId }, { signal });
    const { finalizeImageUpload } = await graphqlRequest(
      GRAPHQL_ENDPOINT,
      FinalizeImageUploadMutation,
      { sessionId, alt: file.name },
      { signal },
    );
    onProgress?.(100);
    return finalizeImageUpload;
  } catch (error) {
    if (sessionId) await abortUploadSession(sessionId);
    throw error;
  }
}

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
    mutationFn: (request: ImageUploadRequest) => uploadImageFile(showId as ShowId, request),
    onSuccess: () => {
      if (showId) void queryClient.invalidateQueries({ queryKey: imageAssetsQueryKey(showId) });
    },
  });
}
