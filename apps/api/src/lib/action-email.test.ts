import { describe, expect, it } from "vitest";

import { renderActionEmail } from "./action-email";

describe("renderActionEmail", () => {
  it("renders a branded action and matching plain-text link", async () => {
    const url = "https://studio.mechane.dev/reset-password?token=one%26two";
    const email = await renderActionEmail({
      preview: "Reset your password",
      heading: "Reset your password",
      message: "We received a password reset request.",
      actionLabel: "Reset password",
      actionUrl: url,
      expiryNote: "This link expires in 1 hour.",
    });

    expect(email.html).toContain('alt="Mechanē"');
    expect(email.html).toContain("/logo-light.png");
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain("#f3f0e6");
    expect(email.html).toContain("#ffffff");
    expect(email.html).toContain("#e76900");
    expect(email.html).toContain("color:#ffffff");
    expect(email.html).toContain("font-family:Helvetica, Arial, sans-serif");
    expect(email.html).not.toContain("Georgia");
    expect(email.html).toContain("Lift your theatre game");
    expect(email.html).toContain("Reset password");
    expect(email.text).toContain("Reset your password");
    expect(email.text).toContain(url);
  });
});
