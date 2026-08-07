# Ably for realtime pub/sub, behind an internal abstraction

Vercel's native WebSocket support (via Fluid Compute) doesn't provide multicast "room" broadcast — each connection pins to one function instance with no shared in-memory state, so fan-out to many Devices per Run would need to be built from scratch (e.g. Redis pub/sub). We evaluated Ably vs. PartyKit as managed alternatives: PartyKit is now a thin layer over Cloudflare Durable Objects — it would mean running and operating a second infrastructure stack (Cloudflare) alongside Vercel, and building ordering/delivery-guarantee/reconnection logic ourselves on top of it. Ably is a single API call from the existing Vercel/GraphQL backend and provides ordered, guaranteed delivery, presence, and reconnection catch-up natively.

We chose Ably, but the director explicitly wants to avoid vendor lock-in (cost or product risk), so all realtime publish/subscribe calls go through a small internal interface (e.g. `RealtimeChannel.publish()`/`.subscribe()`) rather than calling the Ably SDK directly from application code. Swapping the implementation later (to Pusher, or a self-hosted alternative) means changing one adapter, not every call site.

**Considered and rejected**: PartyKit/Cloudflare Durable Objects (extra infra stack to operate), DIY Postgres LISTEN/NOTIFY + Redis (reinvents delivery guarantees Ably provides out of the box).

## Local development adapter

Local development uses a deliberately separate WebSocket adapter selected by
`REALTIME_PROVIDER=websocket` (the default outside production). It runs in the
local API process and keeps a bounded in-memory replay buffer. Messages are
ordered and reconnecting clients can resume from a sequence cursor; when the
cursor has fallen out of the buffer, the adapter sends `snapshot-required` and
the client must refetch authoritative state through GraphQL.

This adapter is intentionally not a production fallback: it is single-process,
non-durable, and has no cross-instance fan-out. Production and staging use
`REALTIME_PROVIDER=ably`; missing Ably credentials fail startup rather than
silently disabling realtime.
