import type { Canvas, Element } from "./canvas";
import { assertValidCanvas } from "./canvas";
import { generateId } from "./id";
import type { Shape, Type } from "./shapes";
import { assertValidShapeType } from "./shapes";

export interface BlockVariable {
  readonly id: string;
  readonly name: string;
  readonly type: Type;
  readonly required: boolean;
  readonly defaultValue?: unknown;
}

export interface BlockStateOverride {
  readonly elementId: string;
  readonly property: string;
  readonly value: unknown;
}

export interface BlockState {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly overrides: readonly BlockStateOverride[];
}

/** A Block Canvas has a stable identity in addition to the shared Canvas tree. */
export type BlockCanvas = Canvas & { readonly id: string };

/** A Show-owned reusable visual resource. */
export interface Block {
  readonly id: string;
  readonly name: string;
  readonly canvas: BlockCanvas;
  readonly variables: readonly BlockVariable[];
  readonly states: readonly BlockState[];
  readonly stateSelectorVariableId?: string | null;
}

export class InvalidBlockError extends Error {
  constructor(reason: string) {
    super(`Invalid Block: ${reason}`);
    this.name = "InvalidBlockError";
  }
}
export class BlockReferenceError extends Error {
  constructor(blockId: string) {
    super(`Block "${blockId}" is still referenced by a Slot.`);
    this.name = "BlockReferenceError";
  }
}

export class BlockCycleError extends Error {
  readonly chain: readonly string[];

  constructor(chain: readonly string[]) {
    super(`Block reference cycle: ${chain.join(" -> ")}`);
    this.name = "BlockCycleError";
    this.chain = chain;
  }
}

const MAX_BLOCK_NAME_LENGTH = 200;
const PROPERTY_NAMES = new Set([
  "layout",
  "sizing",
  "rotation",
  "aspectRatio",
  "opacity",
  "blendMode",
  "alignSelf",
  "fill",
  "stroke",
  "anchor",
  "cornerRadius",
  "content",
  "text",
  "value",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textVerticalAlign",
  "textOverflow",
  "padding",
  "image",
  "alt",
  "objectFit",
  "objectPosition",
  "layoutMode",
  "autoLayout",
  "direction",
  "gap",
  "alignPrimary",
  "alignCounter",
  "primaryAlign",
  "counterAlign",
  "clip",
]);

function walk(element: Element, visit: (element: Element) => void): void {
  visit(element);
  for (const child of element.children ?? []) walk(child, visit);
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) throw new InvalidBlockError(`${label} ids must be unique.`);
    seen.add(value);
  }
}

export function assertValidBlockName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new InvalidBlockError("name must not be empty.");
  if (trimmed.length > MAX_BLOCK_NAME_LENGTH) {
    throw new InvalidBlockError(`name must be ${MAX_BLOCK_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

export function assertValidBlock(block: Block, shapes: readonly Shape[] = []): Block {
  if (!block || typeof block.id !== "string" || !block.id) {
    throw new InvalidBlockError("an id is required.");
  }
  assertValidBlockName(block.name);
  if (block.canvas.kind !== undefined && block.canvas.kind !== "block") {
    throw new InvalidBlockError("its Canvas must be a Block Canvas.");
  }
  assertValidCanvas({ ...block.canvas, kind: "block" });
  assertUnique(
    block.variables.map((variable) => variable.id),
    "Variable",
  );
  assertUnique(
    block.states.map((state) => state.id),
    "State",
  );
  assertUnique(
    block.states.map((state) => state.name.toLocaleLowerCase()),
    "State name",
  );
  for (const variable of block.variables) {
    if (!variable.name.trim()) throw new InvalidBlockError("Variable names must not be empty.");
    assertValidShapeType(variable.type, shapes, `Variable "${variable.name}" type`);
  }
  const selector = block.stateSelectorVariableId;
  if (selector !== undefined && selector !== null) {
    const variable = block.variables.find((candidate) => candidate.id === selector);
    if (!variable) throw new InvalidBlockError("the State Selector Variable must exist.");
    if (variable.type !== "text")
      throw new InvalidBlockError("the State Selector Variable must be text.");
  }
  if (block.states.length > 0 && block.states.filter((state) => state.isDefault).length !== 1) {
    throw new InvalidBlockError("exactly one Default State is required when States exist.");
  }
  const elementIds = new Set<string>();
  const elementsById = new Map<string, Element>();
  walk(block.canvas.root, (element) => {
    elementIds.add(element.id);
    elementsById.set(element.id, element);
  });
  for (const state of block.states) {
    if (!state.name.trim()) throw new InvalidBlockError("State names must not be empty.");
    assertUnique(
      state.overrides.map((override) => `${override.elementId}:${override.property}`),
      `State "${state.name}" override`,
    );
    for (const override of state.overrides) {
      if (!elementIds.has(override.elementId)) {
        throw new InvalidBlockError(
          `State "${state.name}" targets missing Element "${override.elementId}".`,
        );
      }
      const element = elementsById.get(override.elementId);
      if (!element || !(override.property in element)) {
        throw new InvalidBlockError(
          `State "${state.name}" targets a missing Property on Element "${override.elementId}".`,
        );
      }
      if (!PROPERTY_NAMES.has(override.property)) {
        throw new InvalidBlockError(`State "${state.name}" targets an unknown Property.`);
      }
    }
  }
  return block;
}

export function assertValidBlocks(
  blocks: readonly Block[] | undefined,
  shapes: readonly Shape[] = [],
): readonly Block[] {
  const values = blocks ?? [];
  assertUnique(
    values.map((block) => block.id),
    "Block",
  );
  assertUnique(
    values.map((block) => block.name),
    "Block name",
  );
  for (const block of values) assertValidBlock(block, shapes);
  assertAcyclicBlockReferences(values);
  return values;
}

export function blockReferencesInCanvas(canvas: Canvas): readonly string[] {
  const references: string[] = [];
  walk(canvas.root, (element) => {
    if ("blockId" in element && typeof element.blockId === "string") {
      references.push(element.blockId);
    }
  });
  return references;
}

export function blockReferences(block: Block): readonly string[] {
  const references: string[] = [];
  walk(block.canvas.root, (element) => {
    if (element.type === "slot") references.push(element.blockId);
  });
  return references;
}

export function assertBlockReferencesExist(
  blocks: readonly Block[],
  canvases: readonly Canvas[],
): void {
  const blockIds = new Set(blocks.map((block) => block.id));
  for (const canvas of canvases) {
    for (const blockId of blockReferencesInCanvas(canvas)) {
      if (!blockIds.has(blockId)) {
        throw new InvalidBlockError(`Canvas contains a reference to missing Block "${blockId}".`);
      }
    }
  }
}

export function assertAcyclicBlockReferences(blocks: readonly Block[]): void {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (blockId: string): void => {
    if (visiting.has(blockId)) {
      const start = path.indexOf(blockId);
      throw new BlockCycleError([...path.slice(start), blockId]);
    }
    if (visited.has(blockId)) return;
    const block = byId.get(blockId);
    if (!block) return;
    visiting.add(blockId);
    path.push(blockId);
    for (const reference of blockReferences(block)) visit(reference);
    path.pop();
    visiting.delete(blockId);
    visited.add(blockId);
  };
  for (const block of blocks) visit(block.id);
}

export function emptyBlock(name: string, id = generateId("block")): Block {
  const canvasId = generateId("canvas");
  return {
    id,
    name: assertValidBlockName(name),
    canvas: {
      id: canvasId,
      kind: "block",
      root: { id: `${canvasId}-root`, type: "frame", children: [] },
    },
    variables: [],
    states: [],
    stateSelectorVariableId: null,
  };
}

export function renameBlock(block: Block, name: string): Block {
  return { ...block, name: assertValidBlockName(name) };
}

function cloneElement(element: Element, ids: Map<string, string>): Element {
  const id = `${element.id}-copy-${generateId("canvas").slice(1)}`;
  ids.set(element.id, id);
  return {
    ...element,
    id,
    children: element.children?.map((child) => cloneElement(child, ids)),
  } as Element;
}

export function duplicateBlock(block: Block, name: string, id = generateId("block")): Block {
  const ids = new Map<string, string>();
  const canvasId = generateId("canvas");
  const canvas = {
    ...block.canvas,
    id: canvasId,
    root: cloneElement(block.canvas.root, ids) as BlockCanvas["root"],
  } satisfies BlockCanvas;
  const states = block.states.map((state) => ({
    ...state,
    id: generateId("block"),
    overrides: state.overrides.map((override) => ({
      ...override,
      elementId: ids.get(override.elementId) ?? override.elementId,
    })),
  }));
  const variables = block.variables.map((variable) => ({
    ...variable,
    id: generateId("variable"),
  }));
  return { ...block, id, name: assertValidBlockName(name), canvas, variables, states };
}

export function defaultBlockState(block: Block): BlockState | null {
  return block.states.find((state) => state.isDefault) ?? null;
}

export function resolveBlockState(block: Block, selector: unknown): BlockState | null {
  if (block.states.length === 0) return null;
  const value = typeof selector === "string" ? selector.trim() : "";
  const selected =
    value.length > 0
      ? block.states.find((state) => state.name.toLocaleLowerCase() === value.toLocaleLowerCase())
      : undefined;
  return selected ?? defaultBlockState(block);
}

export function applyBlockState(block: Block, state: BlockState | null): BlockCanvas {
  if (!state) return block.canvas;
  const overrides = new Map(
    state.overrides.map((override) => [
      `${override.elementId}:${override.property}`,
      override.value,
    ]),
  );
  const visit = (element: Element): Element =>
    ({
      ...element,
      ...Object.fromEntries(
        [...overrides.entries()]
          .filter(([key]) => key.startsWith(`${element.id}:`))
          .map(([key, value]) => [key.slice(element.id.length + 1), value]),
      ),
      children: element.children?.map(visit),
    }) as Element;
  return { ...block.canvas, root: visit(block.canvas.root) as BlockCanvas["root"] };
}

export function addBlockVariable(block: Block, variable: BlockVariable): Block {
  if (block.variables.some((candidate) => candidate.id === variable.id)) {
    throw new InvalidBlockError(`Variable "${variable.id}" already exists.`);
  }
  return { ...block, variables: [...block.variables, variable] };
}

export function updateBlockVariable(block: Block, variable: BlockVariable): Block {
  if (!block.variables.some((candidate) => candidate.id === variable.id)) {
    throw new InvalidBlockError(`Variable "${variable.id}" does not exist.`);
  }
  return {
    ...block,
    variables: block.variables.map((candidate) =>
      candidate.id === variable.id ? variable : candidate,
    ),
  };
}

export function addBlockState(block: Block, state: BlockState): Block {
  if (block.states.some((candidate) => candidate.id === state.id)) {
    throw new InvalidBlockError(`State "${state.id}" already exists.`);
  }
  const states =
    block.states.length === 0
      ? [{ ...state, isDefault: true }]
      : [...block.states, { ...state, isDefault: false }];
  return { ...block, states };
}

export function renameBlockState(block: Block, stateId: string, name: string): Block {
  const state = block.states.find((candidate) => candidate.id === stateId);
  if (!state) throw new InvalidBlockError(`State "${stateId}" does not exist.`);
  const nextName = assertValidBlockName(name);
  return {
    ...block,
    states: block.states.map((candidate) =>
      candidate.id === stateId ? { ...candidate, name: nextName } : candidate,
    ),
  };
}

export function setDefaultBlockState(block: Block, stateId: string): Block {
  if (!block.states.some((candidate) => candidate.id === stateId)) {
    throw new InvalidBlockError(`State "${stateId}" does not exist.`);
  }
  return {
    ...block,
    states: block.states.map((state) => ({ ...state, isDefault: state.id === stateId })),
  };
}

export function setBlockStateOverrides(
  block: Block,
  stateId: string,
  overrides: readonly BlockStateOverride[],
): Block {
  if (!block.states.some((candidate) => candidate.id === stateId)) {
    throw new InvalidBlockError(`State "${stateId}" does not exist.`);
  }
  return {
    ...block,
    states: block.states.map((state) =>
      state.id === stateId ? { ...state, overrides: [...overrides] } : state,
    ),
  };
}
