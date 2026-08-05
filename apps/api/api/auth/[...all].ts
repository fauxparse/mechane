// Vercel serverless function entry point for every Better Auth route
// (sign-up, sign-in, Google OAuth callback, email verification, password
// reset, session, sign-out, ...) — Better Auth owns everything under
// /api/auth/*. `toNodeHandler` adapts Better Auth's Fetch-API handler to
// the Node request/response signature Vercel's Node.js functions use.
import { toNodeHandler } from "better-auth/node";

import { auth } from "../../src/auth";

export default toNodeHandler(auth);
