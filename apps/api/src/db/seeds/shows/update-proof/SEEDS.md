---
name: Update Proof
description: A proof fixture for shared navigation and Update Action propagation
---

# Update Proof

This fixture reserves the Update Proof seed name and keeps its graph isolated from Voting. It supplies the same deterministic navigation harness used for shared-device dispatch while the Update Action graph and live-value proof are added by the downstream authoring and dispatch slices.

The proof contract is: two Shared Devices and one Audience Device observe a shared Flow, and all emitted Player Events use the normalized Run state and sequenced invalidation path.
