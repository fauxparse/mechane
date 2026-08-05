# Undo/redo is implemented as forward commands, not a rollback primitive

The editors' undo/redo stack does not have a server-side "undo" concept. Undoing a local change computes the inverse of that change and sends it to the server as an ordinary forward command — the same path any other edit takes. There is no special undo RPC, no version rollback, and no server-side history semantics beyond "apply this command."

This keeps the sync model uniform (every mutation, including an undo, is just a command applied and propagated like any other) and sidesteps the much harder problem of what "undo" should mean once other propagated state (e.g. another connected client's view, or published versions) has moved on since the original change. Undo/redo itself is session-local (an in-memory stack, cleared on reload) — it is a client-side convenience for composing the next forward command, not a durable history feature.
