import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShowId } from "@mechane/domain";

import { uploadImageFile } from "./images";

type FakeRequest = {
  status: number;
  withCredentials: boolean;
  upload: {
    onprogress:
      | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
      | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  open: (method: string, url: string) => void;
  setRequestHeader: (name: string, value: string) => void;
  send: (body: File) => void;
  abort: () => void;
};

const createRequestClass = (onSend: (request: FakeRequest) => void) => {
  class Request implements FakeRequest {
    status = 200;
    withCredentials = false;
    upload = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn(() => onSend(this));
    abort = vi.fn(() => this.onabort?.());
  }
  return Request;
};

const beginResponse = {
  data: {
    beginImageUpload: {
      id: "session-1",
      expiresAt: "2099-01-01T00:00:00.000Z",
      constraints: {
        maxSourceBytes: 1,
        maxPixels: 1,
        maxAxis: 1,
        maxNormalizedBytes: 1,
        sessionTtlMs: 1,
        candidateTtlMs: 1,
      },
      plan: { method: "PUT", url: "/uploads/session-1", requiredHeaders: {} },
    },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("uploadImageFile", () => {
  it("reports byte progress and sends authenticated upload requests", async () => {
    const fetchMock = vi.fn(async () => {
      const response =
        fetchMock.mock.calls.length === 1
          ? beginResponse
          : fetchMock.mock.calls.length === 2
            ? { data: { completeImageUpload: { sessionId: "session-1" } } }
            : {
                data: {
                  finalizeImageUpload: {
                    id: "asset-1",
                    revision: "1",
                    url: "/assets/asset-1",
                    width: 640,
                    height: 480,
                    mimeType: "image/png",
                    name: "photo.png",
                    alt: "",
                    blurHash: null,
                  },
                },
              };
      return new Response(JSON.stringify(response), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    let uploadRequest: FakeRequest | null = null;
    vi.stubGlobal(
      "XMLHttpRequest",
      createRequestClass((request) => {
        uploadRequest = request;
        request.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        queueMicrotask(() => request.onload?.());
      }),
    );
    const progress: number[] = [];

    const result = await uploadImageFile("show-1" as ShowId, {
      file: new File(["image"], "photo.png", { type: "image/png" }),
      onProgress: (value) => progress.push(value),
    });

    expect(result.id).toBe("asset-1");
    expect((uploadRequest as FakeRequest | null)?.withCredentials).toBe(true);
    expect(progress).toEqual([50, 100]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(fetchMock.mock.calls[2])).toContain('\\"name\\":\\"photo.png\\"');
  });

  it("aborts the server session when the PUT is cancelled", async () => {
    const fetchMock = vi.fn(async () => {
      const response =
        fetchMock.mock.calls.length === 1 ? beginResponse : { data: { abortImageUpload: true } };
      return new Response(JSON.stringify(response), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "XMLHttpRequest",
      createRequestClass(() => {}),
    );
    const controller = new AbortController();
    const upload = uploadImageFile("show-1" as ShowId, {
      file: new File(["image"], "photo.png", { type: "image/png" }),
      signal: controller.signal,
    });

    await Promise.resolve();
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fetchMock.mock.calls[1])).toContain("AbortImageUpload");
  });
});
