import { createLucideIcon } from "lucide-react";

import { MECHANE_ICON_PATH } from "./mechane-path";

export const MechaneIcon = createLucideIcon("logo", [
  [
    "path",
    {
      d: MECHANE_ICON_PATH,
      key: "solid",
      stroke: "none",
      fill: "currentColor",
      fillRule: "evenodd",
    },
  ],
]);
