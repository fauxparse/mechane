import type { CanvasArtboardDocument } from "../../../../api/canvas";
import type { ShowGraph, SceneVariable } from "@mechane/domain/graph";
import type { Element } from "@mechane/domain/canvas";
import type { Shape, Type } from "@mechane/domain/shapes";
import { typeAtPath } from "@mechane/domain/property-values";
import type { CueValueSource } from "../../commands/cue-value-binding";

export function cueValueSources(
  graph: ShowGraph | undefined,
  focused: CanvasArtboardDocument | null,
  artboards: readonly CanvasArtboardDocument[],
  variables: readonly SceneVariable[],
  shapes: readonly Shape[],
): CueValueSource[] {
  const values: CueValueSource[] = [];
  const addFields = (
    name: string,
    type: Type,
    source: CueValueSource["source"],
    path: readonly string[] = [],
    ancestors = new Set<string>(),
  ) => {
    const resolved =
      source.kind === "variable"
        ? { ...source, fieldPath: path }
        : source.kind === "runtimeItem"
          ? { ...source, fieldPath: path }
          : source;
    values.push({ name, type, source: resolved });
    if (typeof type === "string" || type.kind !== "shape" || ancestors.has(type.shapeId)) return;
    const visited = new Set(ancestors);
    visited.add(type.shapeId);
    for (const field of shapes.find((shape) => shape.id === type.shapeId)?.fields ?? [])
      addFields(`${name}.${field.name}`, field.type, source, [...path, field.id], visited);
  };
  for (const variable of variables)
    if (variable.type)
      addFields(variable.name, variable.type, { kind: "variable", variableId: variable.id });
  if (focused?.kind === "block" && graph) {
    const seen = new Set<string>();
    for (const artboard of artboards) {
      const node = graph.nodes.find((node) => node.id === artboard.artId);
      const ownerVariables =
        node?.kind === "scene"
          ? node.variables
          : (graph.blocks?.find((block) => block.id === artboard.artId)?.variables ?? []);
      const visit = (element: Element) => {
        if (
          element.type === "slot" &&
          element.blockId === focused.artId &&
          element.expansion?.source.kind === "variable"
        ) {
          const source = element.expansion.source;
          const variable = ownerVariables.find((variable) => variable.id === source.variableId);
          const type = variable?.type && typeAtPath(variable.type, source.fieldPath ?? [], shapes);
          if (
            type &&
            typeof type !== "string" &&
            type.kind === "array" &&
            !seen.has(JSON.stringify(type.of))
          ) {
            seen.add(JSON.stringify(type.of));
            const itemType = type.of;
            const name =
              typeof itemType !== "string" && itemType.kind === "shape"
                ? (shapes.find((shape) => shape.id === itemType.shapeId)?.name ?? "Current item")
                : "Current item";
            addFields(name, itemType, { kind: "runtimeItem" });
          }
        }
        for (const child of element.children ?? []) visit(child);
      };
      visit(artboard.canvas.root);
    }
  }
  return values;
}
