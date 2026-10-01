// The top bar of the Editor Chrome: Show name and its menu, the Show/Scenes
// tabs, the user menu, the live-run control, and the sidebar trigger.
//
// Presentational, like the rest of this folder — the route wires the callbacks
// to the rename/publish/run mutations. Navigation is plain router `<Link>`s:
// the Header only needs to know which Show it belongs to.
import { cn } from "@mechane/design-system";
import type { PublishState } from "@mechane/domain/publish";
import type { ShowId } from "@mechane/domain/id";
import type { ThemeMode } from "@mechane/domain/theme-settings";

import { HeaderLeft } from "./HeaderLeft";
import { HeaderRight } from "./HeaderRight";
import { HeaderTabs } from "./HeaderTabs";

/** Which editor the Chrome is currently wrapped around. */
export type EditorKind = "show" | "canvas";

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
  showId: ShowId;
  /** The Scene the Scenes tab returns to; without one it opens the Scene list. */
  sceneArtId?: string | null;
  user: HeaderUser;
  onLogOut(): void;
  /**
   * The Show publishes every edit as it lands (#856), so there is nothing to
   * publish and no publish state to report: the publish controls are hidden.
   */
  autoPublish: boolean;
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
      showId={props.showId}
      onRename={props.onRename}
      renaming={props.renaming}
      renameError={props.renameError}
    />
    <HeaderTabs
      activeEditor={props.activeEditor}
      showId={props.showId}
      sceneArtId={props.sceneArtId}
    />
    <HeaderRight
      user={props.user}
      onLogOut={props.onLogOut}
      autoPublish={props.autoPublish}
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
