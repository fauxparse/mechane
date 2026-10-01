import { Tabs, TabsList, TabsTrigger, TvMinimalIcon, WorkflowIcon } from "@mechane/design-system";

import type { HeaderProps } from "./Header";
import { followHeaderLink } from "./header-navigation";

export function HeaderTabs({
  activeEditor,
  navigation,
}: Pick<HeaderProps, "activeEditor" | "navigation">) {
  return (
    <Tabs className="editor-chrome-header-tabs w-fit justify-self-center" value={activeEditor}>
      <TabsList className="pointer-events-auto rounded-[100vw] bg-muted/50 backdrop-blur-sm">
        <TabsTrigger
          value="show"
          className="rounded-[100vw] border-0 px-3"
          nativeButton={false}
          render={
            <a href={navigation.showEditor.href} onClick={followHeaderLink(navigation.showEditor)}>
              <WorkflowIcon />
              Show
            </a>
          }
        />
        <TabsTrigger
          value="canvas"
          className="rounded-[100vw] border-0 px-3"
          nativeButton={false}
          render={
            <a
              href={navigation.canvasEditor.href}
              onClick={followHeaderLink(navigation.canvasEditor)}
            >
              <TvMinimalIcon />
              Scenes
            </a>
          }
        />
      </TabsList>
    </Tabs>
  );
}
