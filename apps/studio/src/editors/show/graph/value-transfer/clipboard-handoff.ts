// The browser side of Source-value Copy/Paste (#890's accepted adapter
// conclusions): one chosen handoff per gesture, native Paste from its event
// `clipboardData` only, no second read to discover concealed custom data,
// and serialized submitted writes that never fire on readiness or focus
// return.
//
// Recognized representations travel as mandatory portable `text/plain`
// plus any custom `mechane` format the same read exposes; the strict codec
// (decodeValueHandoff) compares what one handoff actually contains.
import type { ValueHandoff } from "@mechane/domain/value-transfer";

import { browserFailure } from "./value-transfer-state";

/** Media types this adapter collects for one handoff. */
function isPortableMediaType(type: string): boolean {
  return type === "text/plain" || type.toLowerCase().includes("mechane");
}

/**
 * The representations a native Paste event exposed — nothing else. A missing
 * `text/plain` yields null: the portable path is mandatory, so an event
 * carrying only unrecognized formats is not a value paste.
 */
export function handoffFromDataTransfer(data: DataTransfer): ValueHandoff | null {
  const handoff: { mediaType: string; text: string }[] = [];
  for (const type of data.types) {
    if (!isPortableMediaType(type)) continue;
    const text = data.getData(type);
    if (text) handoff.push({ mediaType: type, text });
  }
  return handoff.some((entry) => entry.mediaType === "text/plain") ? handoff : null;
}

/** Reading the clipboard asynchronously failed or was denied. */
export class ClipboardReadDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClipboardReadDeniedError";
  }
}

/**
 * One chosen async read, exposed to the codec as an immutable handoff.
 * Throws {@link ClipboardReadDeniedError} on denial, missing API or lost
 * focus; the caller offers an explicit native-Paste focus action and never
 * reads again (#872/#876).
 */
export async function readHandoffOnce(): Promise<ValueHandoff> {
  if (!navigator.clipboard?.read) {
    throw new ClipboardReadDeniedError("This browser cannot read the clipboard asynchronously.");
  }
  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch (reason) {
    throw new ClipboardReadDeniedError(
      reason instanceof Error ? reason.message : "The clipboard read was refused.",
    );
  }
  const pending: Promise<{ mediaType: string; text: string }>[] = [];
  for (const item of items) {
    for (const type of item.types) {
      if (!isPortableMediaType(type)) continue;
      pending.push(
        item
          .getType(type)
          .then((blob) => blob.text())
          .then((text) => ({ mediaType: type, text })),
      );
    }
  }
  const handoff = (await Promise.all(pending)).filter((entry) => entry.text.length > 0);
  if (!handoff.some((entry) => entry.mediaType === "text/plain")) {
    throw new ClipboardReadDeniedError("The clipboard holds no portable text representation.");
  }
  return handoff;
}

/**
 * Why an async read denial still leaves a path forward: focus the value
 * region and use native Paste, whose event data needs no permission.
 */
export const NATIVE_PASTE_AFTER_DENIAL = browserFailure(
  "browser-read",
  "The clipboard could not be read for this page.",
  "Focus the value region and use native Paste instead; no second automatic read is made.",
);

/** Writes are submitted one at a time; none is cancelled or rolled back. */
let writeQueue: Promise<unknown> = Promise.resolve();

export function serializeWrite(write: () => Promise<void>): Promise<void> {
  const next = writeQueue.then(write, write);
  writeQueue = next.catch(() => undefined);
  return next;
}

/** The submitted write of prepared immutable text; `text/plain` only. */
export function writeClipboardText(text: string): Promise<void> {
  return serializeWrite(async () => {
    if (!navigator.clipboard?.write) {
      throw new Error("This browser cannot write to the clipboard.");
    }
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }) }),
    ]);
  });
}
