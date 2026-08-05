# Cloud-hosted architecture, no local venue server

Live theatre venues have unreliable internet, which would normally push toward a local-first/offline-capable architecture for the show-running system. We chose full cloud hosting (Vercel) instead, with no local-server fallback, because: audience phones connect over cellular (not venue WiFi) regardless of venue connectivity, and the director's own internet quality is contractually part of the venue hire agreement rather than something the app needs to route around. A local server would still need to solve internet-dependent sync for the majority of Devices (audience phones), so it wouldn't remove the internet dependency — it would only add a second architecture to maintain.

**Consequence**: a v1 show cannot run at all if the director's venue connection fails. This is an accepted risk, not an oversight.
