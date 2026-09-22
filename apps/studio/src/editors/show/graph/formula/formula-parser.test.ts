import { parse } from "@mechane/domain";
import { describe, expect, it } from "vitest";
import { parser } from "./formula-parser";

function domainAccepts(source: string): boolean {
  try {
    parse(source);
    return true;
  } catch {
    return false;
  }
}

function grammarAccepts(source: string): boolean {
  const cursor = parser.parse(source).cursor();
  do {
    if (cursor.type.isError) return false;
  } while (cursor.next());
  return true;
}

const corpus = [
  "42",
  "input",
  "input.total + tax",
  "IF(active, total, 0)",
  "SUM(items.amount)",
  "items[0]",
  "items[.votes >= 10]",
  "[1, 2, 3]",
  '{name: "Ada", votes: 3}',
  "input ? yes : no",
  "items|COUNT",
  "",
  "input +",
  "IF(",
  "[1,",
  "{name:",
  ".",
] as const;

describe("Formula Lezer editing grammar", () => {
  it.each(corpus)("agrees with the evaluator parser for %j", (source) => {
    expect(grammarAccepts(source)).toBe(domainAccepts(source));
  });
});
