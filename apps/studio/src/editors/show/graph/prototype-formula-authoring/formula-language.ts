// PROTOTYPE (issue #675) — a throwaway Formula engine, so the editor is real.
//
// The vendored JEXL fork of #665 does not exist yet, and the variants are
// asking what it *feels like* to write a Formula: a faked preview and faked
// squiggles answer nothing. So this file is a small hand-rolled lexer, Pratt
// parser, checker and evaluator over the subset of the language the seeded
// Formulas use, with real spans, so every underline lands on the right
// character and every preview is a real evaluation of real sample values.
//
// It is NOT the shape of the real thing: the real one vendors JEXL's parser
// (#665), infers Types properly (#672), and lives in `packages/domain` behind
// two call sites (#674). Semantics follow the settled decisions where it is
// cheap to: zero-based indexing, one-level field auto-mapping over arrays,
// unconditional `&`, propagating absence, `SUM`/`COUNT` skipping blanks,
// case-insensitive Function names.
//
// Diagnostic wording is lifted from the contract in
// https://github.com/fauxparse/mechane/issues/672.

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export type FormulaValue =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "record"; shape: string; fields: Record<string, FormulaValue> }
  | { kind: "array"; items: FormulaValue[] }
  | { kind: "absent"; because: string }
  | { kind: "failure"; category: FailureCategory; message: string; from: number; to: number };

/** The stable runtime categories of #672, as far as this subset can produce them. */
export type FailureCategory =
  | "missingRequiredValue"
  | "typeMismatch"
  | "divisionByZero"
  | "nonFiniteNumber"
  | "invalidIndex"
  | "invalidFunctionArgument";

export const absent = (because: string): FormulaValue => ({ kind: "absent", because });
export const number = (value: number): FormulaValue => ({ kind: "number", value });
export const text = (value: string): FormulaValue => ({ kind: "text", value });
export const boolean = (value: boolean): FormulaValue => ({ kind: "boolean", value });

/** Static Types, as much as this prototype infers. `unknown` means "don't diagnose". */
export type FormulaType =
  | "number"
  | "text"
  | "boolean"
  | "unknown"
  | { record: string }
  | { array: FormulaType };

export function typeName(type: FormulaType): string {
  if (type === "unknown") return "an unknown Type";
  if (typeof type === "string") return type[0]!.toUpperCase() + type.slice(1);
  if ("record" in type) return type.record;
  return `Array of ${typeName(type.array)}`;
}

/** Field tables for the prototype's Shapes, keyed by Shape name. */
export type ShapeTable = Record<string, Record<string, FormulaType>>;

// ---------------------------------------------------------------------------
// Lexing
// ---------------------------------------------------------------------------

export type TokenKind =
  | "number"
  | "string"
  | "identifier"
  | "function"
  | "operator"
  | "punctuation"
  | "boolean"
  | "invalid";

export interface Token {
  kind: TokenKind;
  text: string;
  from: number;
  to: number;
}

const OPERATORS = [
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "&",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "?",
  ":",
];

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const from = index;
    if (char === '"' || char === "'") {
      index += 1;
      while (index < source.length && source[index] !== char) {
        index += source[index] === "\\" ? 2 : 1;
      }
      const closed = source[index] === char;
      index = closed ? index + 1 : source.length;
      tokens.push({
        kind: closed ? "string" : "invalid",
        text: source.slice(from, index),
        from,
        to: index,
      });
      continue;
    }
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] ?? ""))) {
      index += 1;
      while (index < source.length && /[0-9]/.test(source[index]!)) index += 1;
      if (source[index] === "." && /[0-9]/.test(source[index + 1] ?? "")) {
        index += 1;
        while (index < source.length && /[0-9]/.test(source[index]!)) index += 1;
      }
      tokens.push({ kind: "number", text: source.slice(from, index), from, to: index });
      continue;
    }
    if (IDENT_START.test(char)) {
      index += 1;
      while (index < source.length && IDENT_PART.test(source[index]!)) index += 1;
      const word = source.slice(from, index);
      const followedByCall = /^\s*\(/.test(source.slice(index));
      const kind: TokenKind =
        word === "true" || word === "false"
          ? "boolean"
          : followedByCall
            ? "function"
            : "identifier";
      tokens.push({ kind, text: word, from, to: index });
      continue;
    }
    if (
      char === "." ||
      char === "(" ||
      char === ")" ||
      char === "[" ||
      char === "]" ||
      char === ","
    ) {
      index += 1;
      tokens.push({ kind: "punctuation", text: char, from, to: index });
      continue;
    }
    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      index += operator.length;
      tokens.push({ kind: "operator", text: operator, from, to: index });
      continue;
    }
    index += 1;
    tokens.push({ kind: "invalid", text: char, from, to: index });
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface Span {
  from: number;
  to: number;
}

export type Expression =
  | ({ type: "number"; value: number } & Span)
  | ({ type: "text"; value: string } & Span)
  | ({ type: "boolean"; value: boolean } & Span)
  | ({ type: "identifier"; name: string } & Span)
  | ({ type: "field"; target: Expression; name: string; nameFrom: number; nameTo: number } & Span)
  | ({ type: "index"; target: Expression; index: Expression } & Span)
  | ({ type: "call"; name: string; args: Expression[]; nameFrom: number; nameTo: number } & Span)
  | ({ type: "unary"; operator: string; operand: Expression } & Span)
  | ({ type: "binary"; operator: string; left: Expression; right: Expression } & Span)
  | ({ type: "ternary"; test: Expression; whenTrue: Expression; whenFalse: Expression } & Span);

export class ParseFailure extends Error {
  constructor(
    message: string,
    readonly from: number,
    readonly to: number,
  ) {
    super(message);
  }
}

/** Binding powers. `&` sits between comparison and arithmetic, as Excel's does. */
const BINDING: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "&": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
};

export function parse(source: string): Expression {
  const tokens = lex(source);
  let position = 0;

  const peek = (): Token | undefined => tokens[position];
  const nearby = (token: Token | undefined): string =>
    token ? `near "${token.text}"` : "at the end of the Formula";
  const endSpan = (): Span => ({ from: Math.max(0, source.length - 1), to: source.length });

  function expect(value: string, what: string): Token {
    const token = peek();
    if (!token || token.text !== value) {
      const span = token ?? endSpan();
      throw new ParseFailure(
        `Formula could not be parsed ${nearby(token)}: expected ${what}.`,
        span.from,
        span.to,
      );
    }
    position += 1;
    return token;
  }

  function parsePrimary(): Expression {
    const token = peek();
    if (!token) {
      const span = endSpan();
      throw new ParseFailure(
        "Formula could not be parsed at the end of the Formula: expected a value.",
        span.from,
        span.to,
      );
    }
    position += 1;
    switch (token.kind) {
      case "number":
        return { type: "number", value: Number(token.text), from: token.from, to: token.to };
      case "string":
        return {
          type: "text",
          value: unquote(token.text),
          from: token.from,
          to: token.to,
        };
      case "boolean":
        return {
          type: "boolean",
          value: token.text === "true",
          from: token.from,
          to: token.to,
        };
      case "function": {
        expect("(", 'an opening "(" for the Function call');
        const args: Expression[] = [];
        if (peek()?.text !== ")") {
          for (;;) {
            args.push(parseExpression(0));
            if (peek()?.text === ",") {
              position += 1;
              continue;
            }
            break;
          }
        }
        const close = expect(")", 'a closing ")"');
        return {
          type: "call",
          name: token.text,
          args,
          nameFrom: token.from,
          nameTo: token.to,
          from: token.from,
          to: close.to,
        };
      }
      case "identifier":
        return { type: "identifier", name: token.text, from: token.from, to: token.to };
      case "operator":
        if (token.text === "-" || token.text === "!") {
          const operand = parseUnaryTarget();
          return {
            type: "unary",
            operator: token.text,
            operand,
            from: token.from,
            to: operand.to,
          };
        }
        throw new ParseFailure(
          `Formula could not be parsed near "${token.text}": expected a value.`,
          token.from,
          token.to,
        );
      case "punctuation":
        if (token.text === "(") {
          const inner = parseExpression(0);
          const close = expect(")", 'a closing ")"');
          // The span covers the brackets, so an underline on the group looks
          // like the group rather than stopping a character short.
          return { ...inner, from: token.from, to: close.to };
        }
        throw new ParseFailure(
          `Formula could not be parsed near "${token.text}": expected a value.`,
          token.from,
          token.to,
        );
      default:
        throw new ParseFailure(
          `Formula could not be parsed near "${token.text}": that isn't something a Formula can read.`,
          token.from,
          token.to,
        );
    }
  }

  function parseUnaryTarget(): Expression {
    return parsePostfix(parsePrimary());
  }

  function parsePostfix(target: Expression): Expression {
    let current = target;
    for (;;) {
      const token = peek();
      if (token?.text === ".") {
        position += 1;
        const name = peek();
        if (!name || (name.kind !== "identifier" && name.kind !== "function")) {
          const span = name ?? endSpan();
          throw new ParseFailure(
            `Formula could not be parsed ${nearby(name)}: expected a field name after ".".`,
            span.from,
            span.to,
          );
        }
        position += 1;
        current = {
          type: "field",
          target: current,
          name: name.text,
          nameFrom: name.from,
          nameTo: name.to,
          from: current.from,
          to: name.to,
        };
        continue;
      }
      if (token?.text === "[") {
        position += 1;
        const index = parseExpression(0);
        const close = expect("]", 'a closing "]"');
        current = { type: "index", target: current, index, from: current.from, to: close.to };
        continue;
      }
      return current;
    }
  }

  function parseExpression(minimum: number): Expression {
    let left = parsePostfix(parsePrimary());
    for (;;) {
      const token = peek();
      if (!token) break;
      if (token.text === "?" && minimum === 0) {
        position += 1;
        const whenTrue = parseExpression(0);
        expect(":", 'a ":" to finish the choice');
        const whenFalse = parseExpression(0);
        left = {
          type: "ternary",
          test: left,
          whenTrue,
          whenFalse,
          from: left.from,
          to: whenFalse.to,
        };
        continue;
      }
      const binding = token.kind === "operator" ? BINDING[token.text] : undefined;
      if (binding === undefined || binding <= minimum) break;
      position += 1;
      const right = parseExpression(binding);
      left = {
        type: "binary",
        operator: token.text,
        left,
        right,
        from: left.from,
        to: right.to,
      };
    }
    return left;
  }

  const expression = parseExpression(0);
  const trailing = peek();
  if (trailing) {
    throw new ParseFailure(
      `Formula could not be parsed near "${trailing.text}": the Formula already looked finished.`,
      trailing.from,
      trailing.to,
    );
  }
  return expression;
}

function unquote(raw: string): string {
  return raw.slice(1, -1).replace(/\\(.)/g, "$1");
}

// ---------------------------------------------------------------------------
// Function catalogue (#670: IF, SUM, COUNT ship; the rest are its fast-follows)
// ---------------------------------------------------------------------------

export interface CatalogueEntry {
  name: string;
  arity: [minimum: number, maximum: number];
  signature: string;
  summary: string;
  /** False for the eight Functions #670 deferred to fast-follow tickets. */
  shipped: boolean;
  returns: (args: FormulaType[]) => FormulaType;
  call: (args: FormulaValue[], span: Span, lazy: () => FormulaValue[]) => FormulaValue;
}

const elementOf = (type: FormulaType): FormulaType =>
  typeof type === "object" && "array" in type ? type.array : "unknown";

export const CATALOGUE: CatalogueEntry[] = [
  {
    name: "IF",
    arity: [3, 3],
    signature: "IF(test, whenTrue, whenFalse)",
    summary: "Picks one of two values. Only the branch it picks is evaluated.",
    shipped: true,
    returns: ([, whenTrue, whenFalse]) =>
      sameType(whenTrue ?? "unknown", whenFalse ?? "unknown") ? (whenTrue ?? "unknown") : "unknown",
    call: (_args, span, lazy) => {
      const [test] = lazy();
      if (!test) return absent("IF had nothing to test");
      if (test.kind === "failure") return test;
      if (test.kind === "absent") return absent("IF was given nothing to test");
      if (test.kind !== "boolean") {
        return failure(
          "typeMismatch",
          `IF expects true or false, but received ${typeName(staticTypeOfValue(test))}.`,
          span,
        );
      }
      const [, whenTrue, whenFalse] = lazy();
      return (test.value ? whenTrue : whenFalse) ?? absent("IF had no branch to take");
    },
  },
  {
    name: "SUM",
    arity: [1, 1],
    signature: "SUM(numbers)",
    summary: "Adds up an array of numbers, skipping blanks. SUM of nothing is 0.",
    shipped: true,
    returns: () => "number",
    call: ([input], span) =>
      aggregate(input, span, "SUM", (numbers) => numbers.reduce((a, b) => a + b, 0)),
  },
  {
    name: "COUNT",
    arity: [1, 1],
    signature: "COUNT(items)",
    summary: "Counts the items that are present. COUNT of nothing is 0.",
    shipped: true,
    returns: () => "number",
    call: ([input]) => {
      if (!input) return number(0);
      if (input.kind === "failure") return input;
      if (input.kind === "absent") return number(0);
      if (input.kind !== "array") return number(1);
      return number(input.items.filter((item) => item.kind !== "absent").length);
    },
  },
  {
    name: "MAX",
    arity: [1, 1],
    signature: "MAX(numbers)",
    summary: "The largest number, skipping blanks.",
    shipped: false,
    returns: () => "number",
    call: ([input], span) =>
      aggregate(input, span, "MAX", (numbers) =>
        numbers.length === 0 ? null : Math.max(...numbers),
      ),
  },
  {
    name: "MIN",
    arity: [1, 1],
    signature: "MIN(numbers)",
    summary: "The smallest number, skipping blanks.",
    shipped: false,
    returns: () => "number",
    call: ([input], span) =>
      aggregate(input, span, "MIN", (numbers) =>
        numbers.length === 0 ? null : Math.min(...numbers),
      ),
  },
  {
    name: "FIRST",
    arity: [1, 1],
    signature: "FIRST(items)",
    summary: "The first item. Index-free, because indexes start at 0 here.",
    shipped: false,
    returns: ([input]) => elementOf(input ?? "unknown"),
    call: ([input]) => elementAt(input, 0, "FIRST"),
  },
  {
    name: "LAST",
    arity: [1, 1],
    signature: "LAST(items)",
    summary: "The last item.",
    shipped: false,
    returns: ([input]) => elementOf(input ?? "unknown"),
    call: ([input]) => elementAt(input, -1, "LAST"),
  },
  {
    name: "LEN",
    arity: [1, 1],
    signature: "LEN(value)",
    summary: "How many items are in an array, or characters in a text.",
    shipped: false,
    returns: () => "number",
    call: ([input], span) => {
      if (!input) return absent("LEN was given nothing");
      if (input.kind === "failure") return input;
      if (input.kind === "absent") return input;
      if (input.kind === "array") return number(input.items.length);
      if (input.kind === "text") return number(input.value.length);
      return failure(
        "invalidFunctionArgument",
        `Function "LEN" cannot accept ${typeName(staticTypeOfValue(input))}; expected Text or an Array.`,
        span,
      );
    },
  },
  {
    name: "UPPER",
    arity: [1, 1],
    signature: "UPPER(value)",
    summary: "Text in capitals.",
    shipped: false,
    returns: () => "text",
    call: ([input], span) => mapText(input, span, "UPPER", (value) => value.toUpperCase()),
  },
  {
    name: "LOWER",
    arity: [1, 1],
    signature: "LOWER(value)",
    summary: "Text in lower case.",
    shipped: false,
    returns: () => "text",
    call: ([input], span) => mapText(input, span, "LOWER", (value) => value.toLowerCase()),
  },
  {
    name: "ROUND",
    arity: [1, 2],
    signature: "ROUND(value, places?)",
    summary: "Rounds a number to the given number of decimal places.",
    shipped: false,
    returns: () => "number",
    call: ([input, places], span) => {
      if (!input) return absent("ROUND was given nothing");
      if (input.kind === "failure") return input;
      if (input.kind === "absent") return input;
      if (input.kind !== "number") {
        return failure(
          "invalidFunctionArgument",
          `Function "ROUND" cannot accept ${typeName(staticTypeOfValue(input))}; expected Number.`,
          span,
        );
      }
      const digits = places && places.kind === "number" ? places.value : 0;
      const scale = 10 ** digits;
      return number(Math.round(input.value * scale) / scale);
    },
  },
];

export function catalogueEntry(name: string): CatalogueEntry | undefined {
  const upper = name.toUpperCase();
  return CATALOGUE.find((entry) => entry.name === upper);
}

function failure(category: FailureCategory, message: string, span: Span): FormulaValue {
  return { kind: "failure", category, message, from: span.from, to: span.to };
}

function aggregate(
  input: FormulaValue | undefined,
  span: Span,
  name: string,
  reduce: (numbers: number[]) => number | null,
): FormulaValue {
  if (!input) return number(0);
  if (input.kind === "failure") return input;
  // #670: SUM(absent) and COUNT(absent) are 0; blanks inside an array are skipped.
  if (input.kind === "absent") return number(0);
  const items = input.kind === "array" ? input.items : [input];
  const numbers: number[] = [];
  for (const item of items) {
    if (item.kind === "failure") return item;
    if (item.kind === "absent") continue;
    if (item.kind !== "number") {
      return failure(
        "invalidFunctionArgument",
        `Function "${name}" cannot accept ${typeName(staticTypeOfValue(item))}; expected Number.`,
        span,
      );
    }
    numbers.push(item.value);
  }
  const result = reduce(numbers);
  return result === null ? absent(`${name} had no numbers to work with`) : number(result);
}

function elementAt(input: FormulaValue | undefined, at: number, name: string): FormulaValue {
  if (!input) return absent(`${name} was given nothing`);
  if (input.kind === "failure" || input.kind === "absent") return input;
  if (input.kind !== "array") return input;
  const item = at < 0 ? input.items[input.items.length + at] : input.items[at];
  return item ?? absent(`${name} found no items`);
}

function mapText(
  input: FormulaValue | undefined,
  span: Span,
  name: string,
  change: (value: string) => string,
): FormulaValue {
  if (!input) return absent(`${name} was given nothing`);
  if (input.kind === "failure" || input.kind === "absent") return input;
  if (input.kind === "text") return text(change(input.value));
  if (input.kind === "number") return text(change(String(input.value)));
  return failure(
    "invalidFunctionArgument",
    `Function "${name}" cannot accept ${typeName(staticTypeOfValue(input))}; expected Text.`,
    span,
  );
}

function sameType(left: FormulaType, right: FormulaType): boolean {
  return typeName(left) === typeName(right);
}

export function staticTypeOfValue(value: FormulaValue): FormulaType {
  switch (value.kind) {
    case "number":
    case "text":
    case "boolean":
      return value.kind;
    case "record":
      return { record: value.shape };
    case "array":
      return { array: value.items[0] ? staticTypeOfValue(value.items[0]) : "unknown" };
    default:
      return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Static checking (#672's diagnosable set, as far as this subset reaches)
// ---------------------------------------------------------------------------

export interface FormulaDiagnostic {
  from: number;
  to: number;
  message: string;
  /** Blocking diagnostics stop publication; runtime ones never do (#672). */
  severity: "blocking" | "runtime";
  category: string;
}

export interface FormulaScope {
  /** The node's named input ports, in order. */
  ports: { name: string; type: FormulaType; value: FormulaValue }[];
  shapes: ShapeTable;
  /** Filter's per-item binding, when the Formula is a predicate. */
  itemBinding?: { name: string; type: FormulaType; value: FormulaValue };
  /** Calculate's declared output Type; Filter's required Boolean. */
  expected?: FormulaType;
}

export interface FormulaAnalysis {
  source: string;
  expression: Expression | null;
  diagnostics: FormulaDiagnostic[];
  /** The Formula's value over the scope's current sample values. */
  value: FormulaValue | null;
  type: FormulaType;
  blocked: boolean;
}

export function analyse(source: string, scope: FormulaScope): FormulaAnalysis {
  const diagnostics: FormulaDiagnostic[] = [];
  if (source.trim() === "") {
    return {
      source,
      expression: null,
      diagnostics: [
        {
          from: 0,
          to: 0,
          message: "This Transformer has no Formula yet, so it produces nothing.",
          severity: "blocking",
          category: "emptyFormula",
        },
      ],
      value: null,
      type: "unknown",
      blocked: true,
    };
  }

  let expression: Expression | null = null;
  try {
    expression = parse(source);
  } catch (error) {
    const failed = error as ParseFailure;
    return {
      source,
      expression: null,
      diagnostics: [
        {
          from: failed.from,
          to: Math.max(failed.to, failed.from + 1),
          message: failed.message,
          severity: "blocking",
          category: "parseError",
        },
      ],
      value: null,
      type: "unknown",
      blocked: true,
    };
  }

  const type = check(expression, scope, diagnostics);

  if (scope.expected && type !== "unknown" && !sameType(type, scope.expected)) {
    diagnostics.push({
      from: expression.from,
      to: expression.to,
      message:
        scope.expected === "boolean"
          ? `Filter predicate must return Boolean, but this Formula returns ${typeName(type)}.`
          : `Calculate Formula can produce ${typeName(type)}, but its declared output Type is ${typeName(scope.expected)}.`,
      severity: "blocking",
      category: "outputTypeMismatch",
    });
  }

  const blocked = diagnostics.some((diagnostic) => diagnostic.severity === "blocking");
  const value = blocked ? null : evaluate(expression, scope);
  if (value?.kind === "failure") {
    diagnostics.push({
      from: value.from,
      to: value.to,
      message: value.message,
      severity: "runtime",
      category: value.category,
    });
  }
  if (value?.kind === "absent") {
    diagnostics.push({
      from: expression.from,
      to: expression.to,
      message: `Right now this produces nothing: ${value.because}.`,
      severity: "runtime",
      category: "missingRequiredValue",
    });
  }

  return { source, expression, diagnostics, value, type, blocked };
}

function check(
  expression: Expression,
  scope: FormulaScope,
  diagnostics: FormulaDiagnostic[],
): FormulaType {
  switch (expression.type) {
    case "number":
    case "text":
    case "boolean":
      return expression.type;
    case "identifier": {
      if (scope.itemBinding && expression.name === scope.itemBinding.name) {
        return scope.itemBinding.type;
      }
      const port = scope.ports.find((candidate) => candidate.name === expression.name);
      if (!port) {
        const names = scope.ports.map((candidate) => candidate.name);
        diagnostics.push({
          from: expression.from,
          to: expression.to,
          message: names.length
            ? `Input "${expression.name}" is not an input of this Transformer. Its inputs are ${listed(names)}.`
            : `Input "${expression.name}" is not an input of this Transformer, which has no inputs yet.`,
          severity: "blocking",
          category: "unknownInput",
        });
        return "unknown";
      }
      return port.type;
    }
    case "field": {
      const target = check(expression.target, scope, diagnostics);
      return fieldType(target, expression, scope, diagnostics);
    }
    case "index": {
      const target = check(expression.target, scope, diagnostics);
      check(expression.index, scope, diagnostics);
      if (target === "unknown") return "unknown";
      if (typeof target === "object" && "array" in target) return target.array;
      if (target === "text") return "text";
      diagnostics.push({
        from: expression.from,
        to: expression.to,
        message: `Cannot index ${typeName(target)}; indexing requires an Array or text value.`,
        severity: "blocking",
        category: "invalidIndexing",
      });
      return "unknown";
    }
    case "call": {
      const entry = catalogueEntry(expression.name);
      if (!entry) {
        diagnostics.push({
          from: expression.nameFrom,
          to: expression.nameTo,
          message: `Function "${expression.name}" isn't in the catalogue. Available: ${listed(
            CATALOGUE.map((candidate) => candidate.name),
          )}.`,
          severity: "blocking",
          category: "unknownFunction",
        });
        for (const argument of expression.args) check(argument, scope, diagnostics);
        return "unknown";
      }
      const argumentTypes = expression.args.map((argument) => check(argument, scope, diagnostics));
      const [minimum, maximum] = entry.arity;
      if (expression.args.length < minimum || expression.args.length > maximum) {
        const expected =
          minimum === maximum
            ? `${minimum} ${minimum === 1 ? "argument" : "arguments"}`
            : `${minimum} to ${maximum} arguments`;
        diagnostics.push({
          from: expression.from,
          to: expression.to,
          message: `Function "${entry.name}" expects ${expected}, but received ${expression.args.length}.`,
          severity: "blocking",
          category: "wrongArity",
        });
        return "unknown";
      }
      return entry.returns(argumentTypes);
    }
    case "unary": {
      const operand = check(expression.operand, scope, diagnostics);
      return expression.operator === "!" ? "boolean" : operand === "unknown" ? "unknown" : "number";
    }
    case "binary": {
      const left = check(expression.left, scope, diagnostics);
      const right = check(expression.right, scope, diagnostics);
      return binaryType(expression, left, right, diagnostics);
    }
    case "ternary": {
      check(expression.test, scope, diagnostics);
      const whenTrue = check(expression.whenTrue, scope, diagnostics);
      const whenFalse = check(expression.whenFalse, scope, diagnostics);
      return sameType(whenTrue, whenFalse) ? whenTrue : "unknown";
    }
  }
}

function fieldType(
  target: FormulaType,
  expression: Extract<Expression, { type: "field" }>,
  scope: FormulaScope,
  diagnostics: FormulaDiagnostic[],
): FormulaType {
  if (target === "unknown") return "unknown";
  // #667: field access auto-maps one level over an array.
  if (typeof target === "object" && "array" in target) {
    const mapped = fieldType(target.array, expression, scope, diagnostics);
    return mapped === "unknown" ? "unknown" : { array: mapped };
  }
  if (typeof target === "object" && "record" in target) {
    const fields = scope.shapes[target.record];
    const field = fields?.[expression.name];
    if (!field) {
      diagnostics.push({
        from: expression.nameFrom,
        to: expression.nameTo,
        message: `Field "${expression.name}" was not found on Shape "${target.record}".${
          fields ? ` It has ${listed(Object.keys(fields))}.` : ""
        }`,
        severity: "blocking",
        category: "unknownField",
      });
      return "unknown";
    }
    return field;
  }
  diagnostics.push({
    from: expression.from,
    to: expression.to,
    message: `Cannot read field "${expression.name}" from ${typeName(target)}; field access requires a Shape.`,
    severity: "blocking",
    category: "invalidFieldAccess",
  });
  return "unknown";
}

function binaryType(
  expression: Extract<Expression, { type: "binary" }>,
  left: FormulaType,
  right: FormulaType,
  diagnostics: FormulaDiagnostic[],
): FormulaType {
  const { operator } = expression;
  if (operator === "&") return "text";
  if (operator === "&&" || operator === "||") return "boolean";
  if (operator === "==" || operator === "!=") return "boolean";
  if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
    for (const [side, type] of [
      ["left", left],
      ["right", right],
    ] as const) {
      if (typeof type === "object") {
        diagnostics.push({
          from: side === "left" ? expression.left.from : expression.right.from,
          to: side === "left" ? expression.left.to : expression.right.to,
          message: `Cannot compare ${typeName(type)}; comparison needs a single number or text value.`,
          severity: "blocking",
          category: "typeMismatch",
        });
      }
    }
    return "boolean";
  }
  // #667: `+` is numeric with an explicit text overload; the rest are numeric.
  if (operator === "+" && (left === "text" || right === "text")) return "text";
  for (const [node, type] of [
    [expression.left, left],
    [expression.right, right],
  ] as const) {
    if (type === "text" || type === "boolean" || typeof type === "object") {
      diagnostics.push({
        from: node.from,
        to: node.to,
        message: `Cannot use ${typeName(type)} with "${operator}"; it needs numbers. Use "&" to join text.`,
        severity: "blocking",
        category: "typeMismatch",
      });
    }
  }
  return "number";
}

function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "nothing";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Evaluation over the scope's current values
// ---------------------------------------------------------------------------

export function evaluate(expression: Expression, scope: FormulaScope): FormulaValue {
  switch (expression.type) {
    case "number":
      return number(expression.value);
    case "text":
      return text(expression.value);
    case "boolean":
      return boolean(expression.value);
    case "identifier": {
      if (scope.itemBinding && expression.name === scope.itemBinding.name) {
        return scope.itemBinding.value;
      }
      const port = scope.ports.find((candidate) => candidate.name === expression.name);
      return port?.value ?? absent(`input "${expression.name}" has no value`);
    }
    case "field": {
      const target = evaluate(expression.target, scope);
      return readField(target, expression.name);
    }
    case "index": {
      const target = evaluate(expression.target, scope);
      const index = evaluate(expression.index, scope);
      if (target.kind === "failure") return target;
      if (index.kind === "failure") return index;
      if (target.kind === "absent" || index.kind === "absent") {
        return absent("the value being indexed is empty");
      }
      if (index.kind !== "number") {
        return failure("invalidIndex", "An index must be a number.", expression.index);
      }
      if (target.kind === "text") {
        return text(target.value[index.value] ?? "");
      }
      if (target.kind !== "array") {
        return failure(
          "typeMismatch",
          `Cannot index ${typeName(staticTypeOfValue(target))}; indexing requires an Array or text value.`,
          expression,
        );
      }
      return target.items[index.value] ?? absent(`there is no item ${index.value}`);
    }
    case "call": {
      const entry = catalogueEntry(expression.name);
      if (!entry) return absent(`Function "${expression.name}" is unknown`);
      const evaluated = expression.args.map((argument) => evaluate(argument, scope));
      return entry.call(evaluated, expression, () => evaluated);
    }
    case "unary": {
      const operand = evaluate(expression.operand, scope);
      if (operand.kind === "failure" || operand.kind === "absent") return operand;
      if (expression.operator === "!") {
        return operand.kind === "boolean"
          ? boolean(!operand.value)
          : failure("typeMismatch", '"!" needs true or false.', expression);
      }
      return operand.kind === "number"
        ? number(-operand.value)
        : failure("typeMismatch", "Only a number can be negated.", expression);
    }
    case "binary":
      return evaluateBinary(expression, scope);
    case "ternary": {
      const test = evaluate(expression.test, scope);
      if (test.kind === "failure") return test;
      if (test.kind !== "boolean") return absent("the choice had nothing to test");
      return evaluate(test.value ? expression.whenTrue : expression.whenFalse, scope);
    }
  }
}

function readField(target: FormulaValue, name: string): FormulaValue {
  if (target.kind === "failure" || target.kind === "absent") return target;
  // #667: one level of auto-mapping, so `candidates.votes` is the array of votes.
  if (target.kind === "array") {
    return { kind: "array", items: target.items.map((item) => readField(item, name)) };
  }
  if (target.kind !== "record") {
    return failure(
      "typeMismatch",
      `Cannot read field "${name}" from ${typeName(staticTypeOfValue(target))}; field access requires a Shape.`,
      { from: 0, to: 0 },
    );
  }
  return target.fields[name] ?? absent(`"${name}" is empty on this ${target.shape}`);
}

function evaluateBinary(
  expression: Extract<Expression, { type: "binary" }>,
  scope: FormulaScope,
): FormulaValue {
  const { operator } = expression;
  const left = evaluate(expression.left, scope);
  // #667: lazy control flow, so a false `&&` never evaluates its right side.
  if (operator === "&&" && left.kind === "boolean" && !left.value) return boolean(false);
  if (operator === "||" && left.kind === "boolean" && left.value) return boolean(true);
  const right = evaluate(expression.right, scope);
  if (left.kind === "failure") return left;
  if (right.kind === "failure") return right;

  if (operator === "&") {
    // Unconditional concatenation: absence joins as nothing, as a blank cell does.
    return text(`${asText(left)}${asText(right)}`);
  }
  if (operator === "==" || operator === "!=") {
    const equal = deepEqual(left, right);
    return boolean(operator === "==" ? equal : !equal);
  }
  if (left.kind === "absent") return absent(left.because);
  if (right.kind === "absent") return absent(right.because);

  if (operator === "&&" || operator === "||") {
    if (left.kind !== "boolean" || right.kind !== "boolean") {
      return failure(
        "typeMismatch",
        `"${operator}" needs true or false on both sides.`,
        expression,
      );
    }
    return boolean(operator === "&&" ? left.value && right.value : left.value || right.value);
  }

  if (operator === "+" && (left.kind === "text" || right.kind === "text")) {
    return text(`${asText(left)}${asText(right)}`);
  }

  if (left.kind !== "number" || right.kind !== "number") {
    return failure(
      "typeMismatch",
      `Cannot use ${typeName(staticTypeOfValue(left.kind === "number" ? right : left))} with "${operator}"; it needs numbers.`,
      expression,
    );
  }
  switch (operator) {
    case "+":
      return number(left.value + right.value);
    case "-":
      return number(left.value - right.value);
    case "*":
      return number(left.value * right.value);
    case "/":
      return right.value === 0
        ? failure("divisionByZero", "Cannot divide by zero.", expression)
        : number(left.value / right.value);
    case "%":
      return right.value === 0
        ? failure("divisionByZero", "Cannot take a remainder by zero.", expression)
        : number(left.value % right.value);
    case "<":
      return boolean(left.value < right.value);
    case "<=":
      return boolean(left.value <= right.value);
    case ">":
      return boolean(left.value > right.value);
    case ">=":
      return boolean(left.value >= right.value);
    default:
      return absent(`"${operator}" is not implemented in this prototype`);
  }
}

function deepEqual(left: FormulaValue, right: FormulaValue): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "array" && right.kind === "array") {
    return (
      left.items.length === right.items.length &&
      left.items.every((item, index) => deepEqual(item, right.items[index]!))
    );
  }
  if (left.kind === "record" && right.kind === "record") {
    const names = new Set([...Object.keys(left.fields), ...Object.keys(right.fields)]);
    return [...names].every((name) =>
      deepEqual(left.fields[name] ?? absent(name), right.fields[name] ?? absent(name)),
    );
  }
  if (left.kind === "absent") return true;
  return "value" in left && "value" in right ? left.value === right.value : false;
}

/** How a value reads in the preview strip and inside `&`. */
export function asText(value: FormulaValue): string {
  switch (value.kind) {
    case "text":
      return value.value;
    case "number":
      return `${Math.round(value.value * 1000) / 1000}`;
    case "boolean":
      return value.value ? "true" : "false";
    case "absent":
      return "";
    case "failure":
      return "⚠";
    case "record":
      return `${value.shape} (${Object.entries(value.fields)
        .slice(0, 2)
        .map(([name, field]) => `${name}: ${asText(field)}`)
        .join(", ")})`;
    case "array":
      return value.items.map((item) => asText(item)).join(", ");
  }
}

/** The preview strip's rendering, which has to show emptiness as something. */
export function previewText(value: FormulaValue | null): string {
  if (!value) return "—";
  if (value.kind === "absent") return "(nothing)";
  if (value.kind === "failure") return "(failed)";
  if (value.kind === "array" && value.items.length === 0) return "(no items)";
  if (value.kind === "text" && value.value === "") return "(empty text)";
  return asText(value);
}
