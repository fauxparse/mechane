// Short readable resource ids (issue #47). Every entity that can appear in
// a URL gets an id of the form `<1-char type prefix><7 random chars>` —
// e.g. `sk3f9qa` for a Show — stored as the row's actual primary key
// rather than translated at a boundary. One form only: the same string is
// in the database, in the URL, and in the logs.
//
// The alphabet deliberately omits characters that are ambiguous when read
// aloud or off a screen (`0`/`O`, `1`/`I`/`l`) plus `u` (so ids are less
// likely to spell something). Mechanē is theatre software: an id gets
// read across a dark auditorium, and legibility matters more than the
// density base62 would buy.
//
// These ids are NOT secrets and NOT capability tokens. Access is gated by
// the ownership check in `./ownership` — 7 random characters aren't
// practically enumerable, but nothing here should be treated as an authz
// boundary.

/** Characters an id body may contain. No `0`, `1`, `i`, `l`, `o`, `u`. */
const ALPHABET = "23456789abcdefghjkmnpqrstvwxyz";

/** Random characters after the type prefix. */
const BODY_LENGTH = 7;

/**
 * Type prefixes, one per entity that can appear in a URL. Only `show`
 * exists today; `scene`/`block` are registered ahead of the tables so the
 * letters are allocated in one place (see `ENTITY_BY_PREFIX` below, which
 * makes a duplicate prefix a compile error rather than a discovery months
 * later).
 */
export const ID_PREFIXES = {
  show: "s",
  scene: "c",
  block: "b",
  // Show graph (issue #38). Nodes are identified by their kind rather than
  // by a single "node" prefix, so an id says what it points at without a
  // lookup — a Navigate edge's endpoints being `c…` ids is visible in a log
  // line. `graph` identifies a draft/published graph revision.
  graph: "g",
  flow: "f",
  source: "r",
  transformer: "t",
  device: "d",
  variable: "v",
  edge: "e",
} as const;

export type EntityName = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[EntityName];

// The reverse mapping, which exists to be type-checked rather than called.
// If two entities above were given the same prefix, this object could no
// longer name every entity, and the `satisfies` below would fail: the
// collision surfaces at the point of adding the prefix.
const ENTITY_BY_PREFIX = {
  s: "show",
  c: "scene",
  b: "block",
  g: "graph",
  f: "flow",
  r: "source",
  t: "transformer",
  d: "device",
  v: "variable",
  e: "edge",
} as const satisfies Record<IdPrefix, EntityName>;

// ...and this asserts the other direction: every entity is reachable from
// some prefix. Together the two make `ID_PREFIXES` a proven bijection.
type _EveryEntityHasItsOwnPrefix = (typeof ENTITY_BY_PREFIX)[IdPrefix] extends EntityName
  ? EntityName extends (typeof ENTITY_BY_PREFIX)[IdPrefix]
    ? true
    : ["Duplicate id prefix in ID_PREFIXES — every entity needs its own letter"]
  : never;
const _assertPrefixesAreUnique: _EveryEntityHasItsOwnPrefix = true;
void _assertPrefixesAreUnique;

/**
 * A resource id, branded with the entity it identifies. The prefix already
 * encodes the type at runtime; the brand makes the compiler agree, so
 * passing a `SceneId` where a `ShowId` is expected doesn't type-check.
 */
export type Id<E extends EntityName> = string & { readonly __entity: E };

export type ShowId = Id<"show">;
export type SceneId = Id<"scene">;
export type BlockId = Id<"block">;
export type GraphId = Id<"graph">;
export type FlowId = Id<"flow">;
export type SourceId = Id<"source">;
export type TransformerId = Id<"transformer">;
export type DeviceId = Id<"device">;
export type VariableId = Id<"variable">;
export type EdgeId = Id<"edge">;

export class InvalidIdError extends Error {
  constructor(entity: EntityName, reason: string) {
    super(`Invalid ${entity} id: ${reason}`);
    this.name = "InvalidIdError";
  }
}

/**
 * Picks `count` characters from `ALPHABET` uniformly. Uses rejection
 * sampling rather than `% ALPHABET.length`, which would bias the first
 * `256 % 30` characters of the alphabet towards being picked more often.
 */
function randomChars(count: number): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < count) {
    const bytes = new Uint8Array(count - out.length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit) {
        out += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return out;
}

/**
 * Generates a fresh id for `entity`. Ids are random, so callers inserting
 * one must handle the (astronomically unlikely, but not impossible)
 * primary-key collision — see `withUniqueId` in apps/api/src/db/ids.ts.
 */
export function generateId<E extends EntityName>(entity: E): Id<E> {
  return `${ID_PREFIXES[entity]}${randomChars(BODY_LENGTH)}` as Id<E>;
}

/** Whether `value` is a well-formed id for `entity`. */
export function isId<E extends EntityName>(entity: E, value: string): value is Id<E> {
  if (value.length !== BODY_LENGTH + 1) return false;
  if (value[0] !== ID_PREFIXES[entity]) return false;
  for (const char of value.slice(1)) {
    if (!ALPHABET.includes(char)) return false;
  }
  return true;
}

/**
 * Narrows `value` to an `Id<E>`, throwing `InvalidIdError` if it isn't one.
 * Use this wherever an id arrives from outside the system — a URL param, a
 * GraphQL argument — so a malformed id fails at the edge rather than
 * turning into a confusing "not found" further in.
 */
export function assertValidId<E extends EntityName>(entity: E, value: string): Id<E> {
  if (!isId(entity, value)) {
    throw new InvalidIdError(
      entity,
      `expected "${ID_PREFIXES[entity]}" followed by ${BODY_LENGTH} characters from "${ALPHABET}".`,
    );
  }
  return value;
}
