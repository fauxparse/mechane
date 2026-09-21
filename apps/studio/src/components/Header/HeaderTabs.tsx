import { Tabs, TabsList, TabsTrigger, TvMinimalIcon, WorkflowIcon } from "@mechane/design-system";
import type { MouseEvent } from "react";

import type { HeaderProps } from "./Header";
import { navigationIntentFor } from "./header-navigation";

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
            <a href={navigation.showEditor.href} onClick={activate(navigation.showEditor)}>
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
            <a href={navigation.canvasEditor.href} onClick={activate(navigation.canvasEditor)}>
              <TvMinimalIcon />
              Scenes
            </a>
          }
        />
      </TabsList>
    </Tabs>
  );
}

function activate(destination: HeaderProps["navigation"]["showEditor"]) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    switch (navigationIntentFor(event)) {
      case "navigate":
        destination.onSelect();
        return;
      case "new-tab":
        window.open(destination.href, "_blank", "noopener");
        return;
      case "ignore":
        return;
    }
  };
}
