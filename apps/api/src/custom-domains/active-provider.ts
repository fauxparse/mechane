// The domains provider this API process uses, chosen once at startup from
// `CUSTOM_DOMAINS_PROVIDER`. Importing this module is what makes a
// production API with the wrong provider, or without Vercel credentials,
// refuse to start.
import { localCustomDomainsProvider } from "./local-provider";
import { customDomainsProviderName, type CustomDomainsProvider } from "./provider";
import { createVercelCustomDomainsProvider, vercelProviderConfig } from "./vercel-provider";

export const customDomainsProvider: CustomDomainsProvider =
  customDomainsProviderName(process.env) === "vercel"
    ? createVercelCustomDomainsProvider(vercelProviderConfig(process.env))
    : localCustomDomainsProvider;
