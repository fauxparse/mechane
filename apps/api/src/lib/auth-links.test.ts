import { describe, expect, it } from "vitest";

import { buildStudioResetUrl } from "./auth-links";

describe("buildStudioResetUrl", () => {
  it("sends reset links to the Studio form with Better Auth's token", () => {
    const url = buildStudioResetUrl(
      "https://api.mechane.dev/api/auth/reset-password/reset-token?callbackURL=https%3A%2F%2Fstudio.mechane.dev%2Freset-password",
      "https://studio.mechane.dev",
    );

    expect(url).toBe("https://studio.mechane.dev/reset-password?token=reset-token");
  });
});
