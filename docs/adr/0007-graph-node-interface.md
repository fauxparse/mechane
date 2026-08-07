# GraphQL graph nodes use an interface and concrete node types

- Status: Accepted
- Issue: #102

## Decision

The GraphQL output representation of Show graph nodes is a `GraphNode` interface implemented by `SceneNode`, `FlowNode`, `SourceNode`, `TransformerNode`, and `DeviceNode`.

`GraphNode` contains only fields shared by every node: `id`, `name`, `parentId`, and `position`. Kind-specific fields live on the concrete types. GraphQL clients use `__typename`; the output `kind` string discriminator is not exposed.

`ShowGraph.nodes` and `GraphEdit.node` use the same interface. The API has one explicit resolver from the domain node discriminator to the GraphQL concrete typename and rejects unknown kinds.

`GraphNodeInput` remains flat. GraphQL has no output-interface equivalent for input objects, and redesigning the edit protocol with `@oneOf` is a separate concern.

## Consequences

- gql.tada clients must use inline fragments for kind-specific fields.
- Studio converts `__typename` back into the domain's existing discriminated union.
- A newly-created Device may have a nullable `pairingCode` until its first save; the schema reflects that lifecycle.
- The domain model, database schema, and persistence representation remain unchanged.
- `GraphEdge` remains a flat type and is deferred to a follow-up decision because its variants have different semantics and the benefit is smaller.

## Rationale

The domain already models nodes as a discriminated union. The old GraphQL object flattened that union into a bag of nullable fields, allowing invalid combinations and forcing every client to reconstruct the distinction manually. An interface preserves the genuinely common node surface while letting GraphQL and generated client types express the constraints.
