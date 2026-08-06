// Seed graphs (issue #38's model, for the editor of #39 to render). One
// per seeded Show, hand-built rather than generated: the point is that
// opening a seeded Show shows something *legible* — a shape a human can
// recognise as a Show — not a pile of representative nodes.
//
// Between them the two graphs cover all five node kinds and all three edge
// kinds, nested and top-level Scenes, a Flow-local producer and a
// Show-level one, a wiring edge that carries a whole value and one that
// picks a field out of a structured one, parallel Navigate edges, and both
// legal Device edge producers (a Flow and a top-level Scene).
import type { ShowGraph } from "@presence/domain";
import { generateId } from "@presence/domain";

/**
 * "Hamlet" — an audience vote, the canonical shape from the PRD: a Flow
 * whose Scenes loop, fed by a Flow-local Source (one tally per audience
 * instance, #29), with the Flow driving the audience's Device and a
 * top-level holding Scene driving the foyer screen.
 */
function hamletGraph(): ShowGraph {
  const vote = generateId("flow");
  const waiting = generateId("scene");
  const voting = generateId("scene");
  const results = generateId("scene");
  const lobby = generateId("scene");
  const tally = generateId("source");
  const winner = generateId("transformer");
  const audiencePhone = generateId("device");
  const foyerScreen = generateId("device");
  const question = generateId("variable");
  const leader = generateId("variable");
  const leaderVotes = generateId("variable");
  const houseMessage = generateId("variable");

  return {
    nodes: [
      {
        id: vote,
        kind: "flow",
        name: "Audience vote",
        parentId: null,
        position: { x: 0, y: 0 },
        defaultSceneId: waiting,
      },
      {
        id: waiting,
        kind: "scene",
        name: "Waiting for the house",
        parentId: vote,
        position: { x: 40, y: 80 },
        variables: [{ id: question, name: "prompt" }],
      },
      {
        id: voting,
        kind: "scene",
        name: "Cast your vote",
        parentId: vote,
        position: { x: 300, y: 80 },
        variables: [],
      },
      {
        id: results,
        kind: "scene",
        name: "The verdict",
        parentId: vote,
        position: { x: 560, y: 80 },
        variables: [
          { id: leader, name: "winner" },
          { id: leaderVotes, name: "voteCount" },
        ],
      },
      // Flow-local (#29): each audience instance of the vote counts its own
      // house, so the tally lives inside the Flow and can only feed Scenes
      // inside it.
      {
        id: tally,
        kind: "source",
        name: "Live tally",
        parentId: vote,
        position: { x: 300, y: 300 },
      },
      {
        id: winner,
        kind: "transformer",
        name: "Leading option",
        parentId: vote,
        position: { x: 560, y: 300 },
      },
      // Show-level: a Scene that isn't in any Flow at all (#20/#25).
      {
        id: lobby,
        kind: "scene",
        name: "Front of house holding slide",
        parentId: null,
        position: { x: 0, y: 480 },
        variables: [{ id: houseMessage, name: "message" }],
      },
      {
        id: audiencePhone,
        kind: "device",
        name: "Audience phones",
        parentId: null,
        position: { x: 880, y: 0 },
      },
      {
        id: foyerScreen,
        kind: "device",
        name: "Foyer screen",
        parentId: null,
        position: { x: 880, y: 480 },
      },
    ],
    edges: [
      {
        id: generateId("edge"),
        kind: "navigate",
        sourceId: waiting,
        targetId: voting,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
      {
        id: generateId("edge"),
        kind: "navigate",
        sourceId: voting,
        targetId: results,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
      // Back round for the next audience — a Flow's Scenes are a state
      // machine, so a cycle here is the normal case, not a mistake.
      {
        id: generateId("edge"),
        kind: "navigate",
        sourceId: results,
        targetId: waiting,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
      // The tally is a structured value; these two edges pull different
      // fields out of it into different Variables on one Scene.
      {
        id: generateId("edge"),
        kind: "wiring",
        sourceId: winner,
        targetId: results,
        sourcePath: ["option", "label"],
        targetPath: [leader],
      },
      {
        id: generateId("edge"),
        kind: "wiring",
        sourceId: tally,
        targetId: results,
        sourcePath: ["total"],
        targetPath: [leaderVotes],
      },
      {
        id: generateId("edge"),
        kind: "device",
        sourceId: vote,
        targetId: audiencePhone,
        sourcePath: [],
        targetPath: [],
      },
      // The other legal Device producer: a top-level Scene (#26).
      {
        id: generateId("edge"),
        kind: "device",
        sourceId: lobby,
        targetId: foyerScreen,
        sourcePath: [],
        targetPath: [],
      },
    ],
  };
}

/**
 * "A Midsummer Night's Dream" — deliberately a different shape: two
 * unrelated Flows, a Show-level Source feeding into one of them (the
 * unrestricted case, in contrast to Hamlet's Flow-local tally), and
 * parallel Navigate edges between one pair of Scenes.
 */
function midsummerGraph(): ShowGraph {
  const lovers = generateId("flow");
  const mechanicals = generateId("flow");
  const forest = generateId("scene");
  const chase = generateId("scene");
  const wake = generateId("scene");
  const rehearsal = generateId("scene");
  const play = generateId("scene");
  const roster = generateId("source");
  const pairing = generateId("transformer");
  const houseScreen = generateId("device");
  const partnerName = generateId("variable");
  const pursuerName = generateId("variable");
  const cast = generateId("variable");

  return {
    nodes: [
      {
        id: lovers,
        kind: "flow",
        name: "The lovers",
        parentId: null,
        position: { x: 0, y: 0 },
        defaultSceneId: forest,
      },
      {
        id: forest,
        kind: "scene",
        name: "Into the wood",
        parentId: lovers,
        position: { x: 40, y: 80 },
        variables: [],
      },
      {
        id: chase,
        kind: "scene",
        name: "The chase",
        parentId: lovers,
        position: { x: 300, y: 80 },
        variables: [{ id: pursuerName, name: "pursuer" }],
      },
      {
        id: wake,
        kind: "scene",
        name: "Waking up",
        parentId: lovers,
        position: { x: 560, y: 80 },
        variables: [{ id: partnerName, name: "belovedOf" }],
      },
      {
        id: mechanicals,
        kind: "flow",
        name: "The mechanicals",
        parentId: null,
        position: { x: 0, y: 400 },
        defaultSceneId: rehearsal,
      },
      {
        id: rehearsal,
        kind: "scene",
        name: "Rehearsal",
        parentId: mechanicals,
        position: { x: 40, y: 480 },
        variables: [{ id: cast, name: "castList" }],
      },
      {
        id: play,
        kind: "scene",
        name: "Pyramus and Thisbe",
        parentId: mechanicals,
        position: { x: 300, y: 480 },
        variables: [],
      },
      // Show-level producers: one roster for the whole Show, so unlike
      // Hamlet's tally these may feed Scenes in any Flow.
      {
        id: roster,
        kind: "source",
        name: "Audience sign-ups",
        parentId: null,
        position: { x: 560, y: 700 },
      },
      {
        id: pairing,
        kind: "transformer",
        name: "Pair them off",
        parentId: null,
        position: { x: 820, y: 700 },
      },
      {
        id: houseScreen,
        kind: "device",
        name: "House screen",
        parentId: null,
        position: { x: 880, y: 400 },
      },
    ],
    edges: [
      {
        id: generateId("edge"),
        kind: "navigate",
        sourceId: forest,
        targetId: chase,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
      // Parallel Navigate edges (#20): two different ways out of the chase
      // into the same Scene. Cues and Actions aren't modelled yet, so what
      // distinguishes them is still to come — the pair is legal today.
      {
        id: generateId("edge"),
        kind: "navigate",
        sourceId: chase,
        targetId: wake,
        sourcePath: [],
        targetPath: [],
        cueId: "cue-exhausted",
        actionId: null,
      },
      {
        id: generateId("edge"),
        kind: "navigate",
        sourceId: chase,
        targetId: wake,
        sourcePath: [],
        targetPath: [],
        cueId: "cue-puck-intervenes",
        actionId: null,
      },
      {
        id: generateId("edge"),
        kind: "navigate",
        sourceId: rehearsal,
        targetId: play,
        sourcePath: [],
        targetPath: [],
        cueId: null,
        actionId: null,
      },
      {
        id: generateId("edge"),
        kind: "wiring",
        sourceId: pairing,
        targetId: wake,
        sourcePath: ["beloved", "name"],
        targetPath: [partnerName],
      },
      {
        id: generateId("edge"),
        kind: "wiring",
        sourceId: pairing,
        targetId: chase,
        sourcePath: ["pursuer", "name"],
        targetPath: [pursuerName],
      },
      // Whole value, no path: the roster goes into the cast list as-is.
      {
        id: generateId("edge"),
        kind: "wiring",
        sourceId: roster,
        targetId: rehearsal,
        sourcePath: [],
        targetPath: [cast],
      },
      {
        id: generateId("edge"),
        kind: "device",
        sourceId: mechanicals,
        targetId: houseScreen,
        sourcePath: [],
        targetPath: [],
      },
    ],
  };
}

/**
 * A graph builder per seeded Show name. Shows not listed here seed with no
 * graph at all, which is the third state worth being able to look at: empty
 */
export const SEED_GRAPHS: Record<string, () => ShowGraph> = {
  Hamlet: hamletGraph,
  "A Midsummer Night's Dream": midsummerGraph,
};
