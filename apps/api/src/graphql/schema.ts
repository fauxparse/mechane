// The served GraphQL schema: nothing but assembly. Each sibling slice owns
// its feature's SDL and resolver policy — serialization, authorization,
// validation, and how a domain refusal becomes a GraphQL error — and exposes
// `typeDefs` and `resolvers` this module composes. What stays here is the one
// thing genuinely global: the JSON scalar every slice's loose payloads use.
import { GraphQLScalarType, Kind } from "graphql";
import { createSchema } from "graphql-yoga";

import type { GraphQLContext } from "./context";
import * as canvas from "./canvas";
import * as images from "./images";
import * as playerSession from "./player-session";
import * as runs from "./runs";
import * as show from "./show";
import * as showGraph from "./show-graph";
import * as user from "./user";

const jsonScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (node) => {
    if (node.kind === Kind.STRING) return node.value;
    if (node.kind === Kind.BOOLEAN) return node.value;
    if (node.kind === Kind.INT || node.kind === Kind.FLOAT) return Number(node.value);
    if (node.kind === Kind.NULL) return null;
    if (node.kind === Kind.LIST)
      return node.values.map((value) => (value.kind === Kind.STRING ? value.value : null));
    if (node.kind === Kind.OBJECT)
      return Object.fromEntries(node.fields.map((field) => [field.name.value, null]));
    return null;
  },
});

export const schema = createSchema<GraphQLContext>({
  typeDefs: [
    /* GraphQL */ `scalar JSON`,
    user.typeDefs,
    show.typeDefs,
    runs.typeDefs,
    playerSession.typeDefs,
    showGraph.typeDefs,
    canvas.typeDefs,
    images.typeDefs,
  ],
  resolvers: [
    { JSON: jsonScalar },
    user.resolvers,
    show.resolvers,
    runs.resolvers,
    playerSession.resolvers,
    showGraph.resolvers,
    canvas.resolvers,
    images.resolvers,
  ],
});
