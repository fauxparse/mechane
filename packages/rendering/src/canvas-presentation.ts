import {
  resolveCanvasProperties,
  resolveSlotInstances,
  sceneVariableValues,
} from "@mechane/domain";
import type {
  Block,
  Canvas,
  GraphNode,
  ImageAssetReference,
  ResolvedCanvas,
  ResolvedElement,
  ResolvedImageValue,
  Shape,
  ShapeInstanceId,
  SlotDiagnostic,
  SlotVariableValue,
  SourceValues,
  Type,
} from "@mechane/domain";
import type { ShowGraph } from "@mechane/domain";

type SceneNode = Extract<GraphNode, { kind: "scene" }>;
export type CanvasPresentationMode = "studio" | "player";

export type CanvasPresentationOwner =
  | {
      readonly kind: "scene";
      readonly scene: SceneNode;
      readonly sourceValues: SourceValues;
    }
  | { readonly kind: "block"; readonly block: Block };

export interface CanvasPresentationInput {
  readonly canvas: Canvas;
  readonly graph: ShowGraph;
  readonly blocks: readonly Block[];
  readonly imageAssets: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  readonly owner: CanvasPresentationOwner;
  readonly mode: CanvasPresentationMode;
}
export interface PreparedSlotInstance {
  readonly id?: ShapeInstanceId;
  readonly index: number;
  readonly diagnostic?: SlotDiagnostic;
  readonly element?: PreparedCanvasElement;
}

export interface PreparedSlot {
  readonly diagnostic?: SlotDiagnostic;
  readonly instances: readonly PreparedSlotInstance[];
}

export interface PreparedCanvasElement {
  readonly element: ResolvedElement;
  readonly children: readonly PreparedCanvasElement[];
  readonly slot?: PreparedSlot;
}

export interface CanvasPresentation {
  readonly canvas: ResolvedCanvas;
  readonly root: PreparedCanvasElement;
  readonly sceneRoot: boolean;
  readonly mode: CanvasPresentationMode;
}

export interface PrepareCanvasInput {
  readonly canvas: Canvas;
  readonly variables: readonly SlotVariableValue[];
  readonly shapes: readonly Shape[];
  readonly blocks: readonly Block[];
  readonly imageAssets: readonly (ResolvedImageValue & Pick<ImageAssetReference, "revision">)[];
  readonly runtimeItem?: unknown;
  readonly runtimeType?: Type;
  readonly mode: CanvasPresentationMode;
}

function prepareElement(
  element: ResolvedElement,
  input: Omit<PrepareCanvasInput, "canvas">,
): PreparedCanvasElement {
  if (element.type === "slot") {
    const block = input.blocks.find((candidate) => candidate.id === element.blockId);
    if (!block) {
      return {
        element,
        children: [],
        slot: {
          diagnostic: {
            category: "missingBlock",
            message: `Block "${element.blockId}" was not found.`,
          },
          instances: [],
        },
      };
    }

    const resolution = resolveSlotInstances({
      block,
      slot: element,
      variables: input.variables,
      runtimeItem: input.runtimeItem,
      runtimeType: input.runtimeType,
      shapes: input.shapes,
      allBlocks: input.blocks,
      imageAssets: input.imageAssets,
    });
    if (resolution.diagnostic) {
      return {
        element,
        children: [],
        slot: { diagnostic: resolution.diagnostic, instances: [] },
      };
    }

    return {
      element,
      children: [],
      slot: {
        instances: resolution.instances.map((instance) => ({
          ...(instance.id ? { id: instance.id } : {}),
          index: instance.index,
          ...(instance.diagnostics.length > 0
            ? { diagnostic: instance.diagnostics[0] }
            : instance.canvas
              ? {
                  element: prepareElement(instance.canvas.root, {
                    ...input,
                    variables: instance.variables ?? input.variables,
                    runtimeItem: instance.item ?? input.runtimeItem,
                  }),
                }
              : {}),
        })),
      },
    };
  }

  return {
    element,
    children:
      element.type === "frame"
        ? (element.children ?? []).map((child) => prepareElement(child, input))
        : [],
  };
}

export function prepareCanvasForRender(input: PrepareCanvasInput): CanvasPresentation {
  const canvas = resolveCanvasProperties(input.canvas, {
    variables: input.variables.map(({ id, type }) => ({ id, name: id, type })),
    values: Object.fromEntries(input.variables.map((variable) => [variable.id, variable.value])),
    shapes: input.shapes,
    imageAssets: input.imageAssets,
  });
  return {
    canvas,
    root: prepareElement(canvas.root, input),
    sceneRoot: canvas.kind === "scene",
    mode: input.mode,
  };
}

export function prepareCanvasPresentation(input: CanvasPresentationInput): CanvasPresentation {
  const { owner } = input;
  const values =
    owner.kind === "scene"
      ? sceneVariableValues(input.graph, owner.scene.id, owner.sourceValues)
      : Object.fromEntries(
          owner.block.variables.map((variable) => [variable.id, variable.defaultValue]),
        );
  const sceneVariables = owner.kind === "scene" ? owner.scene.variables : owner.block.variables;
  const variables =
    owner.kind === "scene"
      ? owner.scene.variables.flatMap((variable): SlotVariableValue[] =>
          variable.type
            ? [
                {
                  id: variable.id,
                  type: variable.type,
                  value:
                    values[variable.id] === undefined ? variable.defaultValue : values[variable.id],
                },
              ]
            : [],
        )
      : owner.block.variables.map(({ id, type, defaultValue }) => ({
          id,
          type,
          value: defaultValue,
        }));
  const canvas = resolveCanvasProperties(input.canvas, {
    graph: input.graph,
    variables: sceneVariables,
    values,
    shapes: input.graph.shapes,
    imageAssets: input.imageAssets,
  });
  return {
    canvas,
    root: prepareElement(canvas.root, {
      variables,
      shapes: input.graph.shapes ?? [],
      blocks: input.blocks,
      imageAssets: input.imageAssets,
      mode: input.mode,
    }),
    sceneRoot: canvas.kind === "scene",
    mode: input.mode,
  };
}

export function prepareLegacyCanvasPresentation(
  canvas: Canvas,
  options: Omit<PrepareCanvasInput, "canvas" | "mode"> & { readonly mode?: CanvasPresentationMode },
): CanvasPresentation {
  return prepareCanvasForRender({
    canvas,
    ...options,
    mode: options.mode ?? "studio",
  });
}
