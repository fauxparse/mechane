// Vercel serverless function entry point. graphql-yoga's instance is
// directly usable as a Node request handler — see
// https://the-guild.dev/graphql/yoga-server for the pattern this follows.
import { yoga } from "../src/graphql/server";

export default yoga;
