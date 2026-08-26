# Add Source type editing to the graph inspector

## Problem

The graph inspector cannot change the type of a selected Source node. Source types determine exposed fields, source defaults, and wiring compatibility, so a type change must account for connected graph data instead of mutating the node in isolation.

## Scope

Add a type-editing section to the single-selection Source-node inspector using the existing `TypeSelect` component.

A type change must:

- Apply immediately when it has no user-visible loss or broken connection.
- Preflight only the wiring and saved values that the new type would invalidate.
- Show a non-dismissible confirmation dialog only when a connection or saved value needs removal or loses information.
- Keep lossless coercions and compatible exact-path values without a confirmation.
- Treat defaults as dormant while a compatible incoming connection drives the Source.
- Remove only invalid field mappings and stale defaults; never heuristically rename or remap paths.
- Avoid cascading changes to connected nodes.
- Leave Navigate and Device edges untouched.
- Explain consequences in user-facing terms rather than internal edge, path, or type jargon.
- Apply the type change and cleanup as one undoable composite operation.
- Recompute the plan immediately before confirmation is applied and refresh the dialog if the graph changed.
- Persist through the existing graph edit, command, GraphQL, and save flows.

## Acceptance criteria

- The type section is visible only for exactly one selected Source node.
- All valid `TypeSelect` options are available without opaque impact counts.
- Lossless changes do not open a dialog.
- Impactful changes explain which connections or saved values need attention in plain language.
- Cancelling makes no graph or history change.
- Confirming uses one graph command/history entry and supports undo/redo.
- Invalid wiring is removed at edge or field-mapping granularity according to the existing graph model.
- Compatible defaults remain; incompatible or stale paths are removed only after confirmation unless a compatible incoming connection makes them dormant.
- Existing save/reload and server validation continue to work.

## Non-goals

- Multi-selection type editing.
- Transformer, Scene, Flow, or Device type editing.
- Automatic updates to neighboring node types.
- Heuristic field renames or path migration.
