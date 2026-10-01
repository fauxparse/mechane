// Fixture data for stories: a Chrome that needs no query client and no
// signed-in user. The component that wraps an editor in it lives in
// ./MockEditorChrome.tsx, so importing this data costs no Fast Refresh. The
// Header renders router `<Link>`s, so stories wrap it in ../StoryRouter.
import { generateId } from "@mechane/domain/id";

import type { HeaderProps } from "../Header/Header";

const noOp = () => {};

export const MOCK_HEADER: Omit<HeaderProps, "className"> = {
  name: "The Tempest",
  activeEditor: "show",
  showId: generateId("show"),
  user: { id: "1", name: "Prospero Milan", email: "prospero@example.com" },
  onLogOut: noOp,
  autoPublish: true,
  publishState: "published",
  onPublish: noOp,
  runActive: false,
  onStartRun: noOp,
  onEndRun: noOp,
  onRename: noOp,
};
