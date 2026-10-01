// Which other Studio windows have the same Show open (issue #857), so the last
// one to close can offer to end a Run nobody would be left watching.
//
// Each window announces itself on a per-Show BroadcastChannel; every window
// that hears an arrival answers, so a newcomer learns who was already there,
// and a window says goodbye when its page goes away. Re-joining clears the
// roster and asks again, which forgets any window that died without saying
// goodbye. Until that happens such a window is still counted, and the cost of
// that is a missed prompt, never a spurious one.

const MESSAGE_TYPES = ["arrive", "present", "depart"] as const;

type PresenceMessage = {
  type: (typeof MESSAGE_TYPES)[number];
  windowId: string;
};

function isPresenceMessage(data: unknown): data is PresenceMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    MESSAGE_TYPES.some((type) => type === data.type) &&
    "windowId" in data &&
    typeof data.windowId === "string"
  );
}

export interface ShowWindowPresence {
  /** Announce this window, or, if already announced, take a fresh roll call. */
  join(): void;
  /** Say goodbye and stop listening until the next `join`. */
  leave(): void;
  /** How many other windows currently have this Show open. */
  otherWindows(): number;
}

export function createShowWindowPresence({
  showId,
  windowId = crypto.randomUUID(),
}: {
  showId: string;
  windowId?: string;
}): ShowWindowPresence {
  const others = new Set<string>();
  let channel: BroadcastChannel | null = null;

  const post = (type: PresenceMessage["type"]) =>
    channel?.postMessage({ type, windowId } satisfies PresenceMessage);

  const receive = ({ data }: MessageEvent<unknown>) => {
    if (!isPresenceMessage(data) || data.windowId === windowId) return;
    if (data.type === "depart") {
      others.delete(data.windowId);
      return;
    }
    others.add(data.windowId);
    if (data.type === "arrive") post("present");
  };

  return {
    join() {
      others.clear();
      if (!channel) {
        channel = new BroadcastChannel(`mechane:studio-windows:${showId}`);
        channel.addEventListener("message", receive);
      }
      post("arrive");
    },
    leave() {
      if (!channel) return;
      post("depart");
      channel.close();
      channel = null;
      others.clear();
    },
    otherWindows: () => others.size,
  };
}
