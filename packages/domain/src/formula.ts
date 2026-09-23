/*
 * Formula parser and deterministic synchronous evaluator.
 *
 * The grammar is derived from TomFrost/Jexl v2.3.0 (29d1ac0), MIT licensed.
 * The evaluator is intentionally owned here: JavaScript coercion, globals,
 * promises, and stock JEXL's first-array-item member access are not part of
 * the Formula contract.
 */

import type { AnyStructuredValueId } from "./structured-values";

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export type FormulaValue =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "boolean"; value: boolean }
  | {
      kind: "record";
      shape: string;
      fields: Record<string, FormulaValue>;
      reference?: AnyStructuredValueId;
    }
  | { kind: "array"; items: FormulaValue[]; reference?: AnyStructuredValueId }
  | { kind: "absent"; because: string }
  | { kind: "failure"; category: FailureCategory; message: string; from: number; to: number };

/** Stable runtime diagnostic categories. */
export type FailureCategory =
  | "missingRequiredValue"
  | "invalidFieldValue"
  | "typeMismatch"
  | "divisionByZero"
  | "nonFiniteNumber"
  | "invalidIndex"
  | "invalidFunctionArgument"
  | "evaluationLimitExceeded"
  | "constructedValueLimitExceeded";

export const absent = (because: string): Extract<FormulaValue, { kind: "absent" }> => ({
  kind: "absent",
  because,
});
export const number = (value: number): Extract<FormulaValue, { kind: "number" }> => ({
  kind: "number",
  value,
});
export const text = (value: string): Extract<FormulaValue, { kind: "text" }> => ({
  kind: "text",
  value,
});
export const boolean = (value: boolean): Extract<FormulaValue, { kind: "boolean" }> => ({
  kind: "boolean",
  value,
});

/** Static Types used by validation. `unknown` means "not provably invalid". */
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

/** Shape field Types keyed by stable Shape id. */
export type ShapeTable = Readonly<Record<string, Readonly<Record<string, FormulaType>>>>;

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
  "//",
  "|",
  "&",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "!",
  "?",
  ":",
] as const;

const IDENT_START = /[A-Za-z_$\u00c0-\u024f\u0400-\u04ff]/;
const IDENT_PART = /[A-Za-z0-9_$\u00c0-\u024f\u0400-\u04ff]/;

/** NFC-normalises a user-authored Formula identifier. */
export function normalizeFormulaIdentifier(value: string): string {
  return value.normalize("NFC");
}

/** Whether a port name is a legal, non-reserved Formula identifier. */
export function isFormulaIdentifier(value: string): boolean {
  const normalizedValue = normalizeFormulaIdentifier(value);
  if (!normalizedValue || !IDENT_START.test(normalizedValue[0]!)) return false;
  for (const character of normalizedValue.slice(1)) {
    if (!IDENT_PART.test(character)) return false;
  }
  const normalized = normalizedValue.toLowerCase();
  return (
    normalized !== "true" &&
    normalized !== "false" &&
    normalized !== "in" &&
    normalizedValue !== "item" &&
    normalizedValue !== "index"
  );
}

export const normaliseFormulaIdentifier = normalizeFormulaIdentifier;
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
      const normalized = word.toLowerCase();
      const followedByCall = /^\s*\(/.test(source.slice(index));
      const kind: TokenKind =
        normalized === "true" || normalized === "false"
          ? "boolean"
          : normalized === "in"
            ? "operator"
            : followedByCall
              ? "function"
              : "identifier";
      tokens.push({ kind, text: normalized === "in" ? normalized : word, from, to: index });
      continue;
    }
    if (
      char === "." ||
      char === "(" ||
      char === ")" ||
      char === "[" ||
      char === "]" ||
      char === "{" ||
      char === "}" ||
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
  | ({ type: "relative"; name: string; nameFrom: number; nameTo: number } & Span)
  | ({ type: "field"; target: Expression; name: string; nameFrom: number; nameTo: number } & Span)
  | ({ type: "index"; target: Expression; index: Expression } & Span)
  | ({ type: "filter"; target: Expression; predicate: Expression } & Span)
  | ({ type: "array"; elements: Expression[] } & Span)
  | ({ type: "object"; entries: Array<{ key: string; value: Expression }> } & Span)
  | ({
      type: "call";
      name: string;
      args: Expression[];
      nameFrom: number;
      nameTo: number;
      pool?: "functions" | "transforms";
    } & Span)
  | ({ type: "invoke"; target: Expression; args: Expression[] } & Span)
  | ({ type: "unary"; operator: string; operand: Expression } & Span)
  | ({ type: "binary"; operator: string; left: Expression; right: Expression } & Span)
  | ({
      type: "ternary";
      test: Expression;
      whenTrue?: Expression;
      whenFalse: Expression;
    } & Span);

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
  "<": 3,
  "<=": 3,
  ">": 3,
  ">=": 3,
  in: 3,
  "&": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "//": 6,
  "%": 7,
  "^": 7,
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
  function parseArguments(): { args: Expression[]; close: Token } {
    const args: Expression[] = [];
    if (peek()?.text !== ")") {
      for (;;) {
        args.push(parseExpression(0));
        if (peek()?.text !== ",") break;
        position += 1;
      }
    }
    return { args, close: expect(")", 'a closing ")"') };
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
        return { type: "text", value: unquote(token.text), from: token.from, to: token.to };
      case "boolean":
        return {
          type: "boolean",
          value: token.text.toLowerCase() === "true",
          from: token.from,
          to: token.to,
        };
      case "function": {
        expect("(", 'an opening "(" for the Function call');
        const { args, close } = parseArguments();
        return {
          type: "call",
          name: token.text,
          args,
          nameFrom: token.from,
          nameTo: token.to,
          pool: "functions",
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
      case "punctuation": {
        if (token.text === "(") {
          const inner = parseExpression(0);
          const close = expect(")", 'a closing ")"');
          return { ...inner, from: token.from, to: close.to };
        }
        if (token.text === ".") {
          const name = peek();
          if (!name || (name.kind !== "identifier" && name.kind !== "function")) {
            const span = name ?? endSpan();
            throw new ParseFailure(
              `Formula could not be parsed ${nearby(name)}: expected a relative field name.`,
              span.from,
              span.to,
            );
          }
          position += 1;
          return {
            type: "relative",
            name: name.text,
            nameFrom: name.from,
            nameTo: name.to,
            from: token.from,
            to: name.to,
          };
        }
        if (token.text === "[") {
          const elements: Expression[] = [];
          if (peek()?.text !== "]") {
            for (;;) {
              elements.push(parseExpression(0));
              if (peek()?.text !== ",") break;
              position += 1;
            }
          }
          const close = expect("]", 'a closing "]"');
          return { type: "array", elements, from: token.from, to: close.to };
        }
        if (token.text === "{") {
          const entries: Array<{ key: string; value: Expression }> = [];
          if (peek()?.text !== "}") {
            for (;;) {
              const key = peek();
              if (
                !key ||
                (key.kind !== "identifier" && key.kind !== "function" && key.kind !== "string")
              ) {
                const span = key ?? endSpan();
                throw new ParseFailure(
                  `Formula could not be parsed ${nearby(key)}: expected an object key.`,
                  span.from,
                  span.to,
                );
              }
              position += 1;
              expect(":", 'a ":" after the object key');
              entries.push({
                key: key.kind === "string" ? unquote(key.text) : key.text,
                value: parseExpression(0),
              });
              if (peek()?.text !== ",") break;
              position += 1;
            }
          }
          const close = expect("}", 'a closing "}"');
          return { type: "object", entries, from: token.from, to: close.to };
        }
        throw new ParseFailure(
          `Formula could not be parsed near "${token.text}": expected a value.`,
          token.from,
          token.to,
        );
      }
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
        const selector = parseExpression(0);
        const close = expect("]", 'a closing "]"');
        current = containsRelative(selector)
          ? {
              type: "filter",
              target: current,
              predicate: selector,
              from: current.from,
              to: close.to,
            }
          : { type: "index", target: current, index: selector, from: current.from, to: close.to };
        continue;
      }
      if (token?.text === "(") {
        position += 1;
        const { args, close } = parseArguments();
        current = { type: "invoke", target: current, args, from: current.from, to: close.to };
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
        const elvis = peek()?.text === ":";
        const whenTrue = elvis ? undefined : parseExpression(0);
        expect(":", 'a ":" to finish the choice');
        const whenFalse = parseExpression(0);
        left = {
          type: "ternary",
          test: left,
          ...(whenTrue ? { whenTrue } : {}),
          whenFalse,
          from: left.from,
          to: whenFalse.to,
        };
        continue;
      }
      if (token.text === "|" && 8 > minimum) {
        position += 1;
        const name = peek();
        if (!name || (name.kind !== "identifier" && name.kind !== "function")) {
          const span = name ?? endSpan();
          throw new ParseFailure(
            `Formula could not be parsed ${nearby(name)}: expected a Function after "|".`,
            span.from,
            span.to,
          );
        }
        position += 1;
        let args: Expression[] = [];
        let to = name.to;
        if (peek()?.text === "(") {
          position += 1;
          const parsed = parseArguments();
          args = parsed.args;
          to = parsed.close.to;
        }
        left = {
          type: "call",
          name: name.text,
          args: [left, ...args],
          nameFrom: name.from,
          nameTo: name.to,
          pool: "transforms",
          from: left.from,
          to,
        };
        continue;
      }
      // A `%` with nothing after it is the result's unit, written where Excel
      // writes it. Binary `%` needs a right operand, so every input this
      // admits is a parse failure today and no accepted Formula changes
      // meaning — `100 % 3` and `100%3` stay modulus (#740).
      if (token.text === "%" && position === tokens.length - 1) break;
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
  if (peek()?.text === "%" && position === tokens.length - 1) position += 1;
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

/**
 * Splits the trailing `%` result unit off a Formula. A size Property stores
 * the unit beside the Formula (#706), so this is the boundary that turns what
 * the author typed into those two fields — and back, for display.
 *
 * No suffix means pixels, exactly as a typed literal's does (#712).
 */
export function splitFormulaUnit(source: string): {
  readonly formula: string;
  readonly unit: "px" | "%";
} {
  const trimmed = source.trimEnd();
  return trimmed.endsWith("%")
    ? { formula: trimmed.slice(0, -1).trimEnd(), unit: "%" }
    : { formula: source, unit: "px" };
}

/** Rejoins a stored Formula and its unit into the text the author typed. */
export function joinFormulaUnit(formula: string, unit: "px" | "%" | undefined): string {
  return unit === "%" ? `${formula}%` : formula;
}
type CachedParse =
  | { readonly ok: true; readonly expression: Expression }
  | { readonly ok: false; readonly error: ParseFailure };

const FORMULA_PARSE_CACHE_LIMIT = 256;
const formulaParseCache = new Map<string, CachedParse>();

function parseCached(source: string): CachedParse {
  const cached = formulaParseCache.get(source);
  if (cached) return cached;
  let result: CachedParse;
  try {
    result = { ok: true, expression: parse(source) };
  } catch (error) {
    if (!(error instanceof ParseFailure)) throw error;
    result = { ok: false, error };
  }
  if (formulaParseCache.size >= FORMULA_PARSE_CACHE_LIMIT) {
    const oldest = formulaParseCache.keys().next().value;
    if (oldest !== undefined) formulaParseCache.delete(oldest);
  }
  formulaParseCache.set(source, result);
  return result;
}

function containsRelative(expression: Expression): boolean {
  switch (expression.type) {
    case "relative":
      return true;
    case "field":
      return containsRelative(expression.target);
    case "index":
      return containsRelative(expression.target) || containsRelative(expression.index);
    case "filter":
      return true;
    case "array":
      return expression.elements.some(containsRelative);
    case "object":
      return expression.entries.some((entry) => containsRelative(entry.value));
    case "call":
      return expression.args.some(containsRelative);
    case "invoke":
      return containsRelative(expression.target) || expression.args.some(containsRelative);
    case "unary":
      return containsRelative(expression.operand);
    case "binary":
      return containsRelative(expression.left) || containsRelative(expression.right);
    case "ternary":
      return (
        containsRelative(expression.test) ||
        (expression.whenTrue ? containsRelative(expression.whenTrue) : false) ||
        containsRelative(expression.whenFalse)
      );
    case "number":
    case "text":
    case "boolean":
    case "identifier":
      return false;
  }
}

function unquote(raw: string): string {
  return raw.slice(1, -1).replace(/\\(.)/g, "$1");
}

// ---------------------------------------------------------------------------
// Function catalogue (#670: IF, SUM, COUNT ship; the rest are its fast-follows)
// ---------------------------------------------------------------------------

export interface CatalogueParameter {
  readonly expected: string;
  readonly accepts: (type: FormulaType) => boolean;
}

export interface CatalogueEntry {
  readonly name: string;
  readonly arity: readonly [minimum: number, maximum: number];
  readonly signature: string;
  readonly summary: string;
  readonly pipeable: boolean;
  readonly parameters: readonly CatalogueParameter[];
  readonly returns: (args: readonly FormulaType[]) => FormulaType;
  readonly call: (
    args: readonly FormulaValue[],
    span: Span,
    budget: EvaluationBudget,
  ) => FormulaValue;
}

const ARRAY_PARAMETER: CatalogueParameter = {
  expected: "Array",
  accepts: (type) => type === "unknown" || (typeof type === "object" && "array" in type),
};

const ANY_PARAMETER: CatalogueParameter = {
  expected: "any value",
  accepts: () => true,
};
const BOOLEAN_PARAMETER: CatalogueParameter = {
  expected: "Boolean",
  accepts: (type) => type === "boolean" || type === "unknown",
};
const NUMBER_PARAMETER: CatalogueParameter = {
  expected: "Number",
  accepts: (type) => type === "number" || type === "unknown",
};
const TEXT_PARAMETER: CatalogueParameter = {
  expected: "Text",
  accepts: (type) => type === "text" || type === "unknown",
};

const NUMERIC_INPUT_PARAMETER: CatalogueParameter = {
  expected: "Number or Array of Number",
  accepts: (type) =>
    type === "number" ||
    type === "unknown" ||
    (typeof type === "object" &&
      "array" in type &&
      (type.array === "number" || type.array === "unknown")),
};

export const CATALOGUE = Object.freeze([
  {
    name: "IF",
    arity: [3, 3],
    signature: "IF(test, whenTrue, whenFalse)",
    summary: "Picks one of two values. Only the selected branch is evaluated.",
    pipeable: false,
    parameters: [BOOLEAN_PARAMETER, ANY_PARAMETER, ANY_PARAMETER],
    returns: ([, whenTrue, whenFalse]) =>
      sameType(whenTrue ?? "unknown", whenFalse ?? "unknown") ? (whenTrue ?? "unknown") : "unknown",
    call: () => absent("IF must be evaluated lazily"),
  },
  {
    name: "SUM",
    arity: [1, 1],
    signature: "SUM(numbers)",
    summary: "Adds an array of numbers, skipping absent items.",
    pipeable: true,
    parameters: [NUMERIC_INPUT_PARAMETER],
    returns: () => "number",
    call: ([input], span, budget) =>
      aggregate(input, span, "SUM", budget, (numbers) => numbers.reduce((a, b) => a + b, 0)),
  },
  {
    name: "COUNT",
    arity: [1, 1],
    signature: "COUNT(items)",
    summary: "Counts present items.",
    pipeable: true,
    parameters: [ANY_PARAMETER],
    returns: () => "number",
    call: ([input], span, budget) => {
      if (!input || input.kind === "absent") return number(0);
      if (input.kind === "failure") return input;
      if (input.kind !== "array") return number(1);
      let count = 0;
      for (const item of input.items) {
        const exhausted = consumeStep(budget, span);
        if (exhausted) return exhausted;
        if (item.kind !== "absent") count += 1;
      }
      return number(count);
    },
  },
  {
    name: "MIN",
    arity: [1, 1],
    signature: "MIN(numbers)",
    summary: "Returns the smallest present number.",
    pipeable: true,
    parameters: [NUMERIC_INPUT_PARAMETER],
    returns: () => "number",
    call: ([input], span, budget) =>
      numericExtremum(input, span, "MIN", budget, (candidate, selected) => candidate < selected),
  },
  {
    name: "MAX",
    arity: [1, 1],
    signature: "MAX(numbers)",
    summary: "Returns the largest present number.",
    pipeable: true,
    parameters: [NUMERIC_INPUT_PARAMETER],
    returns: () => "number",
    call: ([input], span, budget) =>
      numericExtremum(input, span, "MAX", budget, (candidate, selected) => candidate > selected),
  },
  {
    name: "ROUND",
    arity: [2, 2],
    signature: "ROUND(number, precision)",
    summary: "Rounds a number to the requested decimal precision.",
    pipeable: true,
    parameters: [NUMBER_PARAMETER, NUMBER_PARAMETER],
    returns: () => "number",
    call: ([input, precision], span) => roundToPrecision(input, precision, span),
  },
  {
    name: "LEN",
    arity: [1, 1],
    signature: "LEN(text)",
    summary: "Returns the number of Unicode characters in text.",
    pipeable: true,
    parameters: [TEXT_PARAMETER],
    returns: () => "number",
    call: ([input], span) =>
      transformText(input, span, "LEN", (value) => {
        let length = 0;
        for (const _character of value) length += 1;
        return number(length);
      }),
  },
  {
    name: "UPPER",
    arity: [1, 1],
    signature: "UPPER(text)",
    summary: "Returns text converted to uppercase.",
    pipeable: true,
    parameters: [TEXT_PARAMETER],
    returns: () => "text",
    call: ([input], span) =>
      transformText(input, span, "UPPER", (value) => text(value.toUpperCase())),
  },
  {
    name: "LOWER",
    arity: [1, 1],
    signature: "LOWER(text)",
    summary: "Returns text converted to lowercase.",
    pipeable: true,
    parameters: [TEXT_PARAMETER],
    returns: () => "text",
    call: ([input], span) =>
      transformText(input, span, "LOWER", (value) => text(value.toLowerCase())),
  },
  {
    name: "FIRST",
    arity: [1, 1],
    signature: "FIRST(items)",
    summary: "Returns the first present array item.",
    pipeable: true,
    parameters: [ARRAY_PARAMETER],
    returns: ([input]) =>
      input && typeof input === "object" && "array" in input ? input.array : "unknown",
    call: ([input], span, budget) => presentArrayItem(input, span, "FIRST", budget, false),
  },
  {
    name: "LAST",
    arity: [1, 1],
    signature: "LAST(items)",
    summary: "Returns the last present array item.",
    pipeable: true,
    parameters: [ARRAY_PARAMETER],
    returns: ([input]) =>
      input && typeof input === "object" && "array" in input ? input.array : "unknown",
    call: ([input], span, budget) => presentArrayItem(input, span, "LAST", budget, true),
  },
] satisfies CatalogueEntry[]);
export const DEFERRED_FUNCTIONS = Object.freeze([] as const);

export function catalogueEntry(name: string): CatalogueEntry | undefined {
  const upper = name.toUpperCase();
  return CATALOGUE.find((entry) => entry.name === upper);
}

function failure(
  category: FailureCategory,
  message: string,
  span: Span,
): Extract<FormulaValue, { kind: "failure" }> {
  return { kind: "failure", category, message, from: span.from, to: span.to };
}

function aggregate(
  input: FormulaValue | undefined,
  span: Span,
  name: string,
  budget: EvaluationBudget,
  reduce: (numbers: number[]) => number,
): FormulaValue {
  if (!input || input.kind === "absent") return number(0);
  if (input.kind === "failure") return input;
  const items = input.kind === "array" ? input.items : [input];
  const numbers: number[] = [];
  for (const item of items) {
    const exhausted = consumeStep(budget, span);
    if (exhausted) return exhausted;
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
  return number(reduce(numbers));
}

function numericExtremum(
  input: FormulaValue | undefined,
  span: Span,
  name: string,
  budget: EvaluationBudget,
  replaces: (candidate: number, selected: number) => boolean,
): FormulaValue {
  if (!input || input.kind === "absent") return absent(`${name} has no present numbers`);
  if (input.kind === "failure") return input;
  const items = input.kind === "array" ? input.items : [input];
  let selected: number | undefined;
  for (const item of items) {
    const exhausted = consumeStep(budget, span);
    if (exhausted) return exhausted;
    if (item.kind === "failure") return item;
    if (item.kind === "absent") continue;
    if (item.kind !== "number") {
      return failure(
        "invalidFunctionArgument",
        `Function "${name}" cannot accept ${typeName(staticTypeOfValue(item))}; expected Number.`,
        span,
      );
    }
    if (selected === undefined || replaces(item.value, selected)) selected = item.value;
  }
  return selected === undefined ? absent(`${name} has no present numbers`) : number(selected);
}

function roundToPrecision(
  input: FormulaValue | undefined,
  precision: FormulaValue | undefined,
  span: Span,
): FormulaValue {
  if (!input || !precision) return absent("ROUND is missing an argument");
  if (input.kind === "failure") return input;
  if (precision.kind === "failure") return precision;
  if (input.kind === "absent") return input;
  if (precision.kind === "absent") return precision;
  if (input.kind !== "number" || precision.kind !== "number") {
    return failure("invalidFunctionArgument", "ROUND requires two Number arguments.", span);
  }
  if (!Number.isInteger(precision.value)) {
    return failure("invalidFunctionArgument", "ROUND precision must be a whole number.", span);
  }
  const shifted = shiftDecimal(input.value, precision.value);
  const rounded = Math.sign(shifted) * Math.round(Math.abs(shifted));
  const result = shiftDecimal(rounded, -precision.value);
  return Number.isFinite(result)
    ? number(result)
    : failure("nonFiniteNumber", "ROUND produced a non-finite number.", span);
}

function shiftDecimal(value: number, places: number): number {
  const [coefficient = "0", exponent = "0"] = value.toString().toLowerCase().split("e");
  return Number(`${coefficient}e${Number(exponent) + places}`);
}

function transformText(
  input: FormulaValue | undefined,
  span: Span,
  name: string,
  transform: (value: string) => FormulaValue,
): FormulaValue {
  if (!input) return absent(`${name} is missing an argument`);
  if (input.kind === "failure" || input.kind === "absent") return input;
  return input.kind === "text"
    ? transform(input.value)
    : failure("invalidFunctionArgument", `Function "${name}" requires Text.`, span);
}

function presentArrayItem(
  input: FormulaValue | undefined,
  span: Span,
  name: string,
  budget: EvaluationBudget,
  fromEnd: boolean,
): FormulaValue {
  if (!input) return absent(`${name} is missing an argument`);
  if (input.kind === "failure" || input.kind === "absent") return input;
  if (input.kind !== "array") {
    return failure("invalidFunctionArgument", `Function "${name}" requires an Array.`, span);
  }
  for (let offset = 0; offset < input.items.length; offset += 1) {
    const exhausted = consumeStep(budget, span);
    if (exhausted) return exhausted;
    const index = fromEnd ? input.items.length - offset - 1 : offset;
    const item = input.items[index];
    if (!item || item.kind === "absent") continue;
    return item;
  }
  return absent(`${name} has no present items`);
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
  transformerId?: string;
}

export const FORMULA_EVALUATION_STEP_LIMIT = 10_000;
export const FORMULA_CONSTRUCTED_VALUE_LIMIT = 1_000;
export interface EvaluationBudget {
  steps: number;
  constructedValues: number;
}
export interface FormulaScope {
  /** The node's named input ports, in order. */
  ports: readonly { name: string; type: FormulaType; value: FormulaValue }[];
  shapes: ShapeTable;
  /** Property Formula repeat binding. */
  itemBinding?: { name: string; type: FormulaType; value: FormulaValue };
  /** The 0-based position paired with itemBinding inside an expansion. */
  index?: number;
  /** Current item while a stock relative filter predicate is checked/evaluated. */
  relativeType?: FormulaType;
  relativeItem?: FormulaValue;
  /** Calculate's declared output Type; Filter's required Boolean. */
  expected?: FormulaType;
  budget?: EvaluationBudget;
  /** Whether the consuming Property carries a size unit, so `…%` is meaningful. */
  allowsUnit?: boolean;
  /** Noun used in diagnostics on non-Transformer consumers. */
  diagnosticSubject?: "Transformer" | "Element Property";
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

  const parsed = parseCached(source);
  if (!parsed.ok) {
    const failed = parsed.error;
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
  const expression = parsed.expression;

  const percentAt = scope.allowsUnit ? -1 : source.trimEnd().length - 1;
  if (percentAt >= 0 && source[percentAt] === "%") {
    diagnostics.push({
      from: percentAt,
      to: percentAt + 1,
      message: "A trailing % sets a size unit, and this Formula's result has no unit to set.",
      severity: "blocking",
      category: "unexpectedUnit",
    });
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
      if (scope.index !== undefined && expression.name === "index") return "number";
      if (scope.itemBinding && expression.name === scope.itemBinding.name) {
        return scope.itemBinding.type;
      }
      const port = scope.ports.find((candidate) => candidate.name === expression.name);
      if (!port) {
        const names = scope.ports.map((candidate) => candidate.name);
        const message = scope.diagnosticSubject
          ? names.length
            ? `${scope.diagnosticSubject} input "${expression.name}" is not available. Available inputs are ${listed(names)}.`
            : `${scope.diagnosticSubject} input "${expression.name}" is not available; it has no inputs yet.`
          : names.length
            ? `Input "${expression.name}" is not an input of this Transformer. Its inputs are ${listed(names)}.`
            : `Input "${expression.name}" is not an input of this Transformer, which has no inputs yet.`;
        diagnostics.push({
          from: expression.from,
          to: expression.to,
          message,
          severity: "blocking",
          category: "unknownInput",
        });
        return "unknown";
      }
      return port.type;
    }
    case "relative": {
      const target = scope.relativeType;
      if (!target || target === "unknown") return "unknown";
      if (typeof target === "object" && "record" in target) {
        const field = scope.shapes[target.record]?.[expression.name];
        if (field) return field;
        diagnostics.push({
          from: expression.nameFrom,
          to: expression.nameTo,
          message: `Field "${expression.name}" was not found on Shape "${target.record}".`,
          severity: "blocking",
          category: "unknownField",
        });
        return "unknown";
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
    case "filter": {
      const target = check(expression.target, scope, diagnostics);
      if (typeof target !== "object" || !("array" in target)) {
        diagnostics.push({
          from: expression.target.from,
          to: expression.target.to,
          message: "A relative filter requires an Array.",
          severity: "blocking",
          category: "invalidIndexing",
        });
        return "unknown";
      }
      const predicate = check(
        expression.predicate,
        { ...scope, relativeType: target.array },
        diagnostics,
      );
      if (predicate !== "boolean" && predicate !== "unknown") {
        diagnostics.push({
          from: expression.predicate.from,
          to: expression.predicate.to,
          message: `Filter predicate must return Boolean, but this Formula returns ${typeName(predicate)}.`,
          severity: "blocking",
          category: "outputTypeMismatch",
        });
      }
      return target;
    }
    case "array": {
      const types = expression.elements.map((element) => check(element, scope, diagnostics));
      const first = types[0] ?? "unknown";
      return { array: types.every((type) => sameType(type, first)) ? first : "unknown" };
    }
    case "object":
      for (const entry of expression.entries) check(entry.value, scope, diagnostics);
      return scope.expected && typeof scope.expected === "object" && "record" in scope.expected
        ? scope.expected
        : { record: "Object" };
    case "invoke":
      check(expression.target, scope, diagnostics);
      for (const argument of expression.args) check(argument, scope, diagnostics);
      return "unknown";
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
      if (expression.pool === "transforms" && !entry.pipeable) {
        diagnostics.push({
          from: expression.nameFrom,
          to: expression.nameTo,
          message: `Function "${entry.name}" cannot be used in a pipe.`,
          severity: "blocking",
          category: "invalidFunctionArgument",
        });
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
      for (const [index, argumentType] of argumentTypes.entries()) {
        const parameter = entry.parameters[index];
        const argument = expression.args[index];
        if (!parameter || !argument || parameter.accepts(argumentType)) continue;
        diagnostics.push({
          from: argument.from,
          to: argument.to,
          message: `Function "${entry.name}" expects ${parameter.expected} for argument ${index + 1}, but received ${typeName(argumentType)}.`,
          severity: "blocking",
          category: "invalidFunctionArgument",
        });
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
      const test = check(expression.test, scope, diagnostics);
      const whenTrue = expression.whenTrue ? check(expression.whenTrue, scope, diagnostics) : test;
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
  if (
    operator === "&&" ||
    operator === "||" ||
    operator === "==" ||
    operator === "!=" ||
    operator === "in"
  ) {
    return "boolean";
  }
  if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
    if (
      left !== "unknown" &&
      right !== "unknown" &&
      (left !== right || (left !== "number" && left !== "text"))
    ) {
      diagnostics.push({
        from: expression.from,
        to: expression.to,
        message: `Operator "${operator}" requires values of the same comparable Type.`,
        severity: "blocking",
        category: "typeMismatch",
      });
    }
    return "boolean";
  }
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

function consumeStep(budget: EvaluationBudget, span: Span): FormulaValue | null {
  budget.steps += 1;
  return budget.steps > FORMULA_EVALUATION_STEP_LIMIT
    ? failure(
        "evaluationLimitExceeded",
        `Formula evaluation exceeded ${FORMULA_EVALUATION_STEP_LIMIT.toLocaleString("en-US")} deterministic steps.`,
        span,
      )
    : null;
}
export function evaluate(expression: Expression, scope: FormulaScope): FormulaValue {
  const budget = scope.budget ?? { steps: 0, constructedValues: 0 };
  const exhausted = consumeStep(budget, expression);
  if (exhausted) return exhausted;
  const nestedScope = scope.budget ? scope : { ...scope, budget };
  switch (expression.type) {
    case "number":
      return number(expression.value);
    case "text":
      return text(expression.value);
    case "boolean":
      return boolean(expression.value);
    case "identifier": {
      if (scope.index !== undefined && expression.name === "index") return number(scope.index);
      if (scope.itemBinding && expression.name === scope.itemBinding.name) {
        return scope.itemBinding.value;
      }
      const port = scope.ports.find((candidate) => candidate.name === expression.name);
      return port?.value ?? absent(`input "${expression.name}" has no value`);
    }
    case "relative":
      return scope.relativeItem
        ? readField(scope.relativeItem, expression.name, budget, expression)
        : failure("invalidFieldValue", "A relative field was read outside a filter.", expression);
    case "field": {
      const target = evaluate(expression.target, nestedScope);
      return readField(target, expression.name, budget, expression);
    }
    case "index": {
      const target = evaluate(expression.target, nestedScope);
      const index = evaluate(expression.index, nestedScope);
      if (target.kind === "failure") return target;
      if (index.kind === "failure") return index;
      if (target.kind === "absent" || index.kind === "absent") {
        return absent("the value being indexed is absent");
      }
      if (index.kind !== "number" || !Number.isInteger(index.value)) {
        return failure("invalidIndex", "An index must be a whole number.", expression.index);
      }
      if (target.kind === "text") {
        const character = target.value[index.value];
        return character === undefined
          ? failure("invalidIndex", `There is no character at index ${index.value}.`, expression)
          : text(character);
      }
      if (target.kind !== "array") {
        return failure(
          "typeMismatch",
          `Cannot index ${typeName(staticTypeOfValue(target))}; indexing requires an Array or text value.`,
          expression,
        );
      }
      return (
        target.items[index.value] ??
        failure("invalidIndex", `There is no item at index ${index.value}.`, expression)
      );
    }
    case "filter": {
      const target = evaluate(expression.target, nestedScope);
      if (target.kind === "failure" || target.kind === "absent") return target;
      if (target.kind !== "array") {
        return failure("typeMismatch", "A relative filter requires an Array.", expression.target);
      }
      const items: FormulaValue[] = [];
      for (const item of target.items) {
        const traversal = consumeStep(budget, expression);
        if (traversal) return traversal;
        const predicate = evaluate(expression.predicate, {
          ...nestedScope,
          relativeItem: item,
        });
        if (predicate.kind === "failure") return predicate;
        if (predicate.kind === "boolean" && predicate.value) items.push(item);
      }
      return { kind: "array", items };
    }
    case "array":
      return {
        kind: "array",
        items: expression.elements.map((element) => evaluate(element, nestedScope)),
      };
    case "object":
      return {
        kind: "record",
        shape:
          scope.expected && typeof scope.expected === "object" && "record" in scope.expected
            ? scope.expected.record
            : "Object",
        fields: Object.fromEntries(
          expression.entries.map((entry) => [entry.key, evaluate(entry.value, nestedScope)]),
        ),
      };
    case "invoke":
      return failure(
        "invalidFunctionArgument",
        "Only named catalogue Functions can be called.",
        expression,
      );
    case "call": {
      const entry = catalogueEntry(expression.name);
      if (!entry) return absent(`Function "${expression.name}" is unknown`);
      if (entry.name === "IF") {
        const testExpression = expression.args[0];
        if (!testExpression) return absent("IF has no condition");
        const test = evaluate(testExpression, nestedScope);
        if (test.kind === "failure" || test.kind === "absent") return test;
        if (test.kind !== "boolean") {
          return failure("typeMismatch", "IF requires a Boolean condition.", testExpression);
        }
        const branch = expression.args[test.value ? 1 : 2];
        return branch ? evaluate(branch, nestedScope) : absent("IF has no selected branch");
      }
      const evaluated = expression.args.map((argument) => evaluate(argument, nestedScope));
      return entry.call(evaluated, expression, budget);
    }
    case "unary": {
      const operand = evaluate(expression.operand, nestedScope);
      if (operand.kind === "failure" || operand.kind === "absent") return operand;
      if (expression.operator === "!") {
        return operand.kind === "boolean"
          ? boolean(!operand.value)
          : failure("typeMismatch", '"!" needs true or false.', expression);
      }
      return operand.kind === "number"
        ? finiteNumber(-operand.value, expression)
        : failure("typeMismatch", "Only a number can be negated.", expression);
    }
    case "binary":
      return evaluateBinary(expression, nestedScope);
    case "ternary": {
      const test = evaluate(expression.test, nestedScope);
      if (!expression.whenTrue) {
        return test.kind === "absent" ? evaluate(expression.whenFalse, nestedScope) : test;
      }
      if (test.kind === "failure" || test.kind === "absent") return test;
      if (test.kind !== "boolean") {
        return failure("typeMismatch", "A Formula choice requires true or false.", expression.test);
      }
      return evaluate(test.value ? expression.whenTrue : expression.whenFalse, nestedScope);
    }
  }
}

function readField(
  target: FormulaValue,
  name: string,
  budget: EvaluationBudget,
  span: Span,
): FormulaValue {
  if (target.kind === "failure" || target.kind === "absent") return target;
  if (target.kind === "array") {
    const items: FormulaValue[] = [];
    for (const item of target.items) {
      const exhausted = consumeStep(budget, span);
      if (exhausted) return exhausted;
      items.push(readField(item, name, budget, span));
    }
    return { kind: "array", items };
  }
  if (target.kind !== "record") {
    return failure(
      "typeMismatch",
      `Cannot read field "${name}" from ${typeName(staticTypeOfValue(target))}; field access requires a Shape.`,
      span,
    );
  }
  return target.fields[name] ?? absent(`"${name}" is absent on this ${target.shape}`);
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
    if (left.kind === "absent") return left;
    if (right.kind === "absent") return right;
    if (!isSimple(left) || !isSimple(right)) {
      return failure("typeMismatch", '"&" joins simple values, not Shapes or arrays.', expression);
    }
    return text(`${asText(left)}${asText(right)}`);
  }
  if (operator === "==" || operator === "!=") {
    const equal = deepEqual(left, right);
    return boolean(operator === "==" ? equal : !equal);
  }
  if (left.kind === "absent") return absent(left.because);
  if (right.kind === "absent") return absent(right.because);
  if (operator === "in") {
    if (right.kind === "text" && left.kind === "text") {
      return boolean(right.value.includes(left.value));
    }
    if (right.kind === "array") {
      return boolean(right.items.some((item) => deepEqual(left, item)));
    }
    return failure(
      "typeMismatch",
      '"in" requires text on both sides or an Array on the right.',
      expression,
    );
  }

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
    if (!isSimple(left) || !isSimple(right)) {
      return failure("typeMismatch", '"+" cannot join a Shape or array.', expression);
    }
    return text(`${asText(left)}${asText(right)}`);
  }

  if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") {
    if ((left.kind !== "number" && left.kind !== "text") || left.kind !== right.kind) {
      return failure(
        "typeMismatch",
        `Operator "${operator}" requires values of the same comparable Type.`,
        expression,
      );
    }
    if (left.kind === "number" && right.kind === "number") {
      if (operator === "<") return boolean(left.value < right.value);
      if (operator === "<=") return boolean(left.value <= right.value);
      if (operator === ">") return boolean(left.value > right.value);
      return boolean(left.value >= right.value);
    }
    if (left.kind === "text" && right.kind === "text") {
      if (operator === "<") return boolean(left.value < right.value);
      if (operator === "<=") return boolean(left.value <= right.value);
      if (operator === ">") return boolean(left.value > right.value);
      return boolean(left.value >= right.value);
    }
  }

  if (left.kind !== "number" || right.kind !== "number") {
    return failure(
      "typeMismatch",
      `Cannot use ${typeName(staticTypeOfValue(left.kind === "number" ? right : left))} with "${operator}"; it needs numbers.`,
      expression,
    );
  }
  let result: number;
  switch (operator) {
    case "+":
      result = left.value + right.value;
      break;
    case "-":
      result = left.value - right.value;
      break;
    case "*":
      result = left.value * right.value;
      break;
    case "/":
    case "//":
    case "%":
      if (right.value === 0) {
        return failure("divisionByZero", "Cannot divide by zero.", expression);
      }
      result =
        operator === "/"
          ? left.value / right.value
          : operator === "//"
            ? Math.floor(left.value / right.value)
            : left.value % right.value;
      break;
    case "^":
      result = left.value ** right.value;
      break;
    default:
      return failure("typeMismatch", `Operator "${operator}" is not supported.`, expression);
  }
  return finiteNumber(result, expression);
}
function finiteNumber(value: number, span: Span): FormulaValue {
  return Number.isFinite(value)
    ? number(value)
    : failure("nonFiniteNumber", "This calculation did not produce a finite number.", span);
}
function isSimple(
  value: FormulaValue,
): value is Extract<FormulaValue, { kind: "number" | "text" | "boolean" }> {
  return value.kind === "number" || value.kind === "text" || value.kind === "boolean";
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
