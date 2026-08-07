// Shared Command/undo-redo engine used by both the Canvas and Flow editors
// in studio (issue #41, PRD §6.3). Undo is implemented by sending the
// inverse of a change as an ordinary forward command — see
// docs/adr/0005-undo-as-forward-commands.md — and the stack is session-local,
// unlike the draft graph (ADR-0002).
//
// Three modules, in the order worth reading them:
//
//   ./command        what a Command is, and how one produces its inverse
//   ./stack          the undo/redo stack, including open gestures
//   ./graph-commands the primitive Show-graph commands built on both
//   ./graph-cascade  what one user-facing delete is made of (#42)
export * from "./command";
export * from "./graph-cascade";
export * from "./graph-commands";
export * from "./graph-edits";
export * from "./stack";
