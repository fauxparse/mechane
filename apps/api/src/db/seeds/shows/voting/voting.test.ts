import {
  assertValidCanvas,
  assertValidShowGraph,
  composeInstanceView,
  defaultSourceValueTemplates,
  defaultSourceValues,
  materializeInstanceState,
  materializeRunState,
  isStructuredValueReference,
  resolveCueParameters,
  resolveRuntimeEvent,
  resolveSlotInstances,
  sceneVariableResolution,
} from "@mechane/domain";
import type { Element } from "@mechane/domain";
import { describe, expect, it } from "vitest";

import {
  AUDIENCE_FLOW_ID,
  AUDIENCE_VARIABLE_ID,
  CANDIDATE_ORDER_TRANSFORMER_ID,
  CANDIDATE_BUTTON_VARIABLE_ID,
  CANDIDATE_IMAGE_FIELD_ID,
  CANDIDATE_IMAGE_REVISION,
  CANDIDATE_LIST_SCENE_ID,
  CANDIDATE_NAME_FIELD_ID,
  CANDIDATE_SHAPE_ID,
  CANDIDATE_SOURCE_ID,
  CANDIDATE_VOTES_FIELD_ID,
  CANDIDATES,
  CHOOSE_CANDIDATE_CUE_ID,
  CONFIRMATION_SCENE_ID,
  FRONT_RUNNERS_TRANSFORMER_ID,
  CONFIRMATION_VARIABLE_ID,
  SELECTED_SOURCE_ID,
  seedBlockCanvasPosition,
  seedCanvasPosition,
  seedShow,
  TALLY_ROW_TOTAL_VARIABLE_ID,
  TALLY_ROW_VARIABLE_ID,
  TALLY_SCENE_ID,
  TALLY_HEADLINE_TRANSFORMER_ID,
  TALLY_HEADLINE_VARIABLE_ID,
  TALLY_VARIABLE_ID,
  TOTAL_VOTES_TRANSFORMER_ID,
  TOTAL_VOTES_VARIABLE_ID,
  votingCanvases,
  votingGraph,
  workflowBlocks,
} from "./voting";
import { tidySeedGraph } from "../../utils/seed-utils";

describe("Voting seed", () => {
  it("builds the requested valid graph", () => {
    const graph = votingGraph();
    expect(() => assertValidShowGraph(graph)).not.toThrow();
    expect(graph.shapes?.map((shape) => shape.id)).toEqual([CANDIDATE_SHAPE_ID]);
    expect(graph.shapes?.[0]?.fields.map((field) => field.name)).toEqual([
      "name",
      "votes",
      "image",
    ]);

    const sources = graph.nodes.filter((node) => node.kind === "source");
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      id: CANDIDATE_SOURCE_ID,
      name: "Candidates",
      type: { kind: "array", of: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID } },
    });
    expect(sources.find((source) => source.id === SELECTED_SOURCE_ID)).toMatchObject({
      parentId: expect.any(String),
      type: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
    });

    const sourceDefault = graph.sourceFieldDefaults?.[0];
    expect(sourceDefault?.nodeId).toBe(CANDIDATE_SOURCE_ID);
    expect(sourceDefault?.fieldPath).toEqual([]);
    expect(sourceDefault?.value).toEqual(
      CANDIDATES.map((candidate) => ({
        [CANDIDATE_NAME_FIELD_ID]: candidate.name,
        [CANDIDATE_VOTES_FIELD_ID]: 0,
        [CANDIDATE_IMAGE_FIELD_ID]: {
          assetId: candidate.imageAssetId,
          revision: CANDIDATE_IMAGE_REVISION,
        },
      })),
    );

    const scenes = graph.nodes.filter((node) => node.kind === "scene");
    expect(scenes.map((scene) => scene.name)).toEqual([
      "Projector tally",
      "Candidate list",
      "Confirmation screen",
      "Thank you screen",
    ]);
    expect(graph.nodes.find((node) => node.id === TALLY_SCENE_ID)).toMatchObject({
      variables: [
        { id: TALLY_HEADLINE_VARIABLE_ID, type: "text" },
        { id: TALLY_VARIABLE_ID, type: { kind: "array" } },
        { id: TOTAL_VOTES_VARIABLE_ID, name: "Total", type: "number" },
      ],
    });
    expect(graph.nodes.filter((node) => node.kind === "transformer")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: TALLY_HEADLINE_TRANSFORMER_ID,
          transform: expect.objectContaining({ kind: "calculate" }),
        }),
        expect.objectContaining({
          id: TOTAL_VOTES_TRANSFORMER_ID,
          name: "Total votes",
          transform: { kind: "calculate", formula: "SUM(candidates.votes)", outputType: "number" },
        }),
        expect.objectContaining({
          id: FRONT_RUNNERS_TRANSFORMER_ID,
          transform: expect.objectContaining({ kind: "filter" }),
        }),
        expect.objectContaining({
          id: CANDIDATE_ORDER_TRANSFORMER_ID,
          transform: { kind: "shuffle" },
        }),
      ]),
    );
    expect(graph.nodes.find((node) => node.id === CANDIDATE_LIST_SCENE_ID)).toMatchObject({
      variables: [{ id: AUDIENCE_VARIABLE_ID, type: { kind: "array" } }],
    });

    expect(graph.edges.filter((edge) => edge.kind === "navigate")).toMatchObject([
      { actionId: "action_choose_candidate_navigate" },
      { actionId: "action_confirm_yes_navigate" },
      { actionId: "action_confirm_no_navigate" },
    ]);
    expect(graph.nodes.filter((node) => node.kind === "device")).toEqual([
      expect.objectContaining({ name: "Projector", perConnection: false }),
      expect.objectContaining({ name: "Audience", perConnection: true }),
    ]);
  });

  it("tidies graph positions when the seed is persisted", () => {
    const graph = tidySeedGraph(votingGraph());
    const flow = graph.nodes.find((node) => node.id === AUDIENCE_FLOW_ID);
    if (flow?.kind !== "flow") throw new Error("Audience Flow is missing.");
    const scenes = graph.nodes
      .filter(
        (node): node is Extract<typeof node, { kind: "scene" }> =>
          node.kind === "scene" && node.parentId === AUDIENCE_FLOW_ID,
      )
      .sort((left, right) => left.position.x - right.position.x);
    expect(scenes.map((scene) => scene.id)).toEqual([
      CANDIDATE_LIST_SCENE_ID,
      CONFIRMATION_SCENE_ID,
      "scene_thank_you",
    ]);
    expect(scenes.map((scene) => scene.position.y)).toEqual([114, 114, 114]);
    expect(scenes.map((scene) => scene.position.x)).toEqual([64, 400, 736]);
    const flowSize = flow.size;
    if (!flowSize) throw new Error("Tidy layout did not size the Audience Flow.");
    expect(flowSize).toEqual({ width: 1040, height: 546 });

    const devices = graph.nodes.filter((node) => node.kind === "device");
    expect(devices.every((device) => device.position.x > flow.position.x + flowSize.width)).toBe(
      true,
    );
    const devicesByY = [...devices].sort((left, right) => left.position.y - right.position.y);
    expect(devicesByY[1]!.position.y - devicesByY[0]!.position.y).toBe(403);
    expect(tidySeedGraph(graph)).toEqual(graph);
  });

  it("materializes one array source with zero votes", () => {
    const values = defaultSourceValues(votingGraph())[CANDIDATE_SOURCE_ID];
    expect(Array.isArray(values)).toBe(true);
    if (!Array.isArray(values))
      throw new Error("Candidate source did not materialize as an array.");
    expect(values).toHaveLength(3);
    const votes = values.map((value) => {
      if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new Error("Candidate source item has no shape value.");
      if (!(CANDIDATE_VOTES_FIELD_ID in value))
        throw new Error("Candidate source item has no vote field.");
      return value[CANDIDATE_VOTES_FIELD_ID];
    });
    expect(votes).toEqual([0, 0, 0]);
  });

  it("builds valid canvases at the requested viewport dimensions", () => {
    const canvases = votingCanvases();
    expect(Object.keys(canvases)).toHaveLength(4);
    for (const canvas of Object.values(canvases))
      expect(() =>
        assertValidCanvas(canvas as Parameters<typeof assertValidCanvas>[0]),
      ).not.toThrow();
    expect(canvases[CANDIDATE_LIST_SCENE_ID]?.root.sizing).toMatchObject({
      width: { mode: "fixed", value: 360 },
      height: { mode: "fixed", value: 720 },
    });
    expect(canvases[CONFIRMATION_SCENE_ID]?.root.sizing).toMatchObject({
      width: { mode: "fixed", value: 360 },
      height: { mode: "fixed", value: 720 },
    });
    expect(canvases[TALLY_SCENE_ID]?.root.sizing).toMatchObject({
      width: { mode: "fixed", value: 1920 },
      height: { mode: "fixed", value: 1080 },
    });
  });

  it("repeats CandidateButton and TallyRow over the candidate array", () => {
    const canvases = votingCanvases();
    const candidateListSlot = canvases[CANDIDATE_LIST_SCENE_ID]?.root.children?.[1];
    const tallySlot = canvases[TALLY_SCENE_ID]?.root.children?.[1];
    expect(candidateListSlot).toMatchObject({
      type: "slot",
      blockId: "block_candidate_button",
      expansion: { source: { kind: "variable", variableId: AUDIENCE_VARIABLE_ID } },
      assignments: [{ variableId: CANDIDATE_BUTTON_VARIABLE_ID, source: { kind: "runtimeItem" } }],
    });
    expect(tallySlot).toMatchObject({
      type: "slot",
      blockId: "block_tally_row",
      expansion: { source: { kind: "variable", variableId: TALLY_VARIABLE_ID } },
      assignments: expect.arrayContaining([
        { variableId: TALLY_ROW_VARIABLE_ID, source: { kind: "runtimeItem" } },
        {
          variableId: TALLY_ROW_TOTAL_VARIABLE_ID,
          source: { kind: "variable", variableId: TOTAL_VOTES_VARIABLE_ID },
        },
      ]),
    });
  });

  it("resolves the candidate list from the array source", () => {
    const graph = votingGraph();
    const canvases = votingCanvases();
    const candidateList = graph.nodes.find((node) => node.id === CANDIDATE_LIST_SCENE_ID);
    if (candidateList?.kind !== "scene") throw new Error("Candidate list scene is missing.");
    const candidatesVariable = candidateList.variables[0];
    if (!candidatesVariable?.type) throw new Error("Candidate list variable type is missing.");
    const state = materializeRunState(graph, defaultSourceValueTemplates(graph));
    const resolution = sceneVariableResolution(graph, candidateList.id, state.sourceValues, {
      structuredValues: state.structuredValues,
      shuffleSeeds: { [CANDIDATE_ORDER_TRANSFORMER_ID]: "test-seed" },
    });
    const values = resolution.values;
    const slot = canvases[CANDIDATE_LIST_SCENE_ID]?.root.children?.[1];
    if (slot?.type !== "slot") throw new Error("Candidate list slot is missing.");
    const candidateButton = workflowBlocks().find((block) => block.id === "block_candidate_button");
    if (!candidateButton) throw new Error("CandidateButton block is missing.");
    const result = resolveSlotInstances({
      block: candidateButton,
      slot,
      variables: [
        {
          id: AUDIENCE_VARIABLE_ID,
          type: candidatesVariable.type,
          value: values[AUDIENCE_VARIABLE_ID],
        },
      ],
      runtimeType: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
      shapes: graph.shapes,
      allBlocks: workflowBlocks(),
      structuredValues: {
        ...state.structuredValues,
        ...resolution.computedStructuredValues,
      },
    });
    expect(result.instances).toHaveLength(3);
  });

  it("resolves Candidate images inside repeated CandidateButtons", () => {
    const graph = votingGraph();
    const canvases = votingCanvases();
    const candidateList = graph.nodes.find((node) => node.id === CANDIDATE_LIST_SCENE_ID);
    if (candidateList?.kind !== "scene") throw new Error("Candidate list scene is missing.");
    const candidatesVariable = candidateList.variables[0];
    if (!candidatesVariable?.type) throw new Error("Candidate list variable type is missing.");
    const slot = canvases[CANDIDATE_LIST_SCENE_ID]?.root.children?.[1];
    if (slot?.type !== "slot") throw new Error("Candidate list slot is missing.");
    const candidateButton = workflowBlocks().find((block) => block.id === "block_candidate_button");
    if (!candidateButton) throw new Error("CandidateButton block is missing.");
    const state = materializeRunState(graph, defaultSourceValueTemplates(graph));
    const resolution = sceneVariableResolution(graph, candidateList.id, state.sourceValues, {
      structuredValues: state.structuredValues,
      shuffleSeeds: { [CANDIDATE_ORDER_TRANSFORMER_ID]: "test-seed" },
    });
    const values = resolution.values;
    const ordered = values[AUDIENCE_VARIABLE_ID];
    if (!isStructuredValueReference(ordered)) throw new Error("Candidate order was not computed.");
    const orderedRecord = resolution.computedStructuredValues[ordered.ref];
    const firstCandidate = orderedRecord?.kind === "array" ? orderedRecord.items[0] : null;
    if (!isStructuredValueReference(firstCandidate)) {
      throw new Error("Shuffled Candidate reference is missing.");
    }
    const candidateRecord = state.structuredValues[firstCandidate.ref];
    const candidateImage =
      candidateRecord?.kind === "shape" ? candidateRecord.fields[CANDIDATE_IMAGE_FIELD_ID] : null;
    if (
      candidateImage === null ||
      typeof candidateImage !== "object" ||
      !("assetId" in candidateImage)
    ) {
      throw new Error("Shuffled Candidate image is missing.");
    }
    const expectedImageUrl = `/${CANDIDATES.find(
      (candidate) => candidate.imageAssetId === candidateImage.assetId,
    )?.name.toLowerCase()}.png`;
    const result = resolveSlotInstances({
      block: candidateButton,
      slot,
      variables: [
        {
          id: AUDIENCE_VARIABLE_ID,
          type: candidatesVariable.type,
          value: values[AUDIENCE_VARIABLE_ID],
        },
      ],
      runtimeType: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
      shapes: graph.shapes,
      allBlocks: workflowBlocks(),
      structuredValues: {
        ...state.structuredValues,
        ...resolution.computedStructuredValues,
      },
      imageAssets: CANDIDATES.map((candidate) => ({
        assetId: candidate.imageAssetId,
        revision: CANDIDATE_IMAGE_REVISION,
        url: `/${candidate.name.toLowerCase()}.png`,
        width: 128,
        height: 128,
        alt: candidate.name,
        mimeType: "image/png",
        blurHash: null,
      })),
    });
    const first = result.instances[0];
    if (!first?.canvas) throw new Error("CandidateButton instance has no canvas.");
    expect(first.canvas.root.children?.[0]).toMatchObject({
      type: "image",
      image: { url: expectedImageUrl },
    });
  });

  it("passes Candidate shapes into reusable Blocks", () => {
    const [candidateButton, tallyRow] = workflowBlocks();
    expect(candidateButton?.variables).toEqual([
      {
        id: CANDIDATE_BUTTON_VARIABLE_ID,
        name: "Candidate",
        type: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
        required: true,
      },
    ]);
    expect(candidateButton?.canvas.root).toMatchObject({
      direction: "horizontal",
      sizing: {
        width: { mode: "fixed", value: 296 },
        height: { mode: "hug" },
      },
    });
    expect(tallyRow?.variables).toEqual(
      expect.arrayContaining([
        {
          id: TALLY_ROW_VARIABLE_ID,
          name: "Candidate",
          type: { kind: "shape", shapeId: CANDIDATE_SHAPE_ID },
          required: true,
        },
        {
          id: TALLY_ROW_TOTAL_VARIABLE_ID,
          name: "Total",
          type: "number",
          required: true,
        },
      ]),
    );
    expect(candidateButton?.canvas.root.children?.[0]).toMatchObject({
      type: "image",
      image: {
        kind: "variable",
        variableId: CANDIDATE_BUTTON_VARIABLE_ID,
        fieldPath: [CANDIDATE_IMAGE_FIELD_ID],
      },
    });
    expect(candidateButton?.canvas.root.children?.[1]).toMatchObject({
      content: {
        kind: "variable",
        variableId: CANDIDATE_BUTTON_VARIABLE_ID,
        fieldPath: [CANDIDATE_NAME_FIELD_ID],
      },
    });
    expect(tallyRow?.canvas.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: {
            kind: "variable",
            variableId: TALLY_ROW_VARIABLE_ID,
            fieldPath: [CANDIDATE_NAME_FIELD_ID],
          },
        }),
        expect.objectContaining({
          content: {
            kind: "variable",
            variableId: TALLY_ROW_VARIABLE_ID,
            fieldPath: [CANDIDATE_VOTES_FIELD_ID],
          },
        }),
      ]),
    );
  });

  it("authors the responsive tally bar formulas on one reusable block", () => {
    const [, tallyRow] = workflowBlocks();
    const track = tallyRow?.canvas.root.children?.find((child) => child.id === "tally-row-track");
    const bar = track?.children?.find((child) => child.id === "tally-row-bar");
    expect(track).toMatchObject({
      type: "frame",
      sizing: { width: { mode: "fill" } },
    });
    expect(bar).toMatchObject({
      type: "rect",
      sizing: {
        width: {
          mode: "fixed",
          value: {
            kind: "formula",
            formula: "item.votes / Total * 100",
            unit: "%",
          },
        },
      },
      hidden: { kind: "formula", formula: "item.votes == 0", fallback: false },
    });
  });

  it("resolves distinct percentage bars and hides zero-vote candidates", () => {
    const graph = votingGraph();
    const state = materializeRunState(graph, defaultSourceValueTemplates(graph));
    const candidates = state.sourceValues[CANDIDATE_SOURCE_ID];
    if (!isStructuredValueReference(candidates)) throw new Error("Candidates source is missing.");
    const candidateArray = state.structuredValues[candidates.ref];
    if (candidateArray?.kind !== "array") throw new Error("Candidates array is missing.");
    const votes = [10, 0, 30];
    candidateArray.items.forEach((item, index) => {
      if (!isStructuredValueReference(item)) throw new Error("Candidate reference is missing.");
      const candidate = state.structuredValues[item.ref];
      if (candidate?.kind !== "shape") throw new Error("Candidate shape is missing.");
      (candidate.fields as Record<string, unknown>)[CANDIDATE_VOTES_FIELD_ID] = votes[index] ?? 0;
    });
    const tallyScene = graph.nodes.find((node) => node.id === TALLY_SCENE_ID);
    if (tallyScene?.kind !== "scene") throw new Error("Tally scene is missing.");
    const resolution = sceneVariableResolution(graph, tallyScene.id, state.sourceValues, {
      structuredValues: state.structuredValues,
    });
    expect(resolution.values[TOTAL_VOTES_VARIABLE_ID]).toBe(40);
    const slot = votingCanvases()[TALLY_SCENE_ID]?.root.children?.[1];
    const candidateVariable = tallyScene.variables.find(
      (variable) => variable.id === TALLY_VARIABLE_ID,
    );
    const totalVariable = tallyScene.variables.find(
      (variable) => variable.id === TOTAL_VOTES_VARIABLE_ID,
    );
    if (!slot || slot.type !== "slot" || !candidateVariable?.type || !totalVariable?.type) {
      throw new Error("Tally slot variables are missing.");
    }
    const instances = resolveSlotInstances({
      block: workflowBlocks().find((block) => block.id === "block_tally_row")!,
      slot,
      variables: [
        {
          id: TALLY_VARIABLE_ID,
          type: candidateVariable.type,
          value: resolution.values[TALLY_VARIABLE_ID],
        },
        {
          id: TOTAL_VOTES_VARIABLE_ID,
          type: totalVariable.type,
          value: resolution.values[TOTAL_VOTES_VARIABLE_ID],
        },
      ],
      shapes: graph.shapes,
      allBlocks: graph.blocks ?? [],
      structuredValues: {
        ...state.structuredValues,
        ...resolution.computedStructuredValues,
      },
    });
    expect(instances.instances).toHaveLength(3);
    const bars = instances.instances.map((instance) => {
      const track = instance.canvas?.root.children?.find((child) => child.id === "tally-row-track");
      return track?.children?.find((child) => child.id === "tally-row-bar");
    });
    expect(bars.map((bar) => bar?.sizing?.width?.value)).toEqual([
      { value: 25, unit: "%" },
      { value: 0, unit: "%" },
      { value: 75, unit: "%" },
    ]);
    expect(bars.map((bar) => bar?.hidden)).toEqual([false, true, false]);
  });

  it("assigns persisted ranks to every Block sibling", () => {
    const visit = (element: Element): void => {
      const children = element.children ?? [];
      const ranks = children.map((child) => child.rank);
      expect(ranks.every((rank) => rank !== undefined && rank !== "")).toBe(true);
      expect(new Set(ranks).size).toBe(ranks.length);
      children.forEach(visit);
    };
    workflowBlocks().forEach((block) => visit(block.canvas.root));
  });

  it("lays seeded scenes out in a row and blocks below them", () => {
    expect(seedCanvasPosition(0)).toEqual({ x: 0, y: 0 });
    expect(seedCanvasPosition(1)).toEqual({ x: 800, y: 0 });
    expect(seedBlockCanvasPosition(0)).toEqual({ x: 0, y: 900 });
    expect(seedBlockCanvasPosition(1)).toEqual({ x: 0, y: 1400 });
  });

  it("shows the selected Candidate's name and image on the confirmation screen", () => {
    const children = votingCanvases()[CONFIRMATION_SCENE_ID]?.root.children ?? [];
    expect(children.find((child) => child.id === "confirmation-selected")).toMatchObject({
      content: {
        kind: "variable",
        variableId: CONFIRMATION_VARIABLE_ID,
        fieldPath: [CANDIDATE_NAME_FIELD_ID],
      },
    });
    expect(children.find((child) => child.id === "confirmation-image")).toMatchObject({
      type: "image",
      image: {
        kind: "variable",
        variableId: CONFIRMATION_VARIABLE_ID,
        fieldPath: [CANDIDATE_IMAGE_FIELD_ID],
      },
    });
    // Every sibling keeps a distinct rank, so adding the image did not
    // collide with the buttons the Event Bindings name.
    const ranks = children.map((child) => child.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("relays a CandidateButton tap to the Scene Cue that handles it", () => {
    const graph = votingGraph();
    const plan = resolveRuntimeEvent(graph, {
      sceneId: CANDIDATE_LIST_SCENE_ID,
      canvasId: "canvas_voting_candidate_list",
      elementId: "candidate-button-root",
      eventKind: "tap",
      slotInstancePath: [{ slotElementId: "candidate-list-slot", index: 1 }],
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.cue.id).toBe(CHOOSE_CANDIDATE_CUE_ID);
    expect(plan.actions.map((action) => action.id)).toEqual([
      "action_choose_candidate",
      "action_choose_candidate_navigate",
    ]);
  });

  it("carries the tapped Candidate's record into the Cue Parameter", () => {
    const graph = votingGraph();
    const templates = defaultSourceValueTemplates(graph);
    const state = composeInstanceView(
      materializeRunState(graph, templates),
      materializeInstanceState(graph, AUDIENCE_FLOW_ID, templates),
    );
    const plan = resolveRuntimeEvent(graph, {
      sceneId: CANDIDATE_LIST_SCENE_ID,
      canvasId: "canvas_voting_candidate_list",
      elementId: "candidate-button-root",
      eventKind: "tap",
      slotInstancePath: [{ slotElementId: "candidate-list-slot", index: 1 }],
    });
    if (plan.kind !== "planned") throw new Error("Candidate tap did not resolve.");
    const canvas = votingCanvases()[CANDIDATE_LIST_SCENE_ID];
    if (!canvas) throw new Error("Candidate list Canvas is missing.");
    const resolved = resolveCueParameters({
      graph,
      canvas,
      sceneId: CANDIDATE_LIST_SCENE_ID,
      state,
      blocks: graph.blocks ?? [],
      parameters: plan.parameters,
      transformerRuntime: {
        shuffleSeeds: { [CANDIDATE_ORDER_TRANSFORMER_ID]: "test-seed" },
      },
    });
    expect(resolved.kind).toBe("resolved");
    if (resolved.kind !== "resolved") return;
    // The Parameter carries the reference, so the Update that follows writes
    // the seeded Candidate rather than a detached copy of it.
    const selected = resolved.values["selectedCandidate"];
    const expectedResolution = sceneVariableResolution(
      graph,
      CANDIDATE_LIST_SCENE_ID,
      state.sourceValues,
      {
        structuredValues: state.structuredValues,
        shuffleSeeds: { [CANDIDATE_ORDER_TRANSFORMER_ID]: "test-seed" },
      },
    );
    const ordered = expectedResolution.values[AUDIENCE_VARIABLE_ID];
    expect(isStructuredValueReference(ordered)).toBe(true);
    expect(isStructuredValueReference(selected)).toBe(true);
    if (!isStructuredValueReference(ordered) || !isStructuredValueReference(selected)) return;
    const orderedRecord = expectedResolution.computedStructuredValues[ordered.ref];
    expect(orderedRecord?.kind === "array" ? orderedRecord.items[1] : null).toEqual(selected);
    const record = state.structuredValues[selected.ref];
    expect(record?.kind).toBe("shape");
    expect(CANDIDATES.map((candidate) => candidate.name)).toContain(
      record?.kind === "shape" ? record.fields[CANDIDATE_NAME_FIELD_ID] : null,
    );
  });

  it("exports the Voting seed contract", () => {
    expect(seedShow.name).toBe("Voting");
    expect(seedShow.seed).toBeTypeOf("function");
  });
});
