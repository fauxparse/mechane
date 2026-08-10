// Fixture Chrome for stories: a mock-up of the Editor Chrome that needs no
// router, no query client, and no signed-in user.
//
// This is what lets an editor be reviewed inside its real Chrome — the sidebars
// it actually renders into, the toolbar in its real place, the Editable Area at
// its real size — without the route that normally supplies all of it.
import type { PropsWithChildren } from "react";

import { EditorLayout } from "./EditorLayout";
import type { HeaderProps } from "../Header/Header";
import type { EditorKind } from "../Header/Header";

const noOp = () => {};

/** Every destination points at "#": a story has nowhere to navigate to. */
const nowhere = { href: "#", onSelect: noOp };

export const MOCK_HEADER: Omit<HeaderProps, "className"> = {
  name: "The Tempest",
  activeEditor: "show",
  navigation: {
    home: nowhere,
    settings: nowhere,
    showEditor: nowhere,
    canvasEditor: nowhere,
  },
  user: { name: "Prospero Milan", email: "prospero@example.com" },
  onLogOut: noOp,
  publishState: "unpublished-changes",
  onPublish: noOp,
  runActive: false,
  onStartRun: noOp,
  onEndRun: noOp,
  onRename: noOp,
};

export interface MockEditorChromeProps extends PropsWithChildren {
  activeEditor?: EditorKind;
  /** Starting state only — the trigger stays live so a story can collapse them. */
  sidebarsOpen?: boolean;
  header?: Partial<Omit<HeaderProps, "className">>;
}

/** Wraps an editor in fixture Chrome. Use as a story decorator. */
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
