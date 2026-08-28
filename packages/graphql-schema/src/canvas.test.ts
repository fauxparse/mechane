import { print } from "graphql";
import { describe, expect, it } from "vitest";

import { CanvasElementFields } from "./canvas";

describe("Canvas GraphQL query", () => {
  it.each(["textAlign", "objectPosition", "value", "alignSelf", "aspectRatio"])(
    "requests %s when loading Canvas Elements",
    (field) => {
      expect(print(CanvasElementFields)).toContain(field);
    },
  );
});
