import { Tabs, TabsList, TabsTrigger, TvMinimalIcon, WorkflowIcon } from "@mechane/design-system";
import { Link } from "@tanstack/react-router";

import type { HeaderProps } from "./Header";

export function HeaderTabs({
  activeEditor,
  showId,
  sceneArtId,
}: Pick<HeaderProps, "activeEditor" | "showId" | "sceneArtId">) {
  return (
    <Tabs className="editor-chrome-header-tabs w-fit justify-self-center" value={activeEditor}>
      <TabsList className="pointer-events-auto rounded-[100vw] bg-muted/50 backdrop-blur-sm">
        <TabsTrigger
          value="show"
          className="rounded-[100vw] border-0 px-3"
          nativeButton={false}
          render={
            <Link to="/shows/$showId" params={{ showId }}>
              <WorkflowIcon />
              Show
            </Link>
          }
        />
        <TabsTrigger
          value="canvas"
          className="rounded-[100vw] border-0 px-3"
          nativeButton={false}
          render={
            sceneArtId ? (
              <Link to="/shows/$showId/art/$artId" params={{ showId, artId: sceneArtId }}>
                <TvMinimalIcon />
                Scenes
              </Link>
            ) : (
              <Link to="/shows/$showId/art" params={{ showId }}>
                <TvMinimalIcon />
                Scenes
              </Link>
            )
          }
        />
      </TabsList>
    </Tabs>
  );
}
