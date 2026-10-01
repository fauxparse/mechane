// Show-level events for the Studio windows editing a Show (issue #467).
//
// Everything on this channel is advisory: it prompts or refreshes a Studio
// window, and nothing a Player or a Run depends on waits for it. A provider
// outage therefore must not fail the request that caused the event.
import { showChannel, type RealtimeProvider, type ShowChannelEvent } from "@mechane/realtime";

import { realtimeProvider } from "./realtime";

export async function publishShowEvent(
  showId: string,
  event: ShowChannelEvent,
  provider: RealtimeProvider = realtimeProvider,
): Promise<void> {
  try {
    await provider.channel(showChannel(showId)).publish(event.type, event.payload);
  } catch {
    // See above: a missed Studio notification is not worth failing the caller.
  }
}
