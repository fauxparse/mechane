// Everything an authoring surface shows about one Transformer, computed from
// the Show's own design-time Source values (#686).
//
// Both Formula surfaces share this: the inspector renders it as one-line
// summaries, the immersive dialog as tables of rows. Neither may derive its
// own scope, or the editor's completion, its squiggles and the `=` line would
// disagree with each other about what the ports hold.
import {
  analyse,
  type FormulaAnalysis,
  type FormulaScope,
  type FormulaValue,
} from "@mechane/domain/formula";
import {
  transformerInputType,
  transformerOutputType,
  type GraphNode,
  type ShowGraph,
} from "@mechane/domain/graph";
import { transformerInputs } from "@mechane/domain/scene-variable-values";
import type { Type } from "@mechane/domain/shapes";
import { defaultSourceRuntimeState } from "@mechane/domain/source-defaults";
import {
  isStructuredValueReference,
  type RuntimeValue,
  type StructuredValueRecord,
} from "@mechane/domain/structured-values";
import { evaluateTransformer, transformerFormulaScope } from "@mechane/domain/transformers";
import { useMemo } from "react";

export type StudioTransformerNode = Extract<GraphNode, { kind: "transformer" }>;

export interface TransformerInputPreview {
  readonly name: string;
  /** null when nothing is connected, so the surface can say so. */
  readonly type: Type | null;
  readonly value: FormulaValue;
}

export interface TransformerPreview {
  /** The single scope the editor completes, lints and previews against. */
  readonly scope: FormulaScope;
  /** null for Shuffle, which authors no Formula. */
  readonly analysis: FormulaAnalysis | null;
  readonly inputs: readonly TransformerInputPreview[];
  /** Filter's per-item binding, bound to a real first row. */
  readonly item: TransformerInputPreview | null;
  readonly outputType: Type | null;
  /** Filter only: how many rows the predicate keeps, of how many. */
  readonly kept: { readonly kept: number; readonly total: number } | null;
}

function arrayLength(
  value: RuntimeValue | undefined,
  records: Readonly<Record<string, StructuredValueRecord>>,
): number | null {
  if (!isStructuredValueReference(value)) return null;
  const record = records[value.ref];
  return record?.kind === "array" ? record.items.length : null;
}

export function useTransformerPreview(
  graph: ShowGraph,
  node: StudioTransformerNode,
): TransformerPreview {
  const design = useMemo(() => defaultSourceRuntimeState(graph), [graph]);

  return useMemo(() => {
    const { values, structuredValues } = transformerInputs(graph, node.id, design.values, {
      structuredValues: design.structuredValues,
    });
    const scope = transformerFormulaScope({ graph, node, inputValues: values, structuredValues });
    const formula = "formula" in node.transform ? (node.transform.formula ?? "") : "";
    const inputs = scope.ports.map((port, index) => ({
      name: port.name,
      type: node.ports[index] ? transformerInputType(graph, node, node.ports[index]!.id) : null,
      value: port.value,
    }));

    const inputPort = node.ports[0];
    const inputType = inputPort ? transformerInputType(graph, node, inputPort.id) : null;
    const itemType =
      inputType && typeof inputType !== "string" && inputType.kind === "array"
        ? inputType.of
        : null;

    let kept: TransformerPreview["kept"] = null;
    if (node.transform.kind === "filter" && inputPort) {
      const total = arrayLength(values[inputPort.id], structuredValues);
      if (total !== null) {
        const result = evaluateTransformer({
          graph,
          node,
          inputValues: values,
          structuredValues,
        });
        const retained = arrayLength(result.value, result.computedStructuredValues);
        if (retained !== null) kept = { kept: retained, total };
      }
    }

    return {
      scope,
      analysis: node.transform.kind === "shuffle" ? null : analyse(formula, scope),
      inputs,
      item: scope.itemBinding
        ? { name: scope.itemBinding.name, type: itemType, value: scope.itemBinding.value }
        : null,
      outputType: transformerOutputType(graph, node),
      kept,
    };
  }, [design, graph, node]);
}
