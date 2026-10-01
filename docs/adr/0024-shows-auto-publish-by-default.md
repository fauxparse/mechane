# Shows auto-publish by default; staged publishing is opt-in

- Status: Accepted
- Issue: [Auto-publish](https://github.com/fauxparse/mechane/issues/856)
- Amends: [[0002]]

[[0002]] made every structural change wait in a draft for an explicit whole-Show publish. Directors found the split confusing: an edit that saved but did not appear on the projector read as a bug. A Show now carries an Auto-publish setting, on by default and for existing Shows, under which the server publishes the draft in the same transaction that accepts each edit batch, and Studio hides every publish control. Turning Auto-publish off restores [[0002]] exactly; turning it back on publishes a pending draft at once, because the control that would otherwise publish it is hidden.

**Publication happens on the server, inside the edit's transaction.** Publishing from Studio after each save would be a second request that another client can skip and that can fail after the edit committed, leaving Devices behind a draft with no control to catch them up. Running [[0006]]'s edit and the publication in one transaction means both commit or neither does. The edit takes the Show row lock first, as publication and Run start do, so the three serialise in one order.

**An unpublishable draft does not refuse the edit.** A draft is routinely unpublishable mid-edit — a Calculate Transformer before its Formula exists, an Element Formula with a blocking diagnostic. Publication runs in a savepoint; when it refuses, the savepoint rolls back whatever it had reconciled, the edit commits, and the published graph stays on the last publishable version. The edit response says whether it was published. The existing inline diagnostics ("blocks publishing") remain the explanation, and Go live still publishes first when the draft is ahead, which surfaces the refusal.

**Consequences worth naming:**

- Structural edits reach Devices mid-Run. [[0002]]'s argument against that — an in-progress Cue could reference an Element that no longer exists — is now a risk the director accepts by default and can opt out of per Show.
- Deleting a Device retires it and releases its Custom Domain at the next publication, which is now the edit itself. Undo restores the Device but not the domain binding.
- Every accepted batch is a publication, so every batch invalidates connected Players. The editor's save debounce is what bounds the rate.
- A new Show publishes its starter graph when it is created, so its Devices show the starter Scene before the first edit.
