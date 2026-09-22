import type { Shape, Type } from "./shapes";
import type { RuntimeValue, StructuredValueRecord, StructuredValues } from "./structured-values";
import { computedStructuredValueId } from "./structured-values";
import {
  FORMULA_CONSTRUCTED_VALUE_LIMIT,
  analyse,
  absent,
  boolean,
  number,
  text,
  type EvaluationBudget,
  type Expression,
  type FormulaAnalysis,
  type FormulaDiagnostic,
  type FormulaScope,
  type FormulaType,
  type FormulaValue,
  type ShapeTable,
} from "./formula";
type FormulaSignal = Extract<FormulaValue, { kind: "failure" | "absent" }>;
function isFormulaSignal(value: RuntimeValue | FormulaSignal): value is FormulaSignal {
  if (value === null || typeof value !== "object" || !("kind" in value)) return false;
  return value.kind === "failure" || value.kind === "absent";
}

export interface FormulaInput {
  readonly name: string;
  readonly type: Type;
  readonly value: RuntimeValue | undefined;
}

export interface FormulaEvaluationResult {
  readonly value: RuntimeValue | undefined;
  readonly formulaValue: FormulaValue | null;
  readonly diagnostics: readonly FormulaDiagnostic[];
  readonly computedStructuredValues: StructuredValues;
  readonly steps: number;
  readonly constructedValues: number;
}

export function formulaType(type: Type, shapes: readonly Shape[]): FormulaType {
  if (typeof type === "string") {
    return type === "number" || type === "text" || type === "boolean" ? type : "unknown";
  }
  if (type.kind === "array") return { array: formulaType(type.of, shapes) };
  return { record: shapes.find((shape) => shape.id === type.shapeId)?.name ?? type.shapeId };
}

export function formulaShapeTable(shapes: readonly Shape[]): ShapeTable {
  return Object.fromEntries(
    shapes.map((shape) => [
      shape.name,
      Object.fromEntries(
        shape.fields.map((field) => [field.name, formulaType(field.type, shapes)]),
      ),
    ]),
  );
}

function computedId(transformerId: string, type: Type, path: readonly string[]) {
  return computedStructuredValueId(transformerId, type, path);
}

function runtimeToFormula(
  value: RuntimeValue | undefined,
  type: Type,
  records: Readonly<Record<string, StructuredValueRecord>>,
  shapes: readonly Shape[],
  resolving: Set<string>,
): FormulaValue {
  if (value === undefined || value === null) return absent("the input is absent");
  if (typeof type === "string") {
    if (type === "number" && typeof value === "number") return number(value);
    if (type === "boolean" && typeof value === "boolean") return boolean(value);
    if (type === "text" && typeof value === "string") return text(value);
    if ((type === "date" || type === "datetime" || type === "color") && typeof value === "string") {
      return text(value);
    }
    return {
      kind: "failure",
      category: "typeMismatch",
      message: `The input value does not match its declared ${type} Type.`,
      from: 0,
      to: 0,
    };
  }
  if (typeof value !== "object" || !("ref" in value) || typeof value.ref !== "string") {
    return {
      kind: "failure",
      category: "typeMismatch",
      message: "A structured input did not carry a Structured Value reference.",
      from: 0,
      to: 0,
    };
  }
  if (resolving.has(value.ref)) {
    return {
      kind: "failure",
      category: "invalidFieldValue",
      message: "A Structured Value contains a reference cycle.",
      from: 0,
      to: 0,
    };
  }
  const record = records[value.ref];
  if (!record) return absent(`Structured Value "${value.ref}" is unavailable`);
  resolving.add(value.ref);
  let resolved: FormulaValue;
  if (type.kind === "array" && record.kind === "array") {
    resolved = {
      kind: "array",
      reference: value.ref,
      items: record.items.map((item) =>
        runtimeToFormula(item, type.of, records, shapes, resolving),
      ),
    };
  } else if (type.kind === "shape" && record.kind === "shape") {
    const shape = shapes.find((candidate) => candidate.id === type.shapeId);
    if (!shape) {
      resolved = absent(`Shape "${type.shapeId}" is unavailable`);
    } else {
      resolved = {
        kind: "record",
        shape: shape.name,
        reference: value.ref,
        fields: Object.fromEntries(
          shape.fields.map((field) => [
            field.name,
            runtimeToFormula(record.fields[field.id], field.type, records, shapes, resolving),
          ]),
        ),
      };
    }
  } else {
    resolved = {
      kind: "failure",
      category: "typeMismatch",
      message: "A Structured Value record does not match its declared Type.",
      from: 0,
      to: 0,
    };
  }
  resolving.delete(value.ref);
  return resolved;
}

function consumeConstruction(budget: EvaluationBudget): FormulaSignal | null {
  budget.constructedValues += 1;
  return budget.constructedValues > FORMULA_CONSTRUCTED_VALUE_LIMIT
    ? {
        kind: "failure",
        category: "constructedValueLimitExceeded",
        message: `Formula evaluation constructed more than ${FORMULA_CONSTRUCTED_VALUE_LIMIT.toLocaleString("en-US")} value nodes.`,
        from: 0,
        to: 0,
      }
    : null;
}

function formulaToRuntime(
  value: FormulaValue,
  type: Type,
  transformerId: string,
  path: readonly string[],
  shapes: readonly Shape[],
  overlay: StructuredValues,
  budget: EvaluationBudget,
): RuntimeValue | FormulaSignal {
  if (value.kind === "failure" || value.kind === "absent") return value;
  if (typeof type === "string") {
    if (type === "number" && value.kind === "number") return value.value;
    if (type === "boolean" && value.kind === "boolean") return value.value;
    if (
      (type === "text" || type === "date" || type === "datetime" || type === "color") &&
      value.kind === "text"
    ) {
      return value.value;
    }
    return {
      kind: "failure",
      category: "typeMismatch",
      message: "The Formula result does not match the Transformer's output Type.",
      from: 0,
      to: 0,
    };
  }
  if ((value.kind === "record" || value.kind === "array") && value.reference) {
    return { ref: value.reference };
  }
  const exhausted = consumeConstruction(budget);
  if (exhausted) return exhausted;
  const id = computedId(transformerId, type, path);
  if (type.kind === "array" && value.kind === "array") {
    const items: RuntimeValue[] = [];
    for (const [index, item] of value.items.entries()) {
      const converted = formulaToRuntime(
        item,
        type.of,
        transformerId,
        [...path, String(index)],
        shapes,
        overlay,
        budget,
      );
      if (isFormulaSignal(converted)) {
        if (converted.kind === "failure") return converted;
        items.push(null);
      } else {
        items.push(converted);
      }
    }
    overlay[id] = { id, kind: "array", type, items };
    return { ref: id };
  }
  if (type.kind === "shape" && value.kind === "record") {
    const shape = shapes.find((candidate) => candidate.id === type.shapeId);
    if (!shape) return absent(`Shape "${type.shapeId}" is unavailable`);
    const fields: Record<string, RuntimeValue> = {};
    for (const field of shape.fields) {
      const fieldValue = value.fields[field.name] ?? absent(`field "${field.name}" is absent`);
      const converted = formulaToRuntime(
        fieldValue,
        field.type,
        transformerId,
        [...path, field.id],
        shapes,
        overlay,
        budget,
      );
      if (isFormulaSignal(converted)) {
        if (converted.kind === "failure") return converted;
        fields[field.id] = null;
      } else {
        fields[field.id] = converted;
      }
    }
    overlay[id] = { id, kind: "shape", type, fields };
    return { ref: id };
  }
  return {
    kind: "failure",
    category: "typeMismatch",
    message: "The Formula result does not match the Transformer's output Type.",
    from: 0,
    to: 0,
  };
}

export function evaluateFormula(options: {
  readonly formula: string;
  readonly transformerId: string;
  readonly outputType: Type;
  readonly inputs: readonly FormulaInput[];
  readonly structuredValues: Readonly<Record<string, StructuredValueRecord>>;
  readonly shapes: readonly Shape[];
  readonly item?: FormulaInput;
  readonly relativeItem?: FormulaInput;
}): FormulaEvaluationResult {
  const budget: EvaluationBudget = { steps: 0, constructedValues: 0 };
  const ports = options.inputs.map((input) => ({
    name: input.name,
    type: formulaType(input.type, options.shapes),
    value: runtimeToFormula(
      input.value,
      input.type,
      options.structuredValues,
      options.shapes,
      new Set(),
    ),
  }));
  const scope: FormulaScope = {
    ports,
    shapes: formulaShapeTable(options.shapes),
    expected: formulaType(options.outputType, options.shapes),
    budget,
    ...(options.item
      ? {
          itemBinding: {
            name: options.item.name,
            type: formulaType(options.item.type, options.shapes),
            value: runtimeToFormula(
              options.item.value,
              options.item.type,
              options.structuredValues,
              options.shapes,
              new Set(),
            ),
          },
        }
      : {}),
    ...(options.relativeItem
      ? {
          relativeType: formulaType(options.relativeItem.type, options.shapes),
          relativeItem: runtimeToFormula(
            options.relativeItem.value,
            options.relativeItem.type,
            options.structuredValues,
            options.shapes,
            new Set(),
          ),
        }
      : {}),
  };
  const analysis = analyse(options.formula, scope);
  const computedStructuredValues: StructuredValues = {};
  if (!analysis.value || analysis.blocked) {
    return {
      value: undefined,
      formulaValue: analysis.value,
      diagnostics: analysis.diagnostics,
      computedStructuredValues,
      steps: budget.steps,
      constructedValues: budget.constructedValues,
    };
  }
  const converted = formulaToRuntime(
    analysis.value,
    options.outputType,
    options.transformerId,
    [],
    options.shapes,
    computedStructuredValues,
    budget,
  );
  if (isFormulaSignal(converted)) {
    const diagnostic: FormulaDiagnostic = {
      from: converted.kind === "failure" ? converted.from : 0,
      to: converted.kind === "failure" ? converted.to : options.formula.length,
      message:
        converted.kind === "failure"
          ? converted.message
          : `Right now this produces nothing: ${converted.because}.`,
      severity: "runtime",
      category: converted.kind === "failure" ? converted.category : "missingRequiredValue",
    };
    return {
      value: undefined,
      formulaValue: converted,
      diagnostics: [...analysis.diagnostics, diagnostic],
      computedStructuredValues: {},
      steps: budget.steps,
      constructedValues: budget.constructedValues,
    };
  }
  return {
    value: converted,
    formulaValue: analysis.value,
    diagnostics: analysis.diagnostics,
    computedStructuredValues,
    steps: budget.steps,
    constructedValues: budget.constructedValues,
  };
}

function visitIdentifiers(
  expression: Expression,
  visitor: (name: string, from: number, to: number) => void,
): void {
  switch (expression.type) {
    case "identifier":
      visitor(expression.name, expression.from, expression.to);
      return;
    case "field":
      visitIdentifiers(expression.target, visitor);
      return;
    case "index":
      visitIdentifiers(expression.target, visitor);
      visitIdentifiers(expression.index, visitor);
      return;
    case "filter":
      visitIdentifiers(expression.target, visitor);
      visitIdentifiers(expression.predicate, visitor);
      return;
    case "array":
      for (const element of expression.elements) visitIdentifiers(element, visitor);
      return;
    case "object":
      for (const entry of expression.entries) visitIdentifiers(entry.value, visitor);
      return;
    case "invoke":
      visitIdentifiers(expression.target, visitor);
      for (const argument of expression.args) visitIdentifiers(argument, visitor);
      return;
    case "call":
      for (const argument of expression.args) visitIdentifiers(argument, visitor);
      return;
    case "unary":
      visitIdentifiers(expression.operand, visitor);
      return;
    case "binary":
      visitIdentifiers(expression.left, visitor);
      visitIdentifiers(expression.right, visitor);
      return;
    case "ternary":
      visitIdentifiers(expression.test, visitor);
      if (expression.whenTrue) visitIdentifiers(expression.whenTrue, visitor);
      visitIdentifiers(expression.whenFalse, visitor);
      return;
    case "number":
    case "text":
    case "boolean":
    case "relative":
      return;
  }
}

export function renameFormulaIdentifier(
  formula: string,
  previousName: string,
  nextName: string,
): { readonly formula: string; readonly references: number } {
  const analysis: FormulaAnalysis = analyse(formula, { ports: [], shapes: {} });
  if (!analysis.expression)
    throw new Error("A referenced input cannot be renamed while its Formula is invalid.");
  const spans: Array<{ from: number; to: number }> = [];
  visitIdentifiers(analysis.expression, (name, from, to) => {
    if (name === previousName) spans.push({ from, to });
  });
  let rewritten = formula;
  for (let index = spans.length - 1; index >= 0; index -= 1) {
    const span = spans[index];
    if (!span) continue;
    rewritten = `${rewritten.slice(0, span.from)}${nextName}${rewritten.slice(span.to)}`;
  }
  return { formula: rewritten, references: spans.length };
}
