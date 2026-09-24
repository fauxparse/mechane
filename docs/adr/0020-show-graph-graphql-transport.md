# Show graph GraphQL reads decode through one shared adapter

- Status: Accepted
- Issue: [One shared Show graph decoder for Studio and Player](https://github.com/fauxparse/mechane/issues/742)

A Show graph GraphQL read becomes a domain `ShowGraph` in one shared decoder beside `decodeCanvasDocument`, the same way [[0014]] made Canvas reads decode once. Studio and Player had grown two full reconstructions of the same wire vocabulary — eight matching converters each, one over typed gql.tada results and one over `unknown` — so the seam had two adapters and no agreement about what the wire means. The decoder resolves `__typename` to the domain discriminator, aliases, recursive Types, Shape Fields, Blocks, Cues, Actions and bindings; the API's outbound serializer remains the one adapter in the other direction.

Two adapters made the seam real; two implementations made it wrong. The hosts disagreed about Shape Field ordering, about how a Transformer subtype is identified, about whether an Action discriminates on `__typename` or its wire `kind`, and about how absence is spelled — and each disagreement was invisible from either side alone.

**Selection is shared for the intersection, not for everything.** Both documents spread one fragment covering the graph every host needs; the Show Editor spreads a second fragment for what only an editor reads — `editorMetadata`, edge `layout`, Flow `size`, Transformer authoring detail. The obvious alternative, one fragment both documents spread, gives a simpler input type at the cost of shipping editor-only payload to every audience phone in the venue, which [[0001]] makes a real cost rather than a theoretical one: those phones are on cellular. Editor-only fields are therefore conditional on the caller's selection, and the decoder says so in its interface. The alternative we rejected more firmly was two decode entry points, which is two interfaces again, and reintroduces exactly the drift this replaces.

**Absence is spelled `null`.** A Show graph is authored structure, so it follows the same rule as any other authored structure (CONTEXT.md, _Typed Absence_) at rest and in transit alike. Studio already did this; the Player stripped nulls wholesale and then rescued `parentId` by hand, which is how the rule got lost for every field nobody remembered to rescue.

**A malformed document throws.** An unknown kind means the client is older than the server — a version problem, not a data problem — and decoding around it produces a Show quietly missing wiring nobody asked to lose. [[0016]] already owns where such a failure goes: a Run Error, recorded by the host that caught it. This replaced four silent substitutions, two of which manufactured a Formula whose text was the literal string `"undefined"` and a Shuffle Transformer nobody authored.

The decoder owns whether a document can be reconstructed at all: unknown kinds, duplicate identity, and references that resolve to nothing. It does not own whether the result is a legal Show graph. Type compatibility, Wiring Conversion validity, Block Reference Graph acyclicity and the rule that every Device a Flow drives must agree on how many Instances it has stay in `@mechane/domain`, where the Shapes and Types they need are already resolved. Duplicating them at the transport seam would mean maintaining them twice.

The result carries the read's own facts — `showId`, `state`, `updatedAt`, `version` — beside the graph rather than inside it. Both hosts need `version`: [[0006]] has Studio send edits against a base version, and the Player stamps it onto every Event it submits. It stays out of the domain value because it describes one read, not the graph: two reads of an unchanged graph can carry different versions, and folding it in would make every construction site invent one.

Deciding there is no graph yet is the host's job, not the decoder's. A query that has not resolved is a loading state, and the decoder requires a document.
