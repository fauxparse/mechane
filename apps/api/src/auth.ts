// Better Auth configuration: email/password + Google OAuth, with the
// standard default email-verification and password-reset flows (PRD.md §10 —
// "assumed default-configuration; no custom requirements were specified").
//
// Single-user ownership model, no orgs/teams (PRD.md §1, §9): Better Auth's
// own tables (user/session/account/verification) are all this app needs —
// no organization plugin is enabled.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "./db/client";
import * as schema from "./db/schema";
import { sendEmail } from "./lib/email";
import { ALLOWED_ORIGINS } from "./lib/cors";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // apps/app-studio (a different origin — see lib/cors.ts) is the only
  // client allowed to complete auth flows, e.g. the Google OAuth redirect
  // back from Google.
  trustedOrigins: ALLOWED_ORIGINS,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Presence password",
        text: `Reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Verify your Presence email",
        text: `Verify your email: ${url}`,
      });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
});

export type Auth = typeof auth;
