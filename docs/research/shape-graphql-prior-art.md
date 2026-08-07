# Prior art: user-defined types over a static GraphQL schema

Research for [#92](https://github.com/fauxparse/mechane/issues/92), part of map [#90](https://github.com/fauxparse/mechane/issues/90).
Date: 2026-08-07. All claims cited to primary sources (vendor docs, the GraphQL spec, library source/releases).

## The question

Mechanē's `Shape` is a structured type authored **per Show, at runtime**, and (per #90) a Shape edit can be published *mid-Run*. GraphQL's type system is static and introspectable. So: how do comparable products bridge that, and what does each trade away?

Four axes are tracked throughout: **(a)** how a client learns a type's structure, **(b)** how values are validated, **(c)** whether codegen still works for the rest of the schema, **(d)** the operational cost of regenerating a schema when a user edits a type.

---

## 1. Headline finding

Two families exist, and nothing in between:

| Family | Who | Type structure lives in… | Cost |
|---|---|---|---|
| **Generated SDL per tenant** | Contentful, Sanity, Hygraph, Strapi | the GraphQL schema itself | schema regeneration on every model edit; client codegen artifacts go stale immediately |
| **Static schema + JSON discriminated union + separate metadata endpoint** | Airtable, Notion | a `type` string tag plus a config bag, fetched separately and correlated at runtime | no static typing of user fields at all; no field selection |

And crucially: **not one of the six encodes user-authored validation rules in the type system.** Validation is universally an application-layer concern, surfaced as mutation errors, with the real rules carried on a *separate metadata channel*.

---

## 2. Generated-SDL products

### Contentful — request-time generation

> "Each Contentful space comes with a GraphQL schema based on its content model. This GraphQL schema is generated at request time and is always up-to-date with the current status of the space."
> — <https://www.contentful.com/developers/docs/references/graphql/>

- **(a)** Standard introspection at `https://graphql.contentful.com/content/v1/spaces/{SPACE}/environments/{ENV}`. Richer alternative: the CMA `GET /spaces/{id}/environments/{env}/content_types` returns per-field `type`, `required`, `localized`, `validations` verbatim (<https://www.contentful.com/developers/docs/references/content-management-api/>).
- **(b)** Only `linkContentType` reaches the type system (narrowing reference fields). `size`, `regexp`, `in`, `range`, `unique` are publish-time only: *"Validations will take effect after the content type has been activated and existing entries will not be validated until they are re-published."* `required` does **not** become non-null — everything is nullable, arguably forced by localisation (fields take a `locale` argument, and `useFallbackLocale: false` "returns `null` if no value exists in the requested locale").
- **(c)** Yes — Contentful ships an official `codegen.ts` (see `contentful/template-marketing-webapp-nextjs-non-technical-onboarding`) running `introspection` + `schema-ast` + `typescript-operations` against the live endpoint. The server needs no regeneration; **client artifacts are a snapshot and must be re-run.**
- **(d)** Zero deploy step, no documented propagation lag. Schema generation *fails* on type-name collisions or field IDs colliding with `sys`/`contentfulMetadata`/`linkedFrom` — i.e. the user's model edit can break the whole API surface.

### Sanity — explicit deploy, and an explicit retreat from GraphQL

> "Keep in mind that changing the schema in your local Sanity studio does not automatically change the GraphQL API. You'll have to run `sanity graphql deploy` to make the API reflect the changes."
> — <https://www.sanity.io/docs/graphql>

The most instructive precedent, because Sanity treats GraphQL as an *optional projection* of a schemaless store and steers users away from it:

> "GROQ is the native query language for the Sanity Content Lake. GraphQL is a generated, typed layer based on your schema… GraphQL requires every join point to be a schema-declared field with a resolver. GROQ traverses any `_ref` value at query time, with no schema changes or server redeploy. **Adding a new traversal is a query edit, not a deployment.**"

- **(a)** Introspection on the deployed endpoint (public — "your GraphQL schema is public, so all types and fields will be introspectable by anonymous users"). Separately, `sanity schemas deploy` (v3.88+) pushes a **JSON manifest** of the schema into the dataset for Sanity's own apps; `sanity schemas extract` dumps it locally. Note this is a *different artifact and a different command* from `graphql deploy` — Sanity maintains both a generated SDL and a machine-readable type-descriptor document.
- **(b)** Explicitly out of band: *"Validation is client-side only — Schema validation rules only run in Sanity Studio. Mutations submitted through the API or client libraries are not checked against your validation rules."* `--non-null-document-fields` affects only built-ins. Mutations are **not exposed via GraphQL at all** — they go through the separate Mutation API.
- **(c)** `sanity schema extract` → `sanity typegen generate` types **GROQ** results, not GraphQL. For GraphQL users the docs redirect to graphql-codegen against the API URL.
- **(d)** The highest-ceremony option, and the only one with a CI safety gate: `sanity graphql deploy` compares against the previously deployed definition and *"If any changes are considered breaking or dangerous, the CLI will warn and ask for confirmation before deploying. In a CI environment, the CLI will exit with a non-zero exit code and fail the build."* `--tag` gives versioned endpoints so old clients keep working. Multi-API deploys are not atomic. Also: *"The schemas for Sanity Studio are more flexible than what GraphQL is able to represent… we can't promise that you'll be able to deploy a GraphQL API without any changes"* — anonymous inline object types must be globally named.

**Read this twice.** Sanity's authoring model is the closest analogue to a Shape (nested, anonymous, user-authored objects) and they report that GraphQL *cannot represent it faithfully*.

### Hygraph — managed-immediate, schema edited over GraphQL

> "All changes to your schema are immediately available via GraphQL."
> — <https://hygraph.com/docs/api-reference/basics/queries>

- **(a)** Introspection per project+environment endpoint. Distinctively, the **schema itself is mutated over GraphQL** via the Management SDK — `submitBatchChanges(data: BatchMigrationInput!)` runs "in a single transaction," "on an 'all or none' basis," rolled back on failure (<https://hygraph.com/docs/api-reference/management-sdk/management-sdk-quickstart>). Only the last 30 migrations' metadata is retained per environment.
- **(b)** Required / unique / character count / pattern are documented as save-time behaviours ("prevents a content entry from being saved if the field is left empty"). Enums do become GraphQL enums. Whether `required` → non-null is **undocumented**; the errors page covers only HTTP codes with no field-validation payload spec. Weakest-evidenced vendor.
- **(c)** Standard graphql-codegen against the project endpoint; server self-regenerates, client types go stale until re-run.
- **(d)** Schema changes immediate. The documented cost is *content* caching, not schema: the regular endpoint "can take up to 30s to update all caching nodes worldwide" and any mutation purges the whole project cache; the High Performance endpoint gives model/stage-scoped invalidation.

### Strapi — boot-time generation, restart required

> "To simplify and automate the build of the GraphQL schema, we introduced the Shadow CRUD feature. It automatically generates the type definitions, queries, mutations and resolvers based on your models."
> — <https://docs.strapi.io/cms/plugins/graphql>

- Content types are **files on disk** (`src/api/[api]/content-types/[ct]/schema.json`), not per-tenant rows; `buildSchema()` runs once in the plugin's `bootstrap()`. There is no multi-tenant story.
- **(b)** Only `required` reaches the type system, and only on **output** types (`builders/type.ts`: `if (attribute.required) builder = builder.nonNull;`) — `builders/input.ts` has no equivalent, so **all inputs are nullable**. `unique`, `min`/`max`, `regex` are runtime-only, surfacing as `ValidationError` → `BAD_USER_INPUT` with `extensions.error.{name,message,details}`. None discoverable by introspection.
- **(c)** `strapi ts:generate-types` produces *backend* types, not client types. And *"In production environments, disabling the GraphQL Sandbox and the introspection query is strongly recommended"* — which is exactly what breaks a codegen-from-endpoint workflow.
- **(d)** Worst of the four: a content-type edit requires a **full process restart**, and the Content-Type Builder is *"Available in Development environment only"* because *"Certain features such as the Content-type Builder are disabled in the `strapi start` mode because they require application restarts."*

---

## 3. Static-schema products (Airtable, Notion)

Both converge on the identical pattern: **a JSON discriminated union tagged by a `type` string, with the schema fetched from a separate metadata endpoint and correlated at runtime.**

| | Airtable | Notion |
|---|---|---|
| Schema fetch | `GET /v0/meta/bases/{baseId}/tables` | `GET /v1/data_sources/{id}` (post-`2025-09-03`; previously `GET /v1/databases/{id}`) |
| Type tag | `field.type` + sibling `options` bag | `property.type` + config nested under a key equal to the tag |
| Record values | **untagged** map keyed by field name or ID | **tagged** union per value: `{id, type, [type]: value}` |
| Coercion | `typecast: true` (best-effort; can *create* select options) | none — `400 validation_error` |
| Stable key | field ID via `returnFieldsByFieldId` | property ID, embedded inside each value |
| Official typegen | none | none |

Sources: <https://airtable.com/developers/web/api/get-base-schema>, <https://airtable.com/developers/web/api/field-model>, <https://airtable.com/developers/web/api/create-records>, <https://developers.notion.com/reference/property-object>, <https://developers.notion.com/reference/page-property-values>, <https://developers.notion.com/reference/status-codes>.

Points worth stealing:

- **Recursive type descriptors.** Airtable's `formula` field carries `options.result`, which is *itself a field-model object* — the descriptor format is recursive, exactly what nested/array Shape members need.
- **Doubly-tagged computed values.** Notion's formula value is `{type: "formula", formula: {type: "number", number: 56}}` — outer tag for the field kind, inner tag for the resulting value kind. Directly applicable to Transformer outputs (#90's open question).
- **Read/write asymmetry is normal.** Airtable documents *three* cell formats (read / write / webhooks) for the same field type. Do not assume one representation serves all directions.
- **Neither typechecks user fields.** `airtable.js` bottoms out at an index signature (`FieldSet`); `@notionhq/client` gives `properties: Record<string, PagePropertyValueWithIdResponse>` — the union of every property type is statically known, but the *name → member* mapping is not, so `page.properties["Status"].select` needs a manual narrow. **The union is closed and typed; the mapping is left open.** That is the design.
- **ID stability.** Notion: property IDs *"remain stable even when property names change."* Airtable: field IDs survive renames but not delete+recreate. Relevant to #90's mid-Run coercion — a Shape field rename must not orphan wiring edges (`source_path`/`target_path` in `apps/api/src/db/schema.ts` are name-ish arrays today).

---

## 4. GraphQL spec & ecosystem

### `@oneOf` — spec-final, and input-only

Merged in [graphql-spec#825](https://github.com/graphql/graphql-spec/pull/825) (2025-09-01), shipped in the [September 2025 spec release](https://spec.graphql.org/September2025/).

> A _OneOf Input Object_ is a special variant of _Input Object_ where exactly one field must be set and non-null, all others being omitted.
> ```graphql
> directive @oneOf on INPUT_OBJECT
> ```

`INPUT_OBJECT` is the **sole** directive location. A follow-up [RFC: OneOf Objects (#948)](https://github.com/graphql/graphql-spec/pull/948) for output-side tagged unions was opened 2022 and **closed unmerged 2025-07-03** — so tagged-union outputs remain the job of `union` / `interface`. Introspection exposes `__Type.isOneOf`.

graphql-js: backported in [v16.9.0](https://github.com/graphql/graphql-js/releases/tag/v16.9.0); **graphql 17 (this repo's version) is stricter** — per the [v16→v17 upgrade guide](https://www.graphql-js.org/upgrade-guides/v16-v17/), "OneOf coercion is stricter around defaults, unknown fields, `undefined`, and values that are present before coercion but invalid after coercion." v17 also adds an **inhabitability check** that rejects a recursive `@oneOf` input object where every branch re-enters the cycle. Practical consequence for a nested Shape input: a self-recursive `ShapeValueInput @oneOf` must have at least one branch escaping via a scalar/enum/list/nullable-non-oneOf field, or schema construction fails.

### JSON scalars — the spec spells out the cost

> "Since this coercion behavior is not observable to clients of the GraphQL service, the precise rules of coercion are left to the implementation."
> — [Section 3 — Type System](https://github.com/graphql/graphql-spec/blob/main/spec/Section%203%20--%20Type%20System.md)

> "If {selectionType} is a scalar or enum: The subselection set of that selection must be empty. A field subselection is not allowed on leaf fields."
> — [Section 5 — Validation](https://github.com/graphql/graphql-spec/blob/main/spec/Section%205%20--%20Validation.md)

So a JSON-scalar Shape value is all-or-nothing: **no field selection, no per-field authorization, no partial fetch, no per-field errors, zero introspectable structure.** The only machine-readable handle is `@specifiedBy`, which is just a URL.

### Yoga 5 dynamic schema — real, but warned against

> "You can also pass a factory function for your schema that can return a `Promise`. The factory function is invoked for **every** GraphQL request."
> "We do not recommend building a GraphQL schema from scratch for every single incoming request. Please, use a caching mechanism or pre-build your GraphQL schemas before starting the server."
> — <https://the-guild.dev/graphql/yoga-server/docs/features/schema>

Caveat: the factory receives the *initial* context (the request), not the built user context ([yoga#2999](https://github.com/dotansimha/graphql-yoga/issues/2999)) — so tenant resolution must be derivable from the request itself. And introspection, persisted-operation validation, and APQ caching all become per-tenant and must be keyed accordingly.

### Stitching / federation

graphql-tools documents [hot schema reloading](https://the-guild.dev/graphql/stitching/handbook/architecture/hot-schema-reloading) — polling subschemas, or "a dedicated mutation that reloads the gateway schema." But it is *gateway-wide*, not per-viewer; N tenants means N gateway schemas you build yourself, which collapses back into the Yoga schema-factory approach.

### graphql-codegen

Build-time only. [Schema field docs](https://the-guild.dev/graphql/codegen/docs/config-reference/schema-field) resolve a schema when the CLI runs; there is **no documented "static core + dynamic tail" pattern** and no per-request/per-tenant concept. The one useful lever is `scalars` in the [TypeScript plugin](https://the-guild.dev/graphql/codegen/plugins/typescript/typescript):

```ts
scalars: { ShapeValue: { input: 'ShapeValueInput', output: 'ShapeValue' } }
```

which points a custom scalar at a hand-written TS discriminated union. The type lives in TypeScript, not the schema; keeping them in sync is your job.

### Is the spec silent on runtime type systems?

Yes. No RFC, no stage-N proposal, no normative text for runtime-mutable or per-viewer type systems. The only sanctioned polymorphism is `union`/`interface` (output) and `@oneOf` (input). Nearest primary-source treatments are implementation-level: [GraphQLConf 2023, "Scaling Schema Cardinality: Constructing Types at Runtime"](https://graphql.org/conf/2023/sessions/e447a52591ed66a452e04d6ce3e3f09e/) (static core + per-privilege dynamic parts mediated by a "metaschema"), and [graphql-ruby's dynamic types / `Schema::Visibility`](https://graphql-ruby.org/schema/dynamic_types.html).

---

## 5. Recommendation for Mechanē

**Static schema + a recursive, introspectable Shape *descriptor* + a fixed `ShapeValue` union for reads + a `@oneOf` input for writes.** Do not generate SDL per Show.

The deciding constraint is #90's own ground rule: *"publishing a Shape edit mid-Run coerces live values to the new Shape."* Every generated-SDL vendor pays a schema-regeneration tax on model edit — Strapi a process restart, Sanity a CLI deploy with a CI breaking-change gate, Contentful/Hygraph a silent client-artifact staleness. Curtain-up ten minutes into a show is the worst possible moment to discover any of them. Sanity, whose authoring model is closest to a Shape, explicitly warns that GraphQL cannot faithfully represent nested anonymous user types and steers users to GROQ instead. That is the strongest available evidence against schema-per-Show.

Concretely:

1. **Shape definitions are ordinary data in the static schema** — a recursive `ShapeField { name, type: ShapeFieldType!, fields: [ShapeField!], items: ShapeField, default: ... }`. Airtable's recursive `options.result` and Sanity's JSON schema manifest are both precedents for a self-describing descriptor served alongside, not instead of, the API. This is how a client learns a Shape's structure, and it stays introspectable, cacheable, and subscribable (a Shape publish is just another live update).
2. **Shape *values* read as a fixed `union ShapeValue = TextValue | NumberValue | BooleanValue | ObjectValue | ArrayValue | ImageValue | ColourValue | DateValue`.** The member set is closed (#90 settled it at eight), so a union costs nothing and buys field selection, per-field errors, and full codegen — everything a JSON scalar forfeits under the spec's Leaf Field Selections rule. Notion's doubly-tagged formula values are the model for typing Transformer outputs later.
3. **Writes use `@oneOf`.** Spec-final since September 2025 and native in graphql 17 — but mind v17's inhabitability check on a self-recursive input; give the nested branch a non-oneOf escape.
4. **Validation is server-side, against the Shape descriptor, returned as structured mutation errors.** Every one of the six vendors does exactly this; none encodes user rules in the type system. Strapi's `extensions.error.{name,message,details}` is a good error shape to copy.
5. **Codegen is untouched.** The whole schema is static, so `graphql-codegen` runs at build time as it does today — the thing all four SDL-generating vendors sacrifice, and the reason Strapi's production advice (disable introspection) breaks its own client story.
6. **Address fields by stable ID, not name.** Notion's *"IDs remain stable even when property names change"* is the direct answer to #90's rename-mid-Run case, and to whether `source_path`/`target_path` should hold names or IDs.

The trade accepted: a client cannot express "give me the `tally` field of this Source" as a statically-typed GraphQL selection — it selects a `ShapeValue` union and walks it. That is the same trade Airtable and Notion make deliberately, and it is cheap here because the value kinds are few and fixed while the *compositions* are many.

**A pragmatic escape hatch, if per-Show typed selections are ever wanted:** Yoga 5's documented schema factory (with a per-Show cache, keyed off the request) can layer generated types over the static core, at the cost of per-tenant introspection, persisted-operation keying, and no codegen. Keep it in reserve; don't build for it now.
