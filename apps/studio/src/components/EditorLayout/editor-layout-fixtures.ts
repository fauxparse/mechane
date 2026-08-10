// Fixture data for stories: a Chrome that needs no router, no query client, and
// no signed-in user. The component that wraps an editor in it lives in
// ./MockEditorChrome.tsx, so importing this data costs no Fast Refresh.
import type { HeaderProps } from "../Header/Header";

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
