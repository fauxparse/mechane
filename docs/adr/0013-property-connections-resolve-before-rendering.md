# Property Connections Resolve Before Rendering

Element Properties use literal values or `{ kind: "variable", variableId }` connections. The domain derives the unique coercion from the Variable Type and Property Type, while a shared resolver materializes connected values before both Canvas Editor and Player rendering; this keeps `CanvasRenderer` pure, preserves unresolved connections, and allows runtime values to be supplied later without changing the connection model.

## Consequences

Connectable Canvas fields travel as JSON, Variables must always be typed, and one multi-selection edit must be represented as one composite undoable command. Until live Variable values are available, the resolver uses the Variable Type default and applies the derived coercion.
