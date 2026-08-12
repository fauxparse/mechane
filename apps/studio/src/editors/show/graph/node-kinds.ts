// What each node kind is called, what it looks like, and how a new one is
// made (issue #42, per #35's visual language).
//
// One table, because the same five facts are needed by four surfaces — the
// node body, the right-click create menu, the palette, and the inspector —
// and five kinds spread across four files is how they drift apart.
//
// #35's identity rule: **icon plus label only.** Every node wears identical
// `card` chrome, no per-kind hue, because the design system's tokens are
// strictly semantic and hue is reserved for *state* (selection, a dangling
// input) rather than type — and PRD §7 wants the chrome recessive.
import { generateId, NODE_ID_ENTITIES } from "@mechane/domain";
import type { GraphNode, NodeKind, Position } from "@mechane/domain";
import {
  Bot,
  Box,
  Calendar,
  CalendarClock,
  Circle,
  Hash,
  List,
  Projector,
  Smartphone,
  ToggleLeft,
  TvMinimal,
  Type,
  Workflow,
} from "@mechane/design-system";
import type { LucideIcon } from "@mechane/design-system";

export interface NodeKindMeta {
  kind: NodeKind;
  /** Title case, for menus and the inspector. */
  label: string;
  icon: LucideIcon;
  /** What a newly created one is called until it's renamed. */
  defaultName: string;
  /** One line for the create menu, in the director's vocabulary (CONTEXT.md). */
  description: string;
}

export const NODE_KIND_META: Record<NodeKind, NodeKindMeta> = {
  scene: {
    kind: "scene",
    label: "Scene",
    icon: TvMinimal,
    defaultName: "New Scene",
    description: "Something a Device displays",
  },
  flow: {
    kind: "flow",
    label: "Flow",
    icon: Workflow,
    defaultName: "New Flow",
    description: "A group of Scenes that behaves as a state machine",
  },
  source: {
    kind: "source",
    label: "Source",
    icon: Box,
    defaultName: "New Source",
    description: "Data the Show holds or produces",
  },
  transformer: {
    kind: "transformer",
    label: "Transformer",
    icon: Bot,
    defaultName: "New Transformer",
    description: "Turns data from one form into another",
  },
  device: {
    kind: "device",
    label: "Device",
    icon: Projector,
    defaultName: "New Device",
    description: "A projector, laptop, or audience phone in the venue",
  },
};

/** Creation order for menus: the two structural kinds first, then data, then output. */
export const CREATABLE_KINDS: NodeKind[] = ["scene", "flow", "source", "transformer", "device"];

/**
 * What a create menu or palette actually offers. Not the same list as the
 * node kinds: a Device comes in two flavours the director chooses between
 * up front (#45), because `perConnection` is fixed at creation and a
 * dropdown inside the inspector would imply it can be changed later.
 *
 * "Audience" rather than "Per-connection Device" — the mechanism is the
 * honest name for the field, but the use case is the honest name for the
 * menu item.
 */
export interface CreatableNode {
  /** Unique among the entries; the palette's command id is built from it. */
  id: string;
  kind: NodeKind;
  /** Devices only; false everywhere else. */
  perConnection: boolean;
  label: string;
  icon: LucideIcon;
  defaultName: string;
  description: string;
}

export const CREATABLE_NODES: CreatableNode[] = [
  ...CREATABLE_KINDS.map((kind) => ({
    id: kind,
    kind,
    perConnection: false,
    label: NODE_KIND_META[kind].label,
    icon: NODE_KIND_META[kind].icon,
    defaultName: NODE_KIND_META[kind].defaultName,
    description: NODE_KIND_META[kind].description,
  })),
  {
    id: "audience",
    kind: "device",
    perConnection: true,
    label: "Audience",
    icon: Smartphone,
    defaultName: "Audience phones",
    description: "A code many phones join, each on its own",
  },
];

/**
 * A Source's icon reflects the *type of data it holds* (#35) rather than
 * "Source" in general — the icon is doing the work a hue would otherwise do.
 *
 * Structured and semantic Source types extend the original mapping without
 * introducing hue-based node chrome (#109).
 */
export const SOURCE_TYPE_ICONS = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  object: Box,
  array: List,
  image: Box,
  color: Circle,
  date: Calendar,
  datetime: CalendarClock,
} as const satisfies Record<string, LucideIcon>;

/**
 * The icon a node shows. Two kinds don't answer with a constant:
 *
 *   - **Device** resolves by instance cardinality (#35, #45): a
 *     `Smartphone` for a per-connection (Audience) Device, a `Projector`
 *     for a shared one.
 *   - **Source** resolves by data type, per `SOURCE_TYPE_ICONS` above.
 */
export function nodeIcon(
  kind: NodeKind,
  hints: { perConnection?: boolean; sourceType?: string } = {},
) {
  if (kind === "device" && hints.perConnection) return Smartphone;
  if (kind === "source") {
    return SOURCE_TYPE_ICONS[hints.sourceType as keyof typeof SOURCE_TYPE_ICONS] ?? Box;
  }
  return NODE_KIND_META[kind].icon;
}

/**
 * A brand-new node of `kind` at `position`, inside `parentId` if given.
 *
 * Ids are generated client-side from the kind's own prefix (#47), so a node
 * has a stable identity the moment it appears — commands, edges, and the
 * selection can all refer to it before any round trip. New Scenes start with
 * no Variables; a Variable is added deliberately, in the inspector.
 */
export function createNode(
  kind: NodeKind,
  position: Position,
  parentId: string | null = null,
  options: { perConnection?: boolean; defaultName?: string } = {},
): GraphNode {
  const base = {
    id: generateId(NODE_ID_ENTITIES[kind]),
    name: options.defaultName ?? NODE_KIND_META[kind].defaultName,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
  };
  switch (kind) {
    case "scene":
      return { ...base, kind: "scene", parentId, variables: [] };
    case "flow":
      // A Flow is always a Show-level peer (#23), and starts with no entry
      // Scene because it starts with no Scenes — moving one into it assigns
      // the default (#44).
      return { ...base, kind: "flow", parentId: null, defaultSceneId: null };
    case "device":
      // `perConnection` is settled here and never again — it decides Event
      // attribution, so the inspector shows it rather than edits it (#45).
      // The code is the server's to mint, so a new Device has none yet.
      return {
        ...base,
        kind: "device",
        parentId: null,
        perConnection: options.perConnection ?? false,
        pairingCode: null,
      };
    case "source":
      return { ...base, kind: "source", parentId, type: "text" };
    case "transformer":
      return { ...base, kind: "transformer", parentId };
  }
}
