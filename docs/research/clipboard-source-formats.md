# JSON and CSV fidelity limits for typed Source data

Research for [#868](https://github.com/fauxparse/mechane/issues/868), part of map [#866](https://github.com/fauxparse/mechane/issues/866).
Date: 2026-10-02. Claims are cited to primary specs, first-party spreadsheet documentation, or repo source. Generic-format facts come from the specs; everything marked "Mechanē must decide" is policy this research deliberately does not choose. Browser clipboard mechanics (formats the editor should write or read) are the sibling ticket's scope, not this one.

## The question

What can JSON and CSV carry faithfully for Mechanē Source values, and what requires an application-specific contract? The interesting cases are nested Shapes and arrays, scalar Types and their ambiguity, Typed Absence versus empty text, date/datetime/color/image spellings, delimiter/quoting/newline/encoding behavior, spreadsheet coercion, formula injection, and the difference between CSV files and spreadsheet clipboard TSV.

---

## 1. What a Source value is, grounded in the repo

These are the facts the format findings have to hold against. Line numbers are current `main`.

- Primitive Types are exactly `text`, `number`, `boolean`, `image`, `color`, `date`, `datetime`, and a `Type` is a primitive, an array of a `Type`, or a Shape reference by id (`packages/domain/src/shapes.ts:2-15`). Shape graphs must be acyclic (`packages/domain/src/shapes.ts:180-290`).
- Authored Source Defaults are sparse overrides on the Show graph: `sourceFieldDefaults: {nodeId, fieldPath, value}[]`, where "absence inherits the Shape default (#107)" (`packages/domain/src/graph.ts:366-381`). The command seam clears an override with `value: null` and normalizes non-null values against the field's resolved Type (`packages/commands/src/graph-commands.ts:880-951`).
- Authored structured values are `StructuredValueTemplate`: scalar, `null`, or `{id, kind: "shape"|"array", fields|items}` nodes with a stable generated id per node (`packages/domain/src/structured-values.ts:46-63`). Normalization looks fields up by field id first, then by field name (`packages/domain/src/structured-values.ts:163-169`).
- Live Run state is a different representation: `RuntimeValue` is a scalar or `{ref}` into a `StructuredValues` overlay (`packages/domain/src/structured-values.ts:14-22`). `runtimeValueAtPath` deliberately walks references without flattening them so Formulas and Cues keep the referenced instance; resolving to a plain tree is a separate, opt-in operation (`packages/domain/src/structured-values.ts:374-403`).
- Images are persisted as the opaque `{assetId, revision}` reference (`packages/domain/src/shapes.ts:52-56`); a resolved image with url/dimensions/alt/mime/blurHash exists only at render boundaries (`packages/domain/src/shapes.ts:58-68`). Conformance accepts _either_ spelling for an image value (`packages/domain/src/shapes.ts:342-360`).
- `color`, `date`, and `datetime` values are strings with no grammar enforced by domain conformance, which only checks `typeof value === "string"` (`packages/domain/src/shapes.ts:350-353`). Studio examples use CSS-style hex such as `#88c0d0`. The domain's own coercions are stricter than its conformance: text to date requires `/^\d{4}-\d{2}-\d{2}$/` and a real calendar date, and text to datetime canonicalizes through `Date` to `toISOString()` (`packages/domain/src/shapes.ts:434-449`).
- Shapes are Show-scoped: `ShowGraph.shapes?: Shape[]`, "Show-scoped type definitions, independent of the canvas node graph" (`packages/domain/src/graph.ts:377-378`). A `shapeId` means nothing outside the Shape set of one Show.
- Edge field paths use field names and deliberately do not address array indices, because "the 3rd element isn't a stable design-time thing to point at" (`packages/domain/src/graph.ts:240-249`); the Source inspector writes field ids in `fieldPath` while displaying names (`apps/studio/src/editors/show/graph/inspector/SourceValues.tsx:21-40`).

No clipboard, CSV, or general JSON value interchange exists in the repo today (verified across domain/commands/Studio/API surfaces by the Source transfer scout; not proven repository-wide).

---

## 2. JSON: what carries faithfully

JSON's own model is close to Mechanē's authored template model, so the good news is long:

- **Nested Shapes and arrays.** Objects nest objects and arrays to arbitrary depth, and arrays are "an ordered sequence of zero or more values" (RFC 8259 §1, §5). A `StructuredValueTemplate` tree is structurally encodable without loss, including array order.
- **Strings.** Any Unicode string content, with mandatory escaping of quote, backslash, and C0 controls; newlines inside strings are ordinary escaped content (RFC 8259 §7). Text with commas, tabs, quotes, and line breaks is safe.
- **Booleans and null.** First-class literals `true`/`false`/`null` (RFC 8259 §3).
- **Encoding.** "JSON text exchanged between systems that are not part of a closed ecosystem MUST be encoded using UTF-8" (RFC 8259 §8.1). Generators must not add a BOM; parsers may ignore one.
- **Absent versus present.** JSON itself _can_ distinguish "member absent" from "member present with null": `{"a":1}` and `{"a":null}` are different texts. Observed in Node v26.8.1: `"a" in JSON.parse('{"a":null}')` is `true`, `JSON.parse('{}').a` is `undefined`. So Typed Absence and explicit null are spellable in JSON. The collapse of those two cases is a codec/ORM convention, not a format property. (What a null _means_ to Mechanē is a contract question; §5.)

What JSON cannot do, per its own spec:

- **Carry Type information.** JSON has four primitive types and no more (RFC 8259 §1). There is no date, color, image, or timestamp type. `"2027-03-04"`, `"#88c0d0"`, and `{"assetId":"a_1","revision":"r_1"}` are just a string, a string, and an object; only a Mechanē-side convention says which Type they belong to.
- **Make object member order meaningful.** "An object is an unordered collection of zero or more name/value pairs" (RFC 8259 §1), and "JSON parsing libraries have been observed to differ as to whether or not they make the ordering of object members visible to calling software" (RFC 8259 §4). Mechanē Shape field order is meaningful (`packages/domain/src/shapes.ts:109-114`), so JSON objects cannot be the carrier of that order. Arrays can. This is not theoretical: observed in Node v26.8.1, `Object.keys(JSON.parse('{"2":"a","1":"b","x":"c","10":"d"}'))` returns `["1","2","10","x"]`. Numeric-looking member names, which Shape _names_ can be (normalization already accepts name-keyed input, `packages/domain/src/structured-values.ts:163-169`), come back numerically sorted.
- **Guarantee duplicate-name handling.** "The names within an object SHOULD be unique... When the names within an object are not unique, the behavior of software that receives such an object is unpredictable. Many implementations report the last name/value pair only" (RFC 8259 §4). Observed in Node: `JSON.parse('{"a":1,"a":2}')` silently yields `{a:2}`. A hand-edited or machine-mangled payload can drop a field's value with no error. I-JSON simply forbids duplicates (RFC 7493 §2.3).
- **Guarantee number fidelity beyond IEEE 754 double.** Implementations may limit range and precision, and interoperability holds where "numbers that are integers and are in the range [-(2^53)+1, (2^53)-1]... will agree exactly on their numeric values" (RFC 8259 §6). Observed in Node: `JSON.parse('9007199254740993')` yields `9007199254740992`; lexical form is also not preserved (`JSON.stringify(JSON.parse('1.0'))` is `"1"`). RFC 7493 §2.2: a sender "cannot expect a receiver to treat an integer whose absolute value is greater than 9007199254740991... as an exact value", and exact interchange of bigger numbers is "RECOMMENDED to encode... in JSON string values".
- **Promise predictable strings in edge cases.** Unpaired UTF-16 surrogates are grammatically allowed but "the behavior of software that receives JSON texts containing such values is unpredictable" (RFC 8259 §8.2); observed in Node, `JSON.parse('"\\uD800"')` parses to a lone code unit without error. I-JSON forbids surrogates and noncharacters outright (RFC 7493 §2.1). `NaN`/`Infinity` are not permitted (RFC 8259 §6), which matches Mechanē's own finite-number check (`packages/domain/src/shapes.ts:355-356`).

For timestamps, the standards' own advice: express them as ISO 8601 per RFC 3339 strings, "with the additional restrictions that uppercase rather than lowercase letters be used, that the timezone be included not defaulted, and that optional trailing seconds be included even when their value is '00'" (RFC 7493 §4.3). Binary payloads should be base64url strings (RFC 7493 §4.4). Note the local precedent: Mechanē's own text-to-datetime coercion canonicalizes to `toISOString()`, i.e. RFC 3339 UTC with milliseconds (`packages/domain/src/shapes.ts:444-449`).

---

## 3. CSV: what carries faithfully

RFC 4180 documents the common CSV shape: records on lines delimited by CRLF, an optional header line with field names, comma-separated fields, and double-quote enclosure so that "fields containing line breaks (CRLF), double quotes, and commas should be enclosed in double-quotes", with embedded quotes escaped by doubling (RFC 4180 §2). Within that envelope:

- **Scalar text.** Any single-field text content is representable, including embedded newlines, quotes, and commas, if the writer quotes correctly and the reader implements §2.
- **Row and column order.** Both are first-class: position _is_ the structure. Shape field order, which JSON objects cannot promise, a CSV header or column position carries exactly.
- **Human editability.** It is the lingua franca of tabular data; every spreadsheet opens it.

That is the whole list. Everything else Mechanē needs is convention layered on top, and the RFC is candid about the foundation: "Due to lack of a single specification, there are considerable differences among implementations" (RFC 4180 §3). It even records that "some programs, such as Microsoft Excel, do not use double quotes at all" (§2, note to item 5). Specific gaps:

- **No types.** Every field is text. `1`, `true`, `2027-03-04`, and `#88c0d0` are all just characters. Which Mechanē Type a column holds is entirely out-of-band knowledge.
- **No nesting.** Records are flat lines; there is no array or sub-record construct. A nested Shape or array can only ride along as a serialized blob inside one cell (JSON-in-a-cell), which reintroduces every JSON caveat inside a cell that spreadsheets additionally mangle (§4).
- **Empty-field ambiguity.** An empty field between commas can mean empty text, null, absent, zero, or false; RFC 4180 has no opinion. Quoted empty (`""`) versus unquoted empty differ in some readers (notably per Microsoft's own guidance to use quoting; see §4), but Mechanē's Typed Absence versus empty text versus zero are three states that CSV can spell at best two ways.
- **Encoding is not UTF-8 by default.** The MIME registration's optional `charset` parameter notes "Common usage of CSV is US-ASCII, but other character sets defined by IANA for the 'text' tree may be used" (RFC 4180 §3). UTF-8 with BOM versus without is a de-facto spreadsheet practice, not a spec requirement; contrast JSON's MUST (RFC 8259 §8.1).
- **Line endings and trailing newline.** Records are CRLF-delimited, but "The last record in the file may or may not have an ending line break" (RFC 4180 §2 item 2), and implementations vary on lone LF/CR (the registration's "Encoding considerations" warns "some implementations may use other values").
- **Ragged rows.** "Each line should contain the same number of fields throughout the file" is a should, not a must (§2 item 4). Short and long rows are unspecified behavior.
- **Spaces are significant.** "Spaces are considered part of a field and should not be ignored" (§2 item 4), so `a, b` is `a` and ` b`, and trim-on-read policies in the wild disagree.
- **Non-ASCII in unquoted fields.** The ABNF's unquoted field is printable ASCII only (`TEXTDATA = %x20-21 / %x23-2B / %x2D-7E`, RFC 4180 §2); anything beyond that is only well-formed inside quotes, which writers may omit.
- **Delimiter is not stable.** Microsoft documents that the list separator used when saving `.csv` follows Excel's separators: set the decimal separator to a comma and "this forces Excel to use a semi-colon for the list separator", and the Windows Region "List separator" setting changes it for all programs (Import or export text (.txt or .csv) files, Microsoft Support). A comma-delimited file opened in a comma-decimal locale can arrive semicolon-delimited, and vice versa.

---

## 4. Spreadsheet reality: coercion, precision, formula injection

These are first-party behaviors of the software users will actually paste into. They apply to CSV files, to spreadsheet clipboard TSV, and to any text Mechanē hands a spreadsheet.

### Coercion on the way in

Google's API documents the two possible intake modes, and the UI-parsing one is the default mental model for paste:

> `RAW`: "The input isn't parsed and is inserted as a string. For example, the input '=1+2' places the string, not the formula, '=1+2' in the cell. (Non-string values like booleans or numbers are always handled as `RAW`.)"
> `USER_ENTERED`: "The input is parsed exactly as if it were entered into the Sheets UI. For example, 'Mar 1 2016' becomes a date, and '=1+2' becomes a formula. Formats can also be inferred, so '$100.15' becomes a number with currency formatting."
> — <https://developers.google.com/sheets/api/guides/values> (see also <https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption>)

So under UI-style parsing: date-shaped text becomes a date, currency-shaped text becomes a formatted number, and formula-shaped text becomes a live formula. Microsoft documents the same class of behavior for files:

> "When Excel opens a .csv file, it uses the current default data format settings to interpret how to import each column of data... the format of a data column in the .csv file may be MDY, but Excel's default data format is YMD, or you want to convert a column of numbers that contains leading zeros to text so you can preserve the leading zeros."
> — Import or export text (.txt or .csv) files, <https://support.microsoft.com/en-us/office/5250ac4c-663c-47ce-937b-339e391393ba>

Concrete consequences for Mechanē scalar Types:

- `text` `"007"` becomes number `7`; leading zeros are lost. `"3.14"` versus `"3,14"` depends on the locale's decimal separator. `"TRUE"`/`"FALSE"` become booleans in Sheets-style parsers.
- `date`/`datetime`: `"Mar 1 2016"` becomes a date cell; `03/04/2027` is March 4 or April 3 depending on locale. RFC 3339 puts it plainly: "the date format '10/11/1996' is completely unsuitable for global interchange because it is interpreted differently in different countries" (§5.2). Excel's date domain is also bounded: "Earliest date allowed for calculation: January 1, 1900 (January 1, 1904, if 1904 date system is used)" and latest December 31, 9999 (Excel specifications and limits, <https://support.microsoft.com/en-us/office/1672b34d-7043-467e-8e27-269d656771c3>). Mechanē date strings have no such bound.
- `number`: Excel stores "Number precision: 15 digits" and displays large values in scientific notation (same source). A Mechanē number beyond 15 significant digits will not survive an Excel round trip even though it may survive JSON.
- `color`: `"#88c0d0"` stays text (the `#` protects it), but Mechanē conformance accepts _any_ string (`packages/domain/src/shapes.ts:350-353`), and a color spelled `88c0d0` or `1e5` without `#` is number-shaped to a spreadsheet.
- `image`: `{assetId, revision}` is an object. In CSV it can only be a JSON blob in a cell; in a spreadsheet paste it becomes text or worse. The asset identity itself is Show-scoped (§6).

Size limits on the way in: Excel's import/export bound is 1,048,576 rows by 16,384 columns; a cell holds at most 32,767 characters and 253 line feeds (same source). JSON-in-a-cell for nested Shapes runs into all three.

### Formula injection

Cells that begin with `=`, `+`, `-`, or `@` are formula-shaped to spreadsheet software:

> "This software interprets entries beginning with '=' as formulas, which are then executed by the spreadsheet software. The software's formula language often allows methods to access hyperlinks or the local command line."
> "Risky characters include '=' (equal), '+' (plus), '-' (minus), and '@' (at)."
> — CWE-1236, <https://cwe.mitre.org/data/definitions/1236.html>

OWASP's current guidance widens the set to tab (0x09), CR (0x0D), LF (0x0A), and full-width variants `＝ ＋ － ＠` in some locales, warns that quoting/single-quote-prefix mitigations "may fail and previously escaped formulas may become active again" because "Microsoft Excel may remove quotes or escape characters from CSV cells when a file is saved and re-opened", and concludes bluntly: "There is no universal CSV sanitization strategy that is safe for all spreadsheet applications and all downstream consumers."
— <https://community.owasp.org/attacks/CSV_Injection>

For Mechanē this is unavoidable friction, not a solvable bug: _any_ text value whose first character is one of those metacharacters (`-5` as text, `@stage` as text, a formula-shaped text field) collides with number syntax too. Whether and how Mechanē neutralizes export cells (prefix, quoting, refusing) is a policy decision this research does not make; what the evidence rules out is assuming RFC 4180 quoting alone is a fix.

---

## 5. CSV files versus spreadsheet clipboard TSV

These are two different dialects, and only one of them has a spec.

- **CSV files** are the RFC 4180 shape: comma delimiter, quote-and-double escaping, CRLF records, optional header. Excel exports the current worksheet this way (Import or export text (.txt or .csv) files), with the locale-dependent list separator caveat above.
- **Delimited text files** (.txt) per Microsoft "typically" use the TAB character (ASCII 009) as separator (same source).
- **TSV has a registered MIME type with no quoting at all**: the IANA registration for `text/tab-separated-values` says fields are separated by tabs, the first line contains field names, "Each record must have the same number of fields", and "fields that contain tabs are not allowable in this encoding" (<https://www.iana.org/assignments/media-types/text/tab-separated-values>). There is no escape or quote mechanism. So the only registered TSV dialect cannot carry a text value containing a tab, and a newline inside a field breaks the one-record-per-line structure.

The clipboard text that Excel, Google Sheets, and Numbers put on the pasteboard when copying cells is tab-separated, but how each product encodes embedded tabs, newlines, and quotes inside cells on the clipboard is application behavior; none of the cited specs or vendor pages I found documents it. That is a real gap for the copy direction (values with line breaks), and it belongs with the sibling clipboard-mechanics research, which should pin the exact dialects empirically if the editor ever needs to emit spreadsheet-pasteable TSV.

What is already decidable from evidence here: a Mechanē interchange format that must survive a spreadsheet _transit_ cannot rely on TSV carrying embedded tabs or newlines, and cannot rely on CSV quoting protecting formula-shaped text (§4). Any text-bearing format intended for spreadsheet round trips needs an explicit answer for those two characters plus the formula metacharacters.

---

## 6. What plain data cannot carry at all

Two Mechanē realities have no representation in JSON values or CSV cells, regardless of clever encoding. This is the hard core of the import/export boundary.

### Runtime aliasing and structured identity

Live structured values are a graph, not a tree: `RuntimeValue` carries `{ref}` into a shared `StructuredValues` overlay, two Source fields can reference the same record, and writes through one path are visible through the other because `runtimeValueAtPath` deliberately preserves references (`packages/domain/src/structured-values.ts:14-22,374-403`). JSON has no reference mechanism; an object tree can only duplicate shared subtrees. CSV has no mechanism at all. So:

- Exporting a live value as plain data necessarily flattens aliasing; re-importing necessarily mints fresh identities (the current paste-adjacent seam, `normalizeStructuredValueTemplate`, already mints new `structuredValue` ids per node, `packages/domain/src/structured-values.ts:140-177`).
- Preserving alias topology across a copy/paste requires an explicit identity section in the payload (node ids plus shared-subtree pointers), plus a Mechanē policy for when to honor it. That is a Mechanē contract, not a format feature.
- Internal ref ids must not be treated as portable: they are minted per normalization, and computed refs literally encode a transformer id, type, and path into the id string (`packages/domain/src/structured-values.ts:77-103`). A payload from another Show carries dangling or colliding ids; `materializeStructuredValue` rejects duplicate ids with different records (`packages/domain/src/structured-values.ts:294-300`).

### Show-scoped Shape metadata

A `Type` like `{kind: "shape", shapeId: "shp_1"}` resolves only against `ShowGraph.shapes` of one Show (`packages/domain/src/graph.ts:377-378`). Plain data has no way to bind a shape-typed value to the Shape definition it conforms to:

- Within one Show, the Shape set is ambient context; a payload can be validated against it. Across Shows, tabs, or time (a Shape edited after export), `shp_1` may resolve to a different Shape, a renamed Shape, or nothing.
- Field identity is id-first with a name fallback (`packages/domain/src/structured-values.ts:163-169`), so a foreign payload whose keys are _names_ can silently bind to whichever local field has that name, and a numeric-looking name reorders in JSON engines (§2). Field order lives in the Shape definition, not the value.
- Carrying conformance across Shows therefore requires a Mechanē decision among at least: embed a schema snapshot in the payload; match by shape id; match by name; or refuse cross-Show shape-typed transfer. CSV cannot even pose the question; its cells do not know they are shape-typed.

### The sparse-override layer

A Source Default is not a value; it is an override _of_ a value built from Shape defaults (`packages/domain/src/graph.ts:366-381`). Plain JSON/CSV can carry the value, but three states are invisible in it: field untouched (inherit Shape default), field overridden to null (`setSourceFieldDefault` with `value: null` clears the override, `packages/commands/src/graph-commands.ts:880-951`), and field overridden to an authored value. A JSON null is ambiguous among "no override", "override equal to Typed Absence", and, at the value layer, top-level Source null which runtime validation explicitly permits (`packages/domain/src/structured-values.ts:422-430`). Which null the pasted null means is a Mechanē contract decision; neither format can say.

---

## 7. Ambiguity catalogue

Concrete spellings, all real per the cited sources or local observation. "Spreadsheet does" reflects USER_ENTERED-style UI parsing (§4).

| Mechanē value                          | JSON spelling                                                   | CSV spelling                                        | What goes wrong                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| text `"TRUE"` vs boolean `true`        | distinct (`"TRUE"` vs `true`)                                   | identical cell `TRUE`                               | CSV cannot distinguish; spreadsheet coerces text `TRUE` to boolean                                                         |
| text `"007"`                           | `"007"`                                                         | `007`                                               | Spreadsheet turns into number 7; JSON keeps text                                                                           |
| number `7` vs text `"7"`               | distinct                                                        | identical                                           | CSV untyped                                                                                                                |
| text `"3,14"` (continental decimal)    | safe                                                            | breaks record (comma is delimiter)                  | Needs quoting; then locale still parses as number or text depending on region                                              |
| number `9007199254740993`              | parses to `9007199254740992` (observed, Node v26.8.1)           | loses digits; Excel stores 15                       | Beyond 2^53−1 (RFC 8259 §6, RFC 7493 §2.2) and Excel's 15 digits                                                           |
| number `1.0` vs `1`                    | `1.0` re-serializes as `1` (observed)                           | `1.0` vs `1`                                        | Lexical form not preserved in JSON engines; spreadsheets re-format freely                                                  |
| date `2027-03-04` as text vs date      | same string either way                                          | `2027-03-04`                                        | No JSON date type; spreadsheet coerces to date cell and re-formats on export                                               |
| date `03/04/2027`                      | string                                                          | `03/04/2027`                                        | "interpreted differently in different countries" (RFC 3339 §5.2); Excel default MDY vs YMD documented                      |
| date `Mar 1 2016`                      | string                                                          | `Mar 1 2016`                                        | "becomes a date" under USER_ENTERED (Google)                                                                               |
| datetime naive vs offset vs Z          | three strings, all legal                                        | same                                                | RFC 7493 §4.3 wants uppercase RFC 3339 with explicit timezone; Mechanē's own coercion canonicalizes to `toISOString()` UTC |
| date `1066-10-14`                      | fine                                                            | `1066-10-14`                                        | Excel cannot calculate before 1900 (specifications page); cell degrades                                                    |
| color `"#88c0d0"`                      | string                                                          | `#88c0d0`                                           | Stays text due to `#`; but Mechanē accepts any string (no local grammar), so `88c0d0` is number-coercible                  |
| image `{assetId:"a_1",revision:"r_1"}` | object                                                          | only as embedded JSON blob                          | Show-scoped identity; conformance also accepts the resolved spelling with url/width/alt, so the contract must pick one     |
| absent vs null vs empty text           | `{}`, `{"f":null}`, `{"f":""}` all distinct (observed)          | `,`, `""`, and nothing are at best two states       | CSV cannot spell all three; what null _means_ is Mechanē's (§6)                                                            |
| duplicate members `{"f":1,"f":2}`      | parses silently to last (observed; RFC 8259 §4 "unpredictable") | n/a                                                 | Hand-edited JSON can drop data without error                                                                               |
| field order `{b,a}` vs `{a,b}`         | "unordered"; V8 reorders numeric names (observed)               | column position is exact                            | Shape field order needs arrays or the Shape definition                                                                     |
| text starting `-` `+` `@` `=`          | safe string                                                     | safe only if neutralized                            | Formula injection (CWE-1236, OWASP); quoting alone "may fail" per OWASP                                                    |
| text with tab                          | safe (`\t` escape)                                              | quoted CSV safe                                     | Registered TSV: tabs "not allowable" (IANA); spreadsheet clipboard dialect undocumented                                    |
| text with newline                      | safe (`\n` escape)                                              | quoted CSV safe; Excel caps 253 line feeds per cell | TSV record structure breaks; JSON fine                                                                                     |
| aliasing two fields to one record      | only by duplicating subtrees                                    | impossible                                          | §6: needs explicit identity section plus policy                                                                            |

---

## 8. What Mechanē must decide (not decided here)

Generic limits above; everything below is contract the app owes the format. Ordered roughly by how much it blocks.

1. **Payload shape.** Is the clipboard payload a resolved plain tree, a typed template with schema metadata, an identity-graph format, or several formats for different mime types? This governs whether nesting, order, and aliasing survive.
2. **Operation semantics.** Paste targets root replacement, a field path, or a batch of sparse overrides; those are materially different edits (`setSourceFieldDefault` vs a whole-value write). The payload needs an explicit target model, including whether array indices are addressable at all in values (design-time paths deliberately exclude them, `packages/domain/src/graph.ts:240-249`).
3. **The null dictionary.** One portable spelling must be chosen for: inherit Shape default (no override), override to Typed Absence, empty text, and runtime top-level null. JSON can carry the distinction; CSV cannot, so the contract must say what CSV import does when it meets `,` and `""`, and probably reject rather than guess.
4. **Typing on import.** Which Type each imported scalar belongs to, and validation: dates conforming to which grammar (the local `^\d{4}-\d{2}-\d{2}$` and `toISOString()` precedents exist), colors validated or accepted as opaque strings, numbers finite (already enforced) and bounded for spreadsheet transit at 15 significant digits, booleans from `TRUE`/`FALSE` text or refused.
5. **Image policy.** One spelling only (the opaque `{assetId, revision}` is the persisted one), same-Show resolution, remap by asset id, offer upload, or reject unresolved assets. The resolved url-bearing spelling must be refused at this boundary or explicitly remapped.
6. **Shape resolution across Shows.** Embed a schema snapshot, match by id, match by name, or refuse. Includes renamed fields, missing fields, extra fields (must-ignore per RFC 7493 §4.2 is a candidate default), and what field-id-versus-name keys mean on the way in.
7. **Identity policy.** Whether paste always mints fresh structured identities (the current normalization behavior) or can preserve alias topology when the payload carries an explicit identity section. Whether internal `ref` ids ever cross the boundary (evidence says they must not: §6).
8. **Spreadsheet transit policy.** Whether any export path is allowed to emit CSV/TSV intended for spreadsheets, and if so the neutralization for formula metacharacters (OWASP documents that quoting alone fails), the leading-zero and locale-date disclaimers for import, and the encoding choice (UTF-8; BOM or not).
9. **Duplicate-name and malformed-input behavior.** Reject duplicates (I-JSON-style) or accept last-wins; reject ragged CSV rows; reject unpaired surrogates; these all have silent-loss failure modes otherwise.

---

## 9. Sources

Primary specifications:

- RFC 8259, The JavaScript Object Notation (JSON) Data Interchange Format, December 2017. <https://www.rfc-editor.org/rfc/rfc8259>
- RFC 7493, The I-JSON Message Format, March 2015. <https://www.rfc-editor.org/rfc/rfc7493>
- RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files, October 2005. <https://www.rfc-editor.org/rfc/rfc4180>
- RFC 3339, Date and Time on the Internet: Timestamps, July 2002. <https://www.rfc-editor.org/rfc/rfc3339>
- IANA media type registration, `text/tab-separated-values`. <https://www.iana.org/assignments/media-types/text/tab-separated-values>

First-party spreadsheet documentation (all accessed 2026-10-02):

- Google Sheets API, Read and write cell values. <https://developers.google.com/sheets/api/guides/values>
- Google Sheets API, ValueInputOption. <https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption>
- Microsoft Support, Import or export text (.txt or .csv) files. <https://support.microsoft.com/en-us/office/5250ac4c-663c-47ce-937b-339e391393ba>
- Microsoft Support, Excel specifications and limits. <https://support.microsoft.com/en-us/office/1672b34d-7043-467e-8e27-269d656771c3>

Security references:

- CWE-1236, Improper Neutralization of Formula Elements in a CSV File. <https://cwe.mitre.org/data/definitions/1236.html>
- OWASP, CSV Injection. <https://community.owasp.org/attacks/CSV_Injection>

Repo source: `packages/domain/src/shapes.ts`, `packages/domain/src/structured-values.ts`, `packages/domain/src/graph.ts`, `packages/commands/src/graph-commands.ts`, `apps/studio/src/editors/show/graph/inspector/SourceValues.tsx` at current `main`.

Local observation, Node v26.8.1 on darwin/arm64: number precision collapse (`9007199254740993` to `9007199254740992`), `1.0` re-serialization as `1`, numeric-name key reordering (`{"2","1","x","10"}` to `["1","2","10","x"]`), duplicate member last-wins, `"a" in {"a":null}` true versus `{}` false, unpaired surrogate accepted. No spreadsheet application or live browser was exercised for this document; spreadsheet behavior claims rest on the first-party pages above.
