import type { ShowGraph, TransformerNode } from "./graph";
import { transformerInputType, transformerOutputType } from "./graph";
import {
  evaluateFormula,
  formulaShapeTable,
  formulaType,
  runtimeToFormula,
  type FormulaEvaluationResult,
  type FormulaInput,
} from "./formula-runtime";
import { absent, type FormulaDiagnostic, type FormulaScope } from "./formula";
import type { Type } from "./shapes";
import {
  computedStructuredValueId,
  isStructuredValueReference,
  type RuntimeValue,
  type StructuredValueRecord,
  type StructuredValues,
} from "./structured-values";

export interface TransformerEvaluationResult {
  readonly value: RuntimeValue | undefined;
  readonly type: Type | null;
  readonly diagnostics: readonly FormulaDiagnostic[];
  readonly computedStructuredValues: StructuredValues;
}

function diagnostic(message: string, category: FormulaDiagnostic["category"]): FormulaDiagnostic {
  return { from: 0, to: 0, message, severity: "runtime", category };
}

function arrayInput(
  value: RuntimeValue | undefined,
  type: Type | null,
  records: Readonly<Record<string, StructuredValueRecord>>,
): Extract<StructuredValueRecord, { kind: "array" }> | null {
  if (
    !type ||
    typeof type === "string" ||
    type.kind !== "array" ||
    !isStructuredValueReference(value)
  ) {
    return null;
  }
  const record = records[value.ref];
  return record?.kind === "array" ? record : null;
}

/**
 * The scope a Transformer's Formula is authored against: its named ports
 * carrying the values that actually reach them.
 *
 * Both authoring surfaces — the inspector editor and the immersive dialog
 * (#686) — check, complete and preview against this, so a port's completion
 * detail and the `=` line report the values the evaluator will see. Filter
 * binds `item` to the first input row, because a predicate is written about
 * one row and a real example row is what teaches that.
 */
export function transformerFormulaScope(options: {
  readonly graph: ShowGraph;
  readonly node: TransformerNode;
  readonly inputValues: Readonly<Record<string, RuntimeValue | undefined>>;
  readonly structuredValues: Readonly<Record<string, StructuredValueRecord>>;
}): FormulaScope {
  const { graph, node, inputValues, structuredValues } = options;
  const shapes = graph.shapes ?? [];
  const scope: FormulaScope = {
    ports: node.ports.map((port) => {
      const type = transformerInputType(graph, node, port.id);
      const value = inputValues[port.id];
      return {
        name: port.name,
        type: type ? formulaType(type, shapes) : "unknown",
        value:
          type && value !== undefined
            ? runtimeToFormula(value, type, structuredValues, shapes)
            : absent(`nothing is connected to "${port.name}"`),
      };
    }),
    shapes: formulaShapeTable(shapes),
  };

  if (node.transform.kind === "calculate") {
    if (!node.transform.outputType) return scope;
    return { ...scope, expected: formulaType(node.transform.outputType, shapes) };
  }

  const inputPort = node.ports[0];
  const inputType = inputPort ? transformerInputType(graph, node, inputPort.id) : null;
  if (node.transform.kind !== "filter") return scope;
  if (!inputType || typeof inputType === "string" || inputType.kind !== "array") {
    return { ...scope, expected: "boolean" };
  }
  const firstItem = arrayInput(
    inputPort ? inputValues[inputPort.id] : undefined,
    inputType,
    structuredValues,
  )?.items[0];
  return {
    ...scope,
    expected: "boolean",
    itemBinding: {
      name: "item",
      type: formulaType(inputType.of, shapes),
      value:
        firstItem === undefined
          ? absent("the input has no items to read")
          : runtimeToFormula(firstItem, inputType.of, structuredValues, shapes),
    },
  };
}

function stableValueKey(value: RuntimeValue): string {
  if (isStructuredValueReference(value)) return `ref:${value.ref}`;
  return `${typeof value}:${JSON.stringify(value)}`;
}

function stableRank(seed: string, value: RuntimeValue, occurrence: number): number {
  const source = `${seed}\u0000${stableValueKey(value)}\u0000${occurrence}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function computedArray(
  node: TransformerNode,
  type: Extract<Type, { kind: "array" }>,
  items: readonly RuntimeValue[],
): { value: RuntimeValue; records: StructuredValues } {
  const id = computedStructuredValueId(node.id, type, []);
  return {
    value: { ref: id },
    records: { [id]: { id, kind: "array", type, items } },
  };
}

/** Evaluates one Transformer against a completed snapshot of its named inputs. */
export function evaluateTransformer(options: {
  readonly graph: ShowGraph;
  readonly node: TransformerNode;
  readonly inputValues: Readonly<Record<string, RuntimeValue | undefined>>;
  readonly structuredValues: Readonly<Record<string, StructuredValueRecord>>;
  readonly shuffleSeed?: string;
}): TransformerEvaluationResult {
  const { graph, node } = options;
  const type = transformerOutputType(graph, node);
  const inputs: FormulaInput[] = [];
  for (const port of node.ports) {
    const inputType = transformerInputType(graph, node, port.id);
    if (inputType) {
      inputs.push({ name: port.name, type: inputType, value: options.inputValues[port.id] });
    }
  }

  if (node.transform.kind === "calculate") {
    if (!node.transform.formula || !node.transform.outputType) {
      return {
        value: undefined,
        type,
        diagnostics: [
          diagnostic(
            "This Calculate Transformer needs a Formula and output Type.",
            "missingRequiredValue",
          ),
        ],
        computedStructuredValues: {},
      };
    }
    const result: FormulaEvaluationResult = evaluateFormula({
      formula: node.transform.formula,
      ownerId: node.id,
      outputType: node.transform.outputType,
      inputs,
      structuredValues: options.structuredValues,
      shapes: graph.shapes ?? [],
    });
    return {
      value: result.value,
      type,
      diagnostics: result.diagnostics,
      computedStructuredValues: result.computedStructuredValues,
    };
  }

  const inputPort = node.ports[0];
  const inputType = inputPort ? transformerInputType(graph, node, inputPort.id) : null;
  const inputValue = inputPort ? options.inputValues[inputPort.id] : undefined;
  const input = arrayInput(inputValue, inputType, options.structuredValues);
  if (!input || !inputType || typeof inputType === "string" || inputType.kind !== "array") {
    return {
      value: undefined,
      type,
      diagnostics: [
        diagnostic(
          `${node.transform.kind === "filter" ? "Filter" : "Shuffle"} requires one connected Array input.`,
          "typeMismatch",
        ),
      ],
      computedStructuredValues: {},
    };
  }

  if (node.transform.kind === "shuffle") {
    if (!options.shuffleSeed) {
      return {
        value: undefined,
        type,
        diagnostics: [diagnostic("Shuffle has no runtime seed.", "missingRequiredValue")],
        computedStructuredValues: {},
      };
    }
    const seed = options.shuffleSeed;
    const occurrences = new Map<string, number>();
    const ranked = input.items.map((item, index) => {
      const key = stableValueKey(item);
      const occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
      return { item, index, rank: stableRank(seed, item, occurrence) };
    });
    ranked.sort((left, right) => left.rank - right.rank || left.index - right.index);
    const output = computedArray(
      node,
      inputType,
      ranked.map(({ item }) => item),
    );
    return { value: output.value, type, diagnostics: [], computedStructuredValues: output.records };
  }

  const retained: RuntimeValue[] = [];
  const diagnostics: FormulaDiagnostic[] = [];
  for (const item of input.items) {
    const result = evaluateFormula({
      formula: node.transform.formula,
      ownerId: node.id,
      outputType: "boolean",
      inputs,
      structuredValues: options.structuredValues,
      shapes: graph.shapes ?? [],
      item: { name: "item", type: inputType.of, value: item },
    });
    diagnostics.push(...result.diagnostics);
    if (result.value === true) retained.push(item);
  }
  if (diagnostics.some((entry) => entry.severity === "blocking")) {
    return { value: undefined, type, diagnostics, computedStructuredValues: {} };
  }
  const output = computedArray(node, inputType, retained);
  return {
    value: output.value,
    type,
    diagnostics,
    computedStructuredValues: output.records,
  };
}
