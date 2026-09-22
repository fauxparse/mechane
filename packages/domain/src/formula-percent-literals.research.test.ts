/*
 * Research spike for #715: percentage literals in the Formula language.
 *
 * Throwaway evidence for docs/research/formula-percentage-literals.md. It
 * documents, on main's grammar, (1) what `lex`/`parse`/`analyse` do today on
 * the ambiguity corpus around `%`, (2) the behaviour of the candidate lexical
 * rule — a `%` glued to a preceding numeric literal (no intervening
 * whitespace) and not followed by an operand — simulated as a token-stream
 * fold, (3) the backward-compatibility property of that rule, and (4) the
 * arithmetic the real evaluator produces once percentage literals are folded
 * to bare numbers. Delete when the language decision lands.
 */
import { describe, expect, it } from "vitest";
import { analyse, lex, parse, type Token } from "./formula";

const EMPTY_SCOPE = { ports: [], shapes: {} };

function accepts(source: string): boolean {
  try {
    parse(source);
    return true;
  } catch {
    return false;
  }
}

function valueOf(source: string): string {
  const analysis = analyse(source, EMPTY_SCOPE);
  if (analysis.blocked) return `blocked(${analysis.diagnostics[0]?.category})`;
  const value = analysis.value;
  if (value.kind === "failure") return `failure:${value.category}`;
  return "value" in value ? `${value.kind}:${JSON.stringify(value.value)}` : value.kind;
}

// --- 1. Current behaviour on the ticket's ambiguity corpus -------------------

const TODAY: ReadonlyArray<
  readonly [source: string, tokens: string, parses: boolean, value: string | null]
> = [
  ["100%", "number,operator%", false, null],
  ["100 % 3", "number,operator%,number", true, "number:1"],
  ["100%3", "number,operator%,number", true, "number:1"],
  ["100 %3", "number,operator%,number", true, "number:1"],
  ["100% 3", "number,operator%,number", true, "number:1"],
  ["a%b", "identifier,operator%,identifier", true, "blocked(unknownInput)"],
  ["a % b", "identifier,operator%,identifier", true, "blocked(unknownInput)"],
  ["100%)", "number,operator%,punct)", false, null],
  ["(100%)", "punct(,number,operator%,punct)", false, null],
  ["100%,", "number,operator%,punct,", false, null],
  ["100%%", "number,operator%,operator%", false, null],
  ["(a+b)%", "punct(,identifier,operator+,identifier,punct),operator%", false, null],
  ["50%", "number,operator%", false, null],
  ["2.5%", "number,operator%", false, null],
  [".5%", "number,operator%", false, null],
  ["100%-5", "number,operator%,operator-,number", true, "number:0"],
  ["100%(b)", "number,operator%,punct(,identifier,punct)", true, "blocked(unknownInput)"],
  ["100%[0]", "number,operator%,punct[,number,punct]", true, "blocked(typeMismatch)"],
  ["100%.5", "number,operator%,number", true, "number:0"],
  ["100%.name", "number,operator%,punct.,identifier", true, "failure:invalidFieldValue"],
  ["2^50%", "number,operator^,number,operator%", false, null],
  ["100 % 0", "number,operator%,number", true, "failure:divisionByZero"],
];

describe("#715 current grammar", () => {
  it.each(TODAY)("%j → tokens %j, parses %j, value %j", (source, tokens, parses, value) => {
    const rendered = lex(source)
      .map((token) =>
        token.kind === "operator"
          ? `operator${token.text}`
          : token.kind === "punctuation"
            ? `punct${token.text}`
            : token.kind,
      )
      .join(",");
    expect(rendered).toBe(tokens);
    expect(accepts(source)).toBe(parses);
    if (value !== null) expect(valueOf(source)).toBe(value);
  });

  it("rejects `100%` with the missing-operand parse failure, not an invalid token", () => {
    const failure = (() => {
      try {
        parse("100%");
        return undefined;
      } catch (error) {
        return error instanceof Error ? error : undefined;
      }
    })();
    expect(failure?.message).toContain("expected a value");
  });
});

// --- 2. The candidate lexical rule, simulated over real token spans ---------
//
// "Glued": the operator-% token starts exactly where the preceding number
// token ends (tokens carry from/to, so adjacency survives lexing).
// "Operand": any token that can begin an Expression per parsePrimary
// (formula.ts:316-455): number, string, boolean, identifier, function,
// punctuation ( [ { ., and the unary operators - and !.

function startsExpression(token: Token | undefined): boolean {
  if (!token) return false;
  if (
    token.kind === "number" ||
    token.kind === "string" ||
    token.kind === "boolean" ||
    token.kind === "identifier" ||
    token.kind === "function"
  ) {
    return true;
  }
  if (token.kind === "punctuation") return ["(", "[", "{", "."].includes(token.text);
  if (token.kind === "operator") return token.text === "-" || token.text === "!";
  return false;
}

/** Folds `N%` (and chains, `N%%`) into the number N/100 per run of glued `%`
 *  tokens not followed by an operand; returns the rewritten source. */
function foldPercentLiterals(source: string): string {
  const tokens = lex(source);
  let out = source;
  // Walk right-to-left so earlier rewrites do not shift later token spans.
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i]!;
    if (token.kind !== "number") continue;
    let end = token.to;
    let magnitude = Number(token.text);
    let chain = 0;
    const glued = () => {
      const percent = tokens[i + 1 + chain];
      const previous = chain === 0 ? token : tokens[i + chain];
      return percent !== undefined && previous !== undefined &&
        percent.kind === "operator" && percent.text === "%" && percent.from === previous.to;
    };
    while (glued() && !startsExpression(tokens[i + 2 + chain])) {
      magnitude /= 100;
      end = tokens[i + 1 + chain]!.to;
      chain += 1;
    }
    if (chain === 0) continue;
    out = out.slice(0, token.from) + `(${magnitude})` + out.slice(end);
  }
  return out;
}

describe("#715 candidate rule: glued % not followed by an operand", () => {
  it.each([
    ["100%", "(1)"],
    ["50%", "(0.5)"],
    ["2.5%", "(0.025)"],
    [".5%", "(0.005)"],
    ["100%%", "(0.01)"],
    ["50% + 10", "(0.5) + 10"],
    ["50%*200", "(0.5)*200"],
    ["(100%)", "((1))"],
    ["IF(c, 50%, 0)", "IF(c, (0.5), 0)"],
    ["votes / total * 100%", "votes / total * (1)"],
    ["100 % 3", "100 % 3"],
    ["100%3", "100%3"],
    ["100 %3", "100 %3"],
    ["100% 3", "100% 3"],
    ["100%-5", "100%-5"],
    ["100%(b)", "100%(b)"],
    ["100%[0]", "100%[0]"],
    ["100%.5", "100%.5"],
    ["a%b", "a%b"],
    ["(a+b)%", "(a+b)%"],
    ["2^50%", "2^(0.5)"],
  ])("rewrites %j to %j", (source, expected) => {
    expect(foldPercentLiterals(source)).toBe(expected);
  });
});

// --- 3. Backward compatibility: the rule only reassigns parse failures ------

const LEFTS = ["100", "2.5", ".5", "50", "7"];
const GLUES = ["", " "];
const RIGHTS = [
  "", " 3", "3", " b", "b", "(b)", "[0]", "-5", "+5", "!f", ".5", ".f", "%", ")", ",", "]", "?", " && c",
];
const PREFIXES = ["", "SUM(", "IF(c,", "(", "[b, ", "b + "];

const CROSSES = PREFIXES.flatMap((prefix) =>
  LEFTS.flatMap((left) =>
    GLUES.flatMap((glue) => RIGHTS.map((right) => `${prefix}${left}${glue}%${right}`)),
  ),
);

describe("#715 backward compatibility of the candidate rule", () => {
  it("never rewrites a Formula that parses today (cross-product corpus)", () => {
    const violations = CROSSES.filter((source) => {
      const folded = foldPercentLiterals(source);
      return folded !== source && accepts(source);
    });
    expect(violations).toEqual([]);
  });

  it("the strings it does rewrite are exactly parse failures today", () => {
    const rewritten = CROSSES.filter((source) => foldPercentLiterals(source) !== source);
    expect(rewritten.length).toBeGreaterThan(200);
    expect(rewritten.every((source) => !accepts(source))).toBe(true);
  });
});

// --- 4. Arithmetic under the bare-number value semantics --------------------
//
// The fold makes `N%` the number N/100 (Excel's stored scale); everything
// below then runs through the real evaluator unchanged.

describe("#715 value semantics when 100% is the number 1", () => {
  it.each([
    ["50% + 10", "number:10.5"],
    ["50% * 200", "number:100"],
    ["50% + 50%", "number:1"],
    ["[10%, 20%] | SUM", "number:0.30000000000000004"],
    ["50% > 0.4", "boolean:true"],
    ['"rate: " & 50%', 'text:"rate: 0.5"'],
    ["SUM([10%, 20%, 5%])", "number:0.35000000000000003"],
  ])("%j evaluates to %j", (source, expected) => {
    expect(valueOf(foldPercentLiterals(source))).toBe(expected);
  });

  it("keeps a size Formula's number on the 0–1 scale, not the 0–100 scale #706's unit expects", () => {
    // #706's proof artifact is `votes / total * 100` with unit "%" — the
    // 0–100 scale. The same authoring with a literal divides by 100 again.
    const scope = {
      ports: [
        { name: "votes", type: "number" as const, value: { kind: "number" as const, value: 37 } },
        { name: "total", type: "number" as const, value: { kind: "number" as const, value: 100 } },
      ],
      shapes: {},
    };
    const plain = analyse("votes / total * 100", scope);
    const withLiteral = analyse(foldPercentLiterals("votes / total * 100%"), scope);
    expect(plain.value?.kind === "number" ? plain.value.value : undefined).toBe(37);
    expect(withLiteral.value?.kind === "number" ? withLiteral.value.value : undefined).toBe(0.37);
  });
});
