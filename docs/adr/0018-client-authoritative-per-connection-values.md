# ADR-0018: Client-authoritative per-connection values

- Status: Accepted
- Date: 2026-09-09

## Context

A Flow-local Source has one current value per Device Instance. A per-connection Audience Device cannot have its anonymous connection state reconstructed safely by the server: the server does not persist connection identity, and a later snapshot may no longer describe the browser's rendered instance.

## Decision

The Player owns the current values for Flow-local Sources on a per-connection Device. It persists them in its versioned local aggregate beside navigation and its instance-scoped Structured Value records. The server owns Show-scoped Sources and the state of Shared Device Instances.

A Player composes Show scope and Instance scope as a disjoint union before resolving Scene Variables. Show snapshots replace Show scope only; they never overwrite Instance scope. Republication reconciles instance values by Source and Field identity, preserving compatible values and dropping only removed Sources. Changing the driving Flow or starting a new Run resets the instance scope.

A per-connection Event submits only the resolved evidence needed for a Show write. The server validates that evidence against current Show state and never treats it as authoritative instance storage.

## Consequences

Per-connection state survives Show snapshots and does not require server-side connection tracking. A browser reset or a second browser creates a distinct anonymous instance. A stale client-held Structured Value reference degrades to typed absence when the snapshot no longer contains it. Client authority requires the server to validate every Show-scoped reference, type, and reachability before applying a write.
