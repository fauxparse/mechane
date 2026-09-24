import { afterEach, describe, expect, it, vi } from "vitest";

import { sendEmail } from "./email";

const message = {
  to: "person@example.com",
  subject: "Verify your Mechanē email",
  text: "Verify your email: https://example.com/verify",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("logs locally when no transport is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SMTP_URL", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await sendEmail(message);

    expect(log).toHaveBeenCalledWith(
      `[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`,
    );
  });

  it("rejects production delivery without a Resend API key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "Mechanē <noreply@example.com>");

    await expect(sendEmail(message)).rejects.toThrow("RESEND_API_KEY is required in production.");
  });

  it("sends production mail through Resend", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Mechanē <noreply@example.com>");
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(message);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re_test_key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Mechanē <noreply@example.com>",
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      }),
    );
  });
});
