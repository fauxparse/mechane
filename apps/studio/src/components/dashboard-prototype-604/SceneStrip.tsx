// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// "Clicking scene thumbnails should take you directly to that scene in the
// editor." Each thumbnail is a real button carrying its Artboard id, which is
// the Scene node id the Canvas editor's `/shows/$showId/art/$artId` route
// takes — so this is a jump straight to the Scene, not to the Show's default
// Artboard.
//
// The strip occupies a fixed number of slots rather than growing: a Show with
// twenty Scenes must not push the actions off the band. When the Scenes do not
// fit, the overflow count takes the *last* slot rather than appending a
// further one, so the strip's width is the same whatever it holds.
import { cn } from "@mechane/design-system";

import { ShowPreview } from "./ShowPreview";
import type { ScenePreview } from "./use-show-preview";

export interface SceneStripProps {
  scenes: readonly ScenePreview[];
  onOpenScene(artId: string): void;
  /** Total tiles, overflow tile included. Four fills the band's column. */
  slots?: number;
  className?: string;
  /** Thumbnail width; the height follows the Scene's own aspect ratio. */
  size?: "sm" | "md";
}

export function SceneStrip({
  scenes,
  onOpenScene,
  slots = 4,
  className,
  size = "sm",
}: SceneStripProps) {
  if (scenes.length === 0) return null;

  // Exactly `slots` Scenes still fit, because no overflow tile is needed. One
  // more than that, and the last slot has to become the counter — so five
  // Scenes in four slots shows three thumbnails and "+2", not four and "+1".
  const overflowing = scenes.length > slots;
  const shown = overflowing ? scenes.slice(0, slots - 1) : scenes;
  const hidden = scenes.length - shown.length;
  const tile = size === "sm" ? "h-12 w-20" : "h-16 w-28";

  return (
    <ul className={cn("flex flex-wrap items-start gap-2", className)}>
      {shown.map((scene) => (
        <li key={scene.artId}>
          <button
            type="button"
            onClick={() => onOpenScene(scene.artId)}
            title={`${scene.name} — ${scene.width} × ${scene.height}`}
            className={cn(
              "group block cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              size === "sm" ? "w-20" : "w-28",
            )}
          >
            <ShowPreview
              scene={scene}
              fit="cover"
              className={cn(
                "rounded ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-ring",
                size === "sm" ? "h-12" : "h-16",
              )}
            />
            <span className="block truncate pt-1 text-[0.7rem] leading-tight text-muted-foreground group-hover:text-foreground">
              {scene.name}
            </span>
          </button>
        </li>
      ))}
      {hidden > 0 ? (
        <li>
          <span
            className={cn(
              "grid place-items-center rounded bg-muted text-sm font-medium text-muted-foreground ring-1 ring-border",
              tile,
            )}
            title={`${hidden} more ${hidden === 1 ? "Scene" : "Scenes"}`}
          >
            +{hidden}
          </span>
          {/* Keeps the tile's baseline aligned with the labelled ones. */}
          <span aria-hidden="true" className="block pt-1 text-[0.7rem] leading-tight">
            &nbsp;
          </span>
        </li>
      ) : null}
    </ul>
  );
}
