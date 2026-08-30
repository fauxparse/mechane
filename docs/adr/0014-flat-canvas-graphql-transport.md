# Canvas GraphQL transport uses flat typed Elements

Canvas hierarchies have no authored depth limit, while a recursive GraphQL selection always has a finite one. GraphQL Canvas reads therefore expose a flat, typed Element list with parent identity and rank; one strict decoder beside the schema reconstructs the Canvas, requires exactly one parentless root Frame, uses rank for stacking order, and rejects invalid topology before Studio or Player receives it.

The public interface stays small: Studio and Player share the Canvas document decoder, while `@mechane/commands` owns exhaustive transport-neutral encoding and decoding for workspace edits. Canvas content edits cover Element membership, Properties, parentage, and stacking order; Artboard movement is a separate workspace edit because Artboard framing is not Canvas content. Host adapters retain direction policy and user-facing errors.

This replaces the recursive typed tree, which imposed a depth cap; a JSON scalar, which would discard GraphQL's Element typing; and a caller-first document interface, which would pull owner and Artboard facts into the Canvas seam. The schema, Studio, Player, server adapters, generated types, and edit discriminators cut over together without compatibility aliases.
