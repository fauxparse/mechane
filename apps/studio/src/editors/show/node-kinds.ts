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
  Hash,
  List,
  Projector,
  Smartphone,
  ToggleLeft,
  TvMinimal,
  Type,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
 * A Source's icon reflects the *type of data it holds* (#35) rather than
 * "Source" in general — the icon is doing the work a hue would otherwise do.
 *
 * The Source/Shape type set doesn't exist yet: PRD.md §10 defers it, and #35
 * flagged this mapping as inferred and extensible. `Box` (an object) is the
 * fallback until Shapes land, which is why every Source currently shows it.
 */
export const SOURCE_TYPE_ICONS = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  object: Box,
  array: List,
} as const satisfies Record<string, LucideIcon>;

/**
 * The icon a node shows. Two kinds don't answer with a constant:
 *
 *   - **Device** resolves by role (#35, #26): a `Smartphone` for an
 *     Audience-role Device, a `Projector` for a single-endpoint one. Roles
 *     reach the graph with #45, so every Device is a projector for now.
 *   - **Source** resolves by data type, per `SOURCE_TYPE_ICONS` above.
 */
export function nodeIcon(kind: NodeKind, hints: { deviceRole?: string; sourceType?: string } = {}) {
  if (kind === "device" && hints.deviceRole === "audience") return Smartphone;
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
): GraphNode {
  const base = {
    id: generateId(NODE_ID_ENTITIES[kind]),
    name: NODE_KIND_META[kind].defaultName,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
  };
  switch (kind) {
    case "scene":
      return { ...base, kind: "scene", parentId, variables: [] };
    case "flow":
      // A Flow is always a Show-level peer (#23), and starts with no entry
      // Scene because it starts with no Scenes — promoting one into it assigns
      // the default (#44).
      return { ...base, kind: "flow", parentId: null, defaultSceneId: null };
    case "device":
      return { ...base, kind: "device", parentId: null };
    case "source":
      return { ...base, kind: "source", parentId };
    case "transformer":
      return { ...base, kind: "transformer", parentId };
  }
}
