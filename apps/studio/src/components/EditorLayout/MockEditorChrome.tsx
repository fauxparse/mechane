// Wraps an editor in fixture Chrome. Use as a story decorator.
//
// This is what lets an editor be reviewed inside its real Chrome — the sidebars
// it actually renders into, the toolbar in its real place, the Editable Area at
// its real size — without the route that normally supplies all of it.
import type { PropsWithChildren } from "react";

import { EditorLayout } from "./EditorLayout";
import { MOCK_HEADER } from "./editor-layout-fixtures";
import type { EditorKind, HeaderProps } from "../Header/Header";

export interface MockEditorChromeProps extends PropsWithChildren {
  activeEditor?: EditorKind;
  /** Starting state only — the trigger stays live so a story can collapse them. */
  sidebarsOpen?: boolean;
  header?: Partial<Omit<HeaderProps, "className">>;
}

export function MockEditorChrome({
  activeEditor = "show",
  sidebarsOpen = true,
  header,
  children,
}: MockEditorChromeProps) {
  return (
    <EditorLayout
      defaultSidebarsOpen={sidebarsOpen}
      header={{ ...MOCK_HEADER, activeEditor, ...header }}
    >
      {children}
    </EditorLayout>
  );
}
