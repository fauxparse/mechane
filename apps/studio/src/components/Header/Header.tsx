// The top bar of the Editor Chrome: Show name and its menu, the Show/Scenes
// tabs, the user menu, the live-run control, and the sidebar trigger.
//
// Presentational, like the rest of this folder — the route wires the callbacks
// to navigation and to the rename/publish/run mutations, which keeps the whole
// Chrome renderable in Storybook without a router or a network.
//
// Navigation arrives as `href` + `onSelect` pairs rather than `<Link>`s. The
// href keeps cmd-click and middle-click working as real links; onSelect does
// the SPA navigation. Neither needs a router in scope, so a story can point
// them all at "#".
import { cn } from "@mechane/design-system";
import type { PublishState, ThemeMode } from "@mechane/domain";

import { HeaderLeft } from "./HeaderLeft";
import { HeaderRight } from "./HeaderRight";
import { HeaderTabs } from "./HeaderTabs";

/** Which editor the Chrome is currently wrapped around. */
export type EditorKind = "show" | "canvas";

/**
 * A navigable destination. `href` exists so the control is a real link;
 * `onSelect` performs the client-side navigation.
 */
export interface HeaderDestination {
  href: string;
  onSelect(): void;
}

export interface HeaderNavigation {
  home: HeaderDestination;
  settings: HeaderDestination;
  showEditor: HeaderDestination;
  canvasEditor: HeaderDestination;
  shapes: HeaderDestination;
}

export interface HeaderUser {
  id: string;
  name?: string | null;
  email: string;
  avatarUrl?: string | null;
}

export interface HeaderProps {
  className?: string;
  /** The Show's name — the label on the title menu, and what rename edits. */
  name: string;
  activeEditor: EditorKind;
  navigation: HeaderNavigation;
  user: HeaderUser;
  onLogOut(): void;
  publishState: PublishState;
  onPublish(): void;
  publishDisabledReason?: string;
  publishing?: boolean;
  runActive?: boolean;
  onStartRun(): void;
  onEndRun(): void;
  runPending?: boolean;
  onRename(name: string): void;
  renaming?: boolean;
  renameError?: string;
  /** Overrides persistence when an embedding surface owns theme state. */
  onThemeModeChange?(mode: ThemeMode): void;
}

export const Header = ({ className, ...props }: HeaderProps) => (
  <header
    className={cn(
      "pointer-events-none grid w-full grid-cols-[1fr_auto_1fr] items-start justify-between gap-2",
      className,
    )}
  >
    <HeaderLeft
      name={props.name}
      navigation={props.navigation}
      onRename={props.onRename}
      renaming={props.renaming}
      renameError={props.renameError}
    />
    <HeaderTabs activeEditor={props.activeEditor} navigation={props.navigation} />
    <HeaderRight
      navigation={props.navigation}
      user={props.user}
      onLogOut={props.onLogOut}
      publishState={props.publishState}
      onPublish={props.onPublish}
      publishDisabledReason={props.publishDisabledReason}
      publishing={props.publishing}
      runActive={props.runActive}
      onStartRun={props.onStartRun}
      onEndRun={props.onEndRun}
      runPending={props.runPending}
      onThemeModeChange={props.onThemeModeChange}
    />
  </header>
);
