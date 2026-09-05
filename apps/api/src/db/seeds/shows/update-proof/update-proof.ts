import { seedShow as navigationProof } from "../navigation-proof/navigation-proof";

/** Update Proof keeps a separate seed identity while reusing the stable device harness. */
export const seedShow = {
  name: "Update Proof",
  seed: navigationProof.seed,
};
