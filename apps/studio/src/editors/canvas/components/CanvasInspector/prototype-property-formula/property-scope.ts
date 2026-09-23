// PROTOTYPE (issue #711) — the FormulaScope an Element Property authors against.
//
// A Transformer's Formula reads the node's named ports (#675). An Element
// Property has no ports: what it can read is the Scene's Variables. This maps
// them into the same `FormulaScope` the shipped editor, its completion and its
// linter already consume, so all three agree about what is in scope.
//
// Pure: no React, no DOM. If a variant wins, this is the part that lifts.
import {
  analyse,
  formulaShapeTable,
  formulaType,
  isFormulaIdentifier,
  runtimeToFormula,
  type FormulaAnalysis,
  type FormulaScope,
  type FormulaType,
  type FormulaValue,
  type SceneVariable,
  type Shape,
  type ShapeValue,
  type Type,
} from "@mechane/domain";

/**
 * A Variable's name is free text ("Copy / Headline"); a Formula identifier is
 * not. The prototype derives one so the Variable is reachable at all, and keeps
 * the human name for the completion detail.
 */
export function formulaIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (cleaned === "") return "value";
  const candidate = /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
  return isFormulaIdentifier(candidate) ? candidate : `_${candidate}`;
}

export interface ScopeEntry {
  /** What you type in the Formula. */
  readonly identifier: string;
  /** What the Variable is called in the rest of Studio. */
  readonly label: string;
  readonly value: FormulaValue;
}

export interface PropertyScope {
  readonly scope: FormulaScope;
  readonly entries: readonly ScopeEntry[];
}

/** A Property's Type as the checker sees it. Colour is authored as text. */
export function expectedTypeFor(type: Type): FormulaType {
  if (type === "number") return "number";
  if (type === "text" || type === "color" || type === "date" || type === "datetime") return "text";
  return "unknown";
}

export function propertyFormulaScope(
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
  expected: FormulaType,
): PropertyScope {
  const taken = new Set<string>();
  const entries: ScopeEntry[] = [];
  const ports: { name: string; type: FormulaType; value: FormulaValue }[] = [];
  for (const variable of variables) {
    if (!variable.type) continue;
    const base = formulaIdentifier(variable.name);
    let identifier = base;
    let suffix = 2;
    while (taken.has(identifier)) identifier = `${base}_${suffix++}`;
    taken.add(identifier);
    const value = runtimeToFormula(variable.defaultValue as never, variable.type, {}, shapes);
    ports.push({ name: identifier, type: formulaType(variable.type, shapes), value });
    entries.push({ identifier, label: variable.name, value });
  }
  return { scope: { ports, shapes: formulaShapeTable(shapes), expected }, entries };
}

/** `analyse("")` reports an empty Formula; a draft that is merely empty is not a diagnostic yet. */
export function analyseProperty(source: string, scope: FormulaScope): FormulaAnalysis | null {
  return source.trim() === "" ? null : analyse(source, scope);
}

/**
 * The Formula's result as the inspector's own value shape, so it can be written
 * through the ordinary update path and land on the Artboard.
 */
export function resultAsShapeValue(value: FormulaValue | null, type: Type): ShapeValue | null {
  if (!value) return null;
  if (type === "number")
    return value.kind === "number" ? { kind: "number", value: value.value } : null;
  if (value.kind !== "text" && value.kind !== "number") return null;
  const text = String(value.value);
  if (type === "color")
    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)
      ? { kind: "color", value: text }
      : null;
  return { kind: "text", value: text };
}
