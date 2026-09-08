// A row of Scene thumbnails, each a jump into that Scene (issue #604).
//
// Every thumbnail carries its Artboard id, which is the Scene node id the
// Canvas editor's `/shows/$showId/art/$artId` route takes — so a click lands on
// the Scene itself, not on whichever Artboard the Show happens to open with.
//
// How many tiles appear, and how the overflow counter claims the last one, is
// ./scene-slots.
import { cn } from "@mechane/design-system";

import { CSSProperties } from "react";
import { sceneSlots } from "./scene-slots";
import { ShowPreview } from "./ShowPreview";
import type { ScenePreview } from "./use-show-dossier";

export interface SceneStripProps {
  scenes: readonly ScenePreview[];
  onOpenScene(artId: string): void;
  /** Total tiles, overflow counter included. Four fills the band's column. */
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
  const { shown, hidden } = sceneSlots(scenes, slots);

  return (
    <ul
      className={cn("group/scenes flex flex-wrap items-start gap-2 select-none", className)}
      data-size={size}
      style={
        {
          "--tile-width": size === "sm" ? "5rem" : "7rem",
          "--tile-height": size === "sm" ? "3rem" : "4rem",
        } as CSSProperties
      }
    >
      {shown.map((scene) => (
        <li key={scene.artId}>
          <button
            type="button"
            onClick={() => onOpenScene(scene.artId)}
            title={`${scene.name} — ${scene.width} × ${scene.height}`}
            className={cn(
              "group block cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring w-(--tile-width)",
            )}
          >
            <ShowPreview
              scene={scene}
              fit="cover"
              className={cn(
                "rounded ring-1 ring-border transition-shadow group-hover:ring-2 group-hover:ring-ring h-(--tile-height)",
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
            className="grid place-items-center rounded bg-muted/50 text-sm font-medium text-muted-foreground ring-1 ring-border/50 w-(--tile-width) h-(--tile-height)"
            title={`${hidden} more ${hidden === 1 ? "Scene" : "Scenes"}`}
          >
            +{hidden}
          </span>
          {/* Keeps this tile's baseline aligned with the labelled ones. */}
          <span aria-hidden="true" className="block pt-1 text-[0.7rem] leading-tight">
            &nbsp;
          </span>
        </li>
      ) : null}
    </ul>
  );
}
