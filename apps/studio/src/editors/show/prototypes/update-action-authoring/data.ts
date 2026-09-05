/**
 * PROTOTYPE — throwaway. Not production code.
 *
 * Mock scenario for the Update Action authoring prototype, mirroring the
 * seeded Hamlet audience-vote show. The route being authored is:
 *
 *   Candidate Block: Element tap
 *     -> Block Cue `selected(candidate)`        (actionless, typed output)
 *     -> Slot `candidates` exposes `selected`
 *     -> Slot Event Binding maps candidate -> chosen
 *     -> Scene Cue `chooseCandidate(chosen)`
 *     -> Update Action: set currentCandidate = chosen
 *
 * Local mock state only. Nothing here touches the real graph or commands.
 */

export type Operation = "set" | "reset" | "adjust";

export interface PrototypeState {
  /** Block-side */
  blockCueName: string;
  blockCueParamName: string;
  elementEventKind: "tap" | "keypress";
  elementParamSource: string;

  /** Slot-side relay */
  slotEventBindingTarget: string;
  slotParamMapping: string;

  /** Scene-side */
  sceneCueName: string;
  sceneCueParamName: string;

  /** The Update Action */
  targetSourceId: string;
  targetFieldPath: readonly string[];
  operation: Operation;
  operandKind: "literal" | "parameter";
  operandRef: string;
  operandLiteral: string;

  /** Source panel */
  runActive: boolean;
  defaultValue: string;
  currentValue: string;
}

export const INITIAL_STATE: PrototypeState = {
  blockCueName: "selected",
  blockCueParamName: "candidate",
  elementEventKind: "tap",
  elementParamSource: "candidate (Block Variable)",

  slotEventBindingTarget: "chooseCandidate",
  slotParamMapping: "candidate",

  sceneCueName: "chooseCandidate",
  sceneCueParamName: "chosen",

  targetSourceId: "source-current-candidate",
  targetFieldPath: [],
  operation: "set",
  operandKind: "parameter",
  operandRef: "chosen",
  operandLiteral: "",

  runActive: true,
  defaultValue: "—  (empty Candidate)",
  currentValue: "Ophelia",
};

export const SOURCES = [
  { id: "source-current-candidate", name: "Current candidate", type: "Candidate" },
  { id: "source-tally", name: "Vote tally", type: "Number" },
  { id: "source-round", name: "Round", type: "Number" },
];

export const FIELDS_BY_SOURCE: Record<string, { path: string[]; label: string }[]> = {
  "source-current-candidate": [
    { path: [], label: "Whole Source" },
    { path: ["name"], label: "name" },
    { path: ["portrait"], label: "portrait" },
  ],
  "source-tally": [{ path: [], label: "Whole Source" }],
  "source-round": [{ path: [], label: "Whole Source" }],
};

/** The five links of the route, in dispatch order. */
export const CHAIN = [
  { key: "element", label: "Tap", owner: "Canvas Editor · Candidate Block" },
  { key: "blockCue", label: "selected", owner: "Canvas Editor · Candidate Block" },
  { key: "slot", label: "Slot relay", owner: "Canvas Editor · Vote Scene" },
  { key: "sceneCue", label: "chooseCandidate", owner: "Show Editor · Vote Scene" },
  { key: "action", label: "Update", owner: "Show Editor · Vote Scene" },
] as const;

export type ChainKey = (typeof CHAIN)[number]["key"];

export function sourceName(id: string): string {
  return SOURCES.find((source) => source.id === id)?.name ?? id;
}

export function targetLabel(state: PrototypeState): string {
  const base = sourceName(state.targetSourceId);
  return state.targetFieldPath.length === 0 ? base : `${base}.${state.targetFieldPath.join(".")}`;
}

export function operandLabel(state: PrototypeState): string {
  if (state.operation === "reset") return "published default";
  return state.operandKind === "parameter" ? state.operandRef : (state.operandLiteral || "—");
}
