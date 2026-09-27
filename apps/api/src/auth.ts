// Better Auth configuration: email/password + Google OAuth, with the
// standard default email-verification and password-reset flows (PRD.md §10 —
// "assumed default-configuration; no custom requirements were specified").
//
// Single-user ownership model, no orgs/teams (PRD.md §1, §9): Better Auth's
// own tables (user/session/account/verification) are all this app needs —
// no organization plugin is enabled. System-wide roles come from the admin
// plugin; ./access-control.ts defines the roles and what each may do.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";

import { ac, ADMIN_ROLES, DEFAULT_ROLE, roles } from "./access-control";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { buildStudioResetUrl } from "./lib/auth-links";
import { renderActionEmail } from "./lib/action-email";
import { sendEmail } from "./lib/email";
import { ALLOWED_ORIGINS } from "./lib/cors";

const studioOrigin = process.env.APP_STUDIO_URL ?? "http://localhost:5173";

// Production uses Resend; local development sends to Mailpit by default.
// Mailpit requires no credentials.
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION !== "false";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // apps/studio (a different origin — see lib/cors.ts) is the only
  // client allowed to complete auth flows, e.g. the Google OAuth redirect
  // back from Google.
  trustedOrigins: ALLOWED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification,
    sendResetPassword: async ({ user, url }) => {
      const studioResetUrl = buildStudioResetUrl(url, studioOrigin);
      const email = await renderActionEmail({
        preview: "Reset your Mechanē password",
        heading: "Reset your password",
        message: "We received a request to reset the password for your Mechanē account.",
        actionLabel: "Reset password",
        actionUrl: studioResetUrl,
        expiryNote:
          "This link expires in 1 hour. If you did not request a password reset, you can ignore this email.",
      });
      await sendEmail({
        to: user.email,
        subject: "Reset your Mechanē password",
        ...email,
      });
    },
  },
  emailVerification: {
    sendOnSignIn: requireEmailVerification,
    sendOnSignUp: requireEmailVerification,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const email = await renderActionEmail({
        preview: "Verify your Mechanē email address",
        heading: "Verify your email",
        message: "Confirm your email address to finish setting up your Mechanē account.",
        actionLabel: "Verify email",
        actionUrl: url,
        expiryNote:
          "This link expires in 1 hour. If you did not create a Mechanē account, you can ignore this email.",
      });
      await sendEmail({
        to: user.email,
        subject: "Verify your Mechanē email",
        ...email,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  plugins: [admin({ ac, roles, defaultRole: DEFAULT_ROLE, adminRoles: ADMIN_ROLES })],
});

export type Auth = typeof auth;
