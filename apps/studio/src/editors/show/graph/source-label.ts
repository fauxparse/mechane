import { DEVICE_SOURCE_HANDLES } from "@mechane/domain";
import type { ShowGraph } from "@mechane/domain";

export function sourceLabelFor(
  graph: ShowGraph,
  sourceId: string,
  sourceHandle: string,
): string | undefined {
  const source = graph.nodes.find((node) => node.id === sourceId);
  if (!source) return undefined;

  if (source.kind === "device") {
    if (sourceHandle === DEVICE_SOURCE_HANDLES.qrCode) return "QR Code";
    if (sourceHandle === DEVICE_SOURCE_HANDLES.pairingCode) return "Join code";
  }

  if (source.kind === "scene") {
    const variable = source.variables.find((candidate) => candidate.id === sourceHandle);
    if (variable) return variable.name;
  }

  const field = graph.shapes
    ?.flatMap((shape) => shape.fields)
    .find((candidate) => candidate.id === sourceHandle);
  if (field) return field.name;

  if (sourceHandle !== "out") return sourceHandle;
  return source.name;
}
