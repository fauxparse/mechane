// TanStack Query hooks over the Show-graph GraphQL operations (issue #38),
// following ./shows.ts: the route components see data and mutation
// callbacks, not documents and endpoints.
//
// The editor chrome (issue #39) needs *both* states of the graph, because
// "are there unpublished changes?" is derived by comparing their
// timestamps (ADR-0002 — see @mechane/domain's `publishState`), not
// stored on either.
import { coalesceCanvasWorkspaceEdits, coalesceGraphEdits } from "@mechane/commands";
import type { CanvasWorkspaceEdit, GraphEdit } from "@mechane/commands";
import type { GraphState } from "@mechane/domain/graph";
import type { ShowId } from "@mechane/domain/id";
import type { SlotEventBinding } from "@mechane/domain/interactions";
import type { PrimitiveType, Shape, ShapeField, Type } from "@mechane/domain/shapes";
import {
  ApplyShowEditsMutation,
  GetShowGraphQuery,
  graphqlRequest,
  PublishShowGraphMutation,
} from "@mechane/graphql-schema";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { toEditInput, toGraphEdit } from "../editors/show/data/api-graph";
import { draftSavesSettled, trackDraftSave } from "./draft-saves";
import { GRAPHQL_ENDPOINT } from "./client";

/**
 * The cached query response, described only as far as this module patches it.
 *
 * Patching a cached graph in place is the one job left in Studio that works
 * in transport terms; everything that *reads* a graph goes through
 * `decodeShowGraphDocument`, and the editor is handed the decoded result
 * (#742, #750). Narrow on purpose: a field named here is a field this module
 * rewrites.
 */
interface CachedShowGraph {
  readonly nodes: readonly CachedNode[];
  readonly edges: readonly CachedEdge[];
  readonly shapes: readonly CachedShape[];
  readonly blocks: readonly unknown[];
  readonly cues: readonly CachedCue[];
  readonly actions: readonly { readonly cueId: string }[];
  readonly eventBindings: readonly { readonly id: string; readonly cueId: string }[];
  readonly slotEventBindings: readonly SlotEventBinding[];
  readonly sourceFieldDefaults: readonly CachedSourceFieldDefault[];
  readonly showId: string;
  readonly state: string;
  readonly updatedAt: string;
  readonly version: number;
}

interface CachedNode {
  readonly __typename: string;
  readonly id: string;
  readonly variables?: readonly { readonly id: string; readonly rank?: string | null }[];
}

interface CachedEdge {
  readonly __typename: string;
  readonly cueId?: string | null;
}

interface CachedSourceFieldDefault {
  readonly nodeId: string;
  readonly fieldPath: readonly string[];
  readonly value: unknown;
}

interface CachedCue {
  readonly id: string;
  readonly name: string;
  readonly ownerKind: string;
  readonly sceneId: string | null;
  readonly blockId: string | null;
  readonly actionIds: readonly string[];
  readonly parameters: readonly {
    readonly id: string;
    readonly name: string;
    readonly type: unknown;
    readonly position: number;
  }[];
}

interface CachedType {
  readonly kind: PrimitiveType | "array" | "shape";
  readonly shapeId: string | null;
  readonly of: CachedType | null;
}

/** The `ShapeValue` union: a `__typename` beside a per-kind alias, or an ImageValue's own fields. */
type CachedShapeValue = { readonly __typename: string } & Readonly<Record<string, unknown>>;

interface CachedShapeField {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly required: boolean;
  readonly type: CachedType;
  readonly default: CachedShapeValue | null;
}

interface CachedShape {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly CachedShapeField[];
}

function toCachedCue(
  cue: Extract<GraphEdit, { type: "graph.addCue" }>["cue"],
): CachedShowGraph["cues"][number] {
  return {
    id: cue.id,
    name: cue.name,
    ownerKind: cue.owner.kind,
    sceneId: cue.owner.kind === "scene" ? cue.owner.sceneId : null,
    blockId: cue.owner.kind === "block" ? cue.owner.blockId : null,
    actionIds: [...cue.actionIds],
    parameters: (cue.parameters ?? []).map((parameter) => ({
      id: parameter.id,
      name: parameter.name,
      type: parameter.type,
      position: parameter.position,
    })),
  };
}

function withoutCueEdges(
  edges: CachedShowGraph["edges"],
  cueId: Extract<GraphEdit, { type: "graph.removeCue" }>["cueId"],
): CachedShowGraph["edges"] {
  return edges.filter(
    (edge) =>
      (edge.__typename !== "NavigateEdge" && edge.__typename !== "UpdateEdge") ||
      edge.cueId !== cueId,
  );
}

function toCachedType(type: Type): CachedType {
  if (typeof type === "string") return { kind: type, shapeId: null, of: null };
  return type.kind === "array"
    ? { kind: "array", shapeId: null, of: toCachedType(type.of) }
    : { kind: "shape", shapeId: type.shapeId, of: null };
}

/** The `ShapeValue` member and the alias `ShowGraphFields` selects its value under, per Type kind. */
const CACHED_SHAPE_VALUES: Readonly<
  Record<Exclude<CachedType["kind"], "image">, readonly [typename: string, alias: string]>
> = {
  text: ["TextValue", "textValue"],
  number: ["NumberValue", "numberValue"],
  boolean: ["BooleanValue", "booleanValue"],
  color: ["ColorValue", "colorValue"],
  date: ["DateValue", "dateValue"],
  datetime: ["DateTimeValue", "datetimeValue"],
  shape: ["ObjectValue", "objectValue"],
  array: ["ArrayValue", "arrayValue"],
};

function toCachedShapeValue(value: unknown, type: CachedType): CachedShapeValue | null {
  if (value === null || value === undefined) return null;
  if (type.kind === "image") {
    return { ...(value as Readonly<Record<string, unknown>>), __typename: "ImageValue" };
  }
  const [typename, alias] = CACHED_SHAPE_VALUES[type.kind];
  return { __typename: typename, [alias]: value };
}

function toCachedShapeField(field: ShapeField, position: number): CachedShapeField {
  const type = toCachedType(field.type);
  return {
    id: field.id,
    name: field.name,
    position,
    required: field.required,
    type,
    default: toCachedShapeValue(field.defaultValue, type),
  };
}

function toCachedShape(shape: Shape): CachedShape {
  return { id: shape.id, name: shape.name, fields: shape.fields.map(toCachedShapeField) };
}

/**
 * Mirrors one Shape edit onto the cached Shapes as its command applies it, so
 * an editor reopened from the cache offers the Shapes authored since the load.
 * Adds skip ids already present: the save response re-patches a batch its
 * enqueue already patched. Any other edit returns `shapes` itself.
 */
function patchCachedShapes(
  shapes: readonly CachedShape[],
  edit: GraphEdit,
): readonly CachedShape[] {
  const updateShape = (shapeId: string, update: (shape: CachedShape) => CachedShape) =>
    shapes.map((shape) => (shape.id === shapeId ? update(shape) : shape));
  const updateField = (
    shapeId: string,
    fieldId: string,
    update: (field: CachedShapeField) => CachedShapeField,
  ) =>
    updateShape(shapeId, (shape) => ({
      ...shape,
      fields: shape.fields.map((field) => (field.id === fieldId ? update(field) : field)),
    }));
  switch (edit.type) {
    case "graph.setShapes":
      return edit.shapes.map(toCachedShape);
    case "graph.addShape":
    case "graph.duplicateShape":
      return shapes.some((shape) => shape.id === edit.shape.id)
        ? shapes
        : [...shapes, toCachedShape(edit.shape)];
    case "graph.renameShape":
      return updateShape(edit.shapeId, (shape) => ({ ...shape, name: edit.name }));
    case "graph.removeShape":
      return shapes.filter((shape) => shape.id !== edit.shapeId);
    case "graph.addShapeField":
      return updateShape(edit.shapeId, (shape) =>
        shape.fields.some((field) => field.id === edit.field.id)
          ? shape
          : {
              ...shape,
              fields: [
                ...shape.fields,
                toCachedShapeField(
                  edit.field,
                  Math.max(-1, ...shape.fields.map((field) => field.position)) + 1,
                ),
              ],
            },
      );
    case "graph.renameShapeField":
      return updateField(edit.shapeId, edit.fieldId, (field) => ({ ...field, name: edit.name }));
    case "graph.setShapeFieldType":
      return updateField(edit.shapeId, edit.fieldId, (field) => ({
        ...field,
        type: toCachedType(edit.fieldType),
      }));
    case "graph.setShapeFieldDefault":
      return updateField(edit.shapeId, edit.fieldId, (field) => ({
        ...field,
        default: toCachedShapeValue(edit.defaultValue, field.type),
      }));
    case "graph.setShapeFieldRequired":
      return updateField(edit.shapeId, edit.fieldId, (field) => ({
        ...field,
        required: edit.required,
      }));
    case "graph.reorderShapeFields": {
      const positions = new Map(edit.fieldIds.map((fieldId, position) => [fieldId, position]));
      // Like the command, refuse an order that doesn't name every Field once.
      return updateShape(edit.shapeId, (shape) =>
        positions.size === shape.fields.length &&
        shape.fields.every((field) => positions.has(field.id))
          ? {
              ...shape,
              fields: shape.fields.map((field) => ({
                ...field,
                position: positions.get(field.id) ?? field.position,
              })),
            }
          : shape,
      );
    }
    case "graph.removeShapeField":
      return updateShape(edit.shapeId, (shape) => ({
        ...shape,
        fields: shape.fields.filter((field) => field.id !== edit.fieldId),
      }));
    default:
      return shapes;
  }
}

export const showGraphQueryKey = (id: ShowId, state: GraphState) =>
  ["shows", id, "graph", state] as const;

/**
 * Applies cache-safe graph edits without replacing the editor's command-stack
 * snapshot. Reordering only changes the Variable array on the addressed Scene.
 */
export function patchShowGraphQueryData(
  previous: CachedShowGraph | undefined,
  edits: readonly GraphEdit[],
): CachedShowGraph | undefined {
  if (!previous) return previous;
  let changed = false;
  const nodes = previous.nodes.map((node) => {
    if (node.__typename !== "SceneNode" || !node.variables) return node;
    let variables = node.variables;
    for (const edit of edits) {
      if (edit.type !== "graph.reorderSceneVariables" || edit.sceneId !== node.id) continue;
      const variablesById = new Map(variables.map((variable) => [variable.id, variable]));
      const nextVariables = edit.variableIds.map((variableId, index) => {
        const variable = variablesById.get(variableId);
        return variable ? { ...variable, rank: String(index).padStart(10, "0") } : undefined;
      });
      if (nextVariables.some((variable) => variable === undefined)) return node;
      variables = nextVariables as typeof variables;
    }
    if (variables === node.variables) return node;
    changed = true;
    return { ...node, variables };
  });

  let cues = previous.cues;
  let actions = previous.actions;
  let eventBindings = previous.eventBindings;
  let slotEventBindings = previous.slotEventBindings;
  let edges = previous.edges;
  let sourceFieldDefaults = previous.sourceFieldDefaults;
  let shapes = previous.shapes;
  for (const edit of edits) {
    switch (edit.type) {
      case "graph.addCue":
        if (cues.some((cachedCue) => cachedCue.id === edit.cue.id)) break;
        cues = [...cues, toCachedCue(edit.cue)];
        changed = true;
        break;
      case "graph.setCue":
        cues = cues.map((cue) => (cue.id === edit.cue.id ? toCachedCue(edit.cue) : cue));
        changed = true;
        break;
      case "graph.setEventBinding": {
        const next = edit.binding;
        eventBindings = eventBindings.map((binding) =>
          binding.id === next.id
            ? {
                id: next.id,
                canvasId: next.canvasId,
                elementId: next.elementId,
                eventKind: next.eventKind,
                cueId: next.cueId,
                position: next.position,
                params: next.eventKind === "keypress" ? next.params : null,
                parameterMappings: next.parameterMappings ?? [],
              }
            : binding,
        );
        changed = true;
        break;
      }
      case "graph.removeCue": {
        const nextCues = cues.filter((cue) => cue.id !== edit.cueId);
        const nextActions = actions.filter((action) => action.cueId !== edit.cueId);
        const nextEventBindings = eventBindings.filter((binding) => binding.cueId !== edit.cueId);
        const nextSlotEventBindings = slotEventBindings.filter(
          (binding) => binding.sourceCueId !== edit.cueId && binding.targetCueId !== edit.cueId,
        );
        const nextEdges = withoutCueEdges(edges, edit.cueId);
        if (
          nextCues.length === cues.length &&
          nextActions.length === actions.length &&
          nextEventBindings.length === eventBindings.length &&
          nextSlotEventBindings.length === slotEventBindings.length &&
          nextEdges.length === edges.length
        ) {
          break;
        }
        cues = nextCues;
        actions = nextActions;
        eventBindings = nextEventBindings;
        slotEventBindings = nextSlotEventBindings;
        edges = nextEdges;
        changed = true;
        break;
      }
      case "graph.setSlotEventBinding": {
        const current = slotEventBindings.find((binding) => binding.id === edit.binding.id);
        if (current && JSON.stringify(current) === JSON.stringify(edit.binding)) break;
        slotEventBindings = current
          ? slotEventBindings.map((binding) =>
              binding.id === edit.binding.id ? edit.binding : binding,
            )
          : [...slotEventBindings, edit.binding];
        changed = true;
        break;
      }
      case "graph.removeSlotEventBinding": {
        const next = slotEventBindings.filter((binding) => binding.id !== edit.bindingId);
        if (next.length === slotEventBindings.length) break;
        slotEventBindings = next;
        changed = true;
        break;
      }
      // Mirrors `setSourceFieldDefault`: one entry per path, appended on set,
      // removed by null. The value stays as sent; reading a Source normalizes it.
      case "graph.setSourceFieldDefault": {
        const index = sourceFieldDefaults.findIndex(
          (entry) =>
            entry.nodeId === edit.nodeId &&
            entry.fieldPath.length === edit.fieldPath.length &&
            entry.fieldPath.every(
              (segment, segmentIndex) => segment === edit.fieldPath[segmentIndex],
            ),
        );
        const current = sourceFieldDefaults[index];
        const unchanged =
          edit.value === null
            ? current === undefined
            : current !== undefined && JSON.stringify(current.value) === JSON.stringify(edit.value);
        if (unchanged) break;
        const remaining = sourceFieldDefaults.filter((_, entryIndex) => entryIndex !== index);
        sourceFieldDefaults =
          edit.value === null
            ? remaining
            : [
                ...remaining,
                { nodeId: edit.nodeId, fieldPath: [...edit.fieldPath], value: edit.value },
              ];
        changed = true;
        break;
      }
      default: {
        const nextShapes = patchCachedShapes(shapes, edit);
        if (nextShapes === shapes) break;
        shapes = nextShapes;
        changed = true;
        break;
      }
    }
  }

  return changed
    ? {
        ...previous,
        nodes,
        cues,
        actions,
        eventBindings,
        slotEventBindings,
        edges,
        sourceFieldDefaults,
        shapes,
      }
    : previous;
}

/**
 * A Show's graph in one state. `id` is nullable for the same reason as
 * `useShow`'s: a route can hand over an id it couldn't validate without
 * faking one, and the request is skipped rather than made and missed.
 */
export function useShowGraph(id: ShowId | null, state: GraphState) {
  return useQuery({
    queryKey: showGraphQueryKey(id ?? ("" as ShowId), state),
    enabled: id !== null,
    // An editor's command stack is the source of truth while it is open; a refetch replaces the
    // stack's base and clears undo, so returning to the window must not trigger one.
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (state === "draft") await draftSavesSettled(id as ShowId);
      // `enabled` above means this only runs with a non-null id.
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, GetShowGraphQuery, {
        showId: id as ShowId,
        state,
      });
      return data.showGraph;
    },
  });
}

/**
 * Publishes a Show's draft graph (ADR-0002: immediate cutover, whole Show).
 * The draft is deliberately left alone by the server, so only the published
 * graph's cache entry is refreshed — the badge flips because the published
 * timestamp moved past the draft's, not because the draft changed.
 */
export function usePublishShowGraph() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (showId: ShowId) => {
      const data = await graphqlRequest(GRAPHQL_ENDPOINT, PublishShowGraphMutation, { showId });
      return data.publishShowGraph;
    },
    onSuccess: (graph) => {
      const showId = graph.showId as ShowId;
      queryClient.setQueryData(
        showGraphQueryKey(showId, "published"),
        (previous: CachedShowGraph | undefined) =>
          // The publish mutation only selects the metadata, so keep
          // whatever nodes/edges the cache already had rather than
          // blanking a populated graph. It's a copy of the draft either
          // way; the invalidate below fetches the real thing.
          previous ? { ...previous, ...graph } : undefined,
      );
      void queryClient.invalidateQueries({
        queryKey: showGraphQueryKey(showId, "published"),
      });
    },
  });
}

/** How long editing has to pause before the pending edits are sent. */
const SAVE_DEBOUNCE_MS = 700;

export interface ShowGraphEditsOptions {
  /**
   * Called with the edits the server made that the client didn't ask for
   * (#111) — a Device's minted pairing code, today. The editor applies these
   * to the graph it is editing; nobody else can, because nobody else has it.
   */
  onAmend?(edits: readonly GraphEdit[]): void;
}

export interface ShowGraphEdits {
  /**
   * Queues edits for the next flush. Called once per landed command — a
   * gesture included, since the stack coalesces one (#28).
   */
  enqueue(edits: readonly (GraphEdit | CanvasWorkspaceEdit)[]): void;
  persistDraft(): Promise<number>;
  acceptExternal(receipt: {
    version: number;
    updatedAt: string;
    published: { version: number; updatedAt: string } | null;
  }): void;
  /** True while a batch is in flight. */
  saving: boolean;
  /**
   * Set when a batch was refused. The editor keeps working from its own
   * state and can retry the queued edits explicitly.
   */
  error: Error | null;
  retry(): void;
}

/**
 * The draft graph's write path (issue #103): a queue of edits, flushed after a
 * pause in the editing.
 *
 * What replaced what: this used to hold *the latest graph*, because every
 * write replaced the whole thing and an intermediate state nobody had written
 * was one nobody wanted. Edits are the opposite — each one is a step, and a
 * step that never arrives leaves the server on a different graph from the
 * client. So they accumulate rather than overwrite, and the debounce is now
 * about *batching* rather than about discarding.
 *
 * One batch is in flight at a time, in order. Edits are relative to the graph
 * before them, so two batches racing would be two batches composed against the
 * same version, and the second would be refused — correctly, but avoidably.
 *
 * `baseVersion` seeds the version the first batch is composed against; after
 * that every response says what the next one should use.
 */
export function useShowGraphEdits(
  showId: ShowId | null,
  baseVersion: number | undefined,
  { onAmend }: ShowGraphEditsOptions = {},
): ShowGraphEdits {
  const queryClient = useQueryClient();
  // Read through a ref for the same reason `useGraphCommands` does: an inline
  // callback shouldn't rebuild the flush loop, and this only ever fires from
  // a settled request.
  const amend = useRef(onAmend);
  useEffect(() => {
    amend.current = onAmend;
  }, [onAmend]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const pending = useRef<
    { watermark: number; edits: readonly (GraphEdit | CanvasWorkspaceEdit)[] }[]
  >([]);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  // Not state: the version is a fact about the last response, and re-rendering
  // on it would re-render the editor for something it never displays.
  const version = useRef<number | null>(null);
  const failed = useRef(false);
  const accepted = useRef(0);
  const acknowledged = useRef(0);
  const failureReason = useRef<Error | null>(null);
  const barriers = useRef<
    {
      cutoff: number;
      resolve(version: number): void;
      reject(error: Error): void;
    }[]
  >([]);

  useEffect(() => {
    if (version.current === null && baseVersion !== undefined) version.current = baseVersion;
  }, [baseVersion]);

  const flush = useCallback(() => {
    timer.current = null;
    if (inFlight.current || failed.current) return;
    const cutoff = barriers.current[0]?.cutoff ?? Infinity;
    const boundary = pending.current.findIndex((entry) => entry.watermark > cutoff);
    const batch = pending.current.splice(0, boundary < 0 ? pending.current.length : boundary);
    const batchCutoff = batch.at(-1)?.watermark ?? acknowledged.current;
    const batchEdits = batch.flatMap((entry) => entry.edits);
    const graphEdits = batchEdits.filter((edit): edit is GraphEdit => !("canvasId" in edit));
    const canvasEdits = batchEdits.filter(
      (edit): edit is CanvasWorkspaceEdit => "canvasId" in edit,
    );
    const edits = [...coalesceGraphEdits(graphEdits), ...coalesceCanvasWorkspaceEdits(canvasEdits)];
    const base = version.current;
    if (edits.length === 0 || !showId || base === null) {
      if (batch.length > 0) pending.current.unshift(...batch);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    const request = graphqlRequest(GRAPHQL_ENDPOINT, ApplyShowEditsMutation, {
      showId,
      baseVersion: base,
      edits: edits.map(toEditInput),
    });
    trackDraftSave(showId, request);
    request
      .then((data) => {
        setError(null);
        const result = data.applyShowEdits;
        version.current = result.version;
        acknowledged.current = batchCutoff;
        failureReason.current = null;
        const waiting = barriers.current;
        barriers.current = waiting.filter((barrier) => barrier.cutoff > batchCutoff);
        for (const barrier of waiting) {
          if (barrier.cutoff <= batchCutoff) barrier.resolve(result.version);
        }
        queryClient.setQueryData(
          showGraphQueryKey(result.showId as ShowId, "draft"),
          (previous: CachedShowGraph | undefined) => {
            const graphEdits = edits.filter((edit): edit is GraphEdit => !("canvasId" in edit));
            const patched = patchShowGraphQueryData(previous, graphEdits);
            return patched
              ? { ...patched, updatedAt: result.updatedAt, version: result.version }
              : undefined;
          },
        );
        if (result.published) {
          // An auto-publishing Show (#856) published this batch too. Only the
          // publish state reads the published graph here, so stamp its
          // metadata and mark it stale rather than refetch it per batch.
          const published = result.published;
          queryClient.setQueryData(
            showGraphQueryKey(result.showId as ShowId, "published"),
            (previous: CachedShowGraph | undefined) =>
              previous ? { ...previous, ...published } : undefined,
          );
          void queryClient.invalidateQueries({
            queryKey: showGraphQueryKey(result.showId as ShowId, "published"),
            refetchType: "none",
          });
        }
        if (result.amendments.length > 0) {
          amend.current?.(result.amendments.map(toGraphEdit));
        }
      })
      .catch((reason: unknown) => {
        pending.current.unshift(...batch);
        failed.current = true;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        failureReason.current = error;
        setError(error);
        for (const barrier of barriers.current.splice(0)) barrier.reject(error);
      })
      .finally(() => {
        inFlight.current = false;
        setSaving(false);
        if (pending.current.length > 0 && !failed.current) flush();
      });
  }, [queryClient, showId]);

  // A pending edit outliving the editor would be an edit silently dropped, so
  // unmounting sends it rather than cancelling it.
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  const enqueue = useCallback(
    (edits: readonly (GraphEdit | CanvasWorkspaceEdit)[]) => {
      if (edits.length === 0) return;
      if (showId) {
        const graphEdits = edits.filter((edit): edit is GraphEdit => !("canvasId" in edit));
        queryClient.setQueryData(
          showGraphQueryKey(showId, "draft"),
          (previous: CachedShowGraph | undefined) => patchShowGraphQueryData(previous, graphEdits),
        );
      }
      accepted.current += 1;
      pending.current.push({ watermark: accepted.current, edits: [...edits] });
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, queryClient, showId],
  );

  const retry = useCallback(() => {
    if (!failed.current) return;
    failed.current = false;
    setError(null);
    flush();
  }, [flush]);
  const persistDraft = useCallback((): Promise<number> => {
    if (failureReason.current) return Promise.reject(failureReason.current);
    if (!showId || version.current === null)
      return Promise.reject(new Error("The draft is not ready."));
    const cutoff = accepted.current;
    if (acknowledged.current >= cutoff) return Promise.resolve(version.current);
    const result = new Promise<number>((resolve, reject) => {
      barriers.current.push({ cutoff, resolve, reject });
    });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    flush();
    return result;
  }, [flush, showId]);

  const acceptExternal = useCallback(
    (receipt: {
      version: number;
      updatedAt: string;
      published: { version: number; updatedAt: string } | null;
    }) => {
      if (!showId || inFlight.current || pending.current.length > 0) {
        throw new Error("Authored edits are still pending after the clipboard operation.");
      }
      version.current = receipt.version;
      queryClient.setQueryData(
        showGraphQueryKey(showId, "draft"),
        (previous: CachedShowGraph | undefined) =>
          previous
            ? { ...previous, version: receipt.version, updatedAt: receipt.updatedAt }
            : undefined,
      );
      void queryClient.invalidateQueries({
        queryKey: showGraphQueryKey(showId, "draft"),
        refetchType: "none",
      });
      if (receipt.published) {
        queryClient.setQueryData(
          showGraphQueryKey(showId, "published"),
          (previous: CachedShowGraph | undefined) =>
            previous ? { ...previous, ...receipt.published } : undefined,
        );
        void queryClient.invalidateQueries({
          queryKey: showGraphQueryKey(showId, "published"),
          refetchType: "none",
        });
      }
    },
    [queryClient, showId],
  );

  return { enqueue, persistDraft, acceptExternal, saving, error, retry };
}
