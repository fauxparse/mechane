# GraphQL graph edges use an interface and concrete edge types

- Status: Accepted
- Issue: #123

## Decision

The GraphQL output representation of Show graph edges is a `GraphEdge` interface implemented by `WiringEdge`, `NavigateEdge`, and `DeviceEdge`.

`GraphEdge` contains only `id`, `sourceId`, `targetId`, `sourcePath`, and `targetPath`. Wiring-only fields (`fieldMapping`, `targetVariableId`) live on `WiringEdge`; navigate-only fields (`cueId`, `actionId`) live on `NavigateEdge`; `DeviceEdge` has no additional fields. The output `kind` discriminator is not exposed; clients use `__typename`.

`ShowGraph.edges` and `GraphEdit.edge` use the same interface. The API resolves the existing domain edge discriminator to the concrete GraphQL type and rejects unknown kinds.

`GraphEdgeInput` remains flat because GraphQL input objects cannot use output interfaces or unions. The domain discriminated union and persistence model remain unchanged.

## Consequences

- gql.tada clients use inline fragments for edge-specific fields.
- Studio converts `__typename` back into the domain's existing edge union.
- GraphQL operations must use distinct aliases when concrete implementations have incompatible field types; the Show graph query validates against the generated schema in tests.
- The old flat output is a breaking schema change, consistent with #102's node migration.
