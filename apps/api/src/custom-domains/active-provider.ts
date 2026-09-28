// The domains provider this API process uses, chosen once at startup from
// `CUSTOM_DOMAINS_PROVIDER`. Importing this module is what makes a
// production API with the wrong provider refuse to start.
import { localCustomDomainsProvider } from "./local-provider";
import { customDomainsProviderName, type CustomDomainsProvider } from "./provider";

function createCustomDomainsProvider(): CustomDomainsProvider {
  const name = customDomainsProviderName(process.env);
  if (name === "local") return localCustomDomainsProvider;
  throw new Error("The Vercel domains provider is not part of this build.");
}

export const customDomainsProvider = createCustomDomainsProvider();
