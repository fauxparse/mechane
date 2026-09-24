import type { ShowGraph } from "@mechane/domain/graph";
import { decodeShowGraphDocument } from "@mechane/graphql-schema";
import { useEffect, useState } from "react";

/**
 * The decoded graph an editor opens with, captured once (#742, #750).
 *
 * This is the seam where the transport stops. A Show graph query result is
 * decoded here and nowhere downstream, so the editor, its command stack and
 * every inspector work in domain terms.
 *
 * Captured once on purpose. The command stack treats a *different* graph as a
 * different document — state replaced, history dropped (ADR-0005) — and the
 * query cache is rewritten constantly: every local edit patches it, and every
 * save writes back a new version. Holding the opened graph means none of that
 * churn reaches the editor, and the stack resets only when this latch hands
 * over a genuinely new document.
 */
export function useOpenedShowGraph(document: unknown): ShowGraph | null {
  const [opened, setOpened] = useState<ShowGraph | null>(null);
  useEffect(() => {
    if (document && !opened) setOpened(decodeShowGraphDocument(document).graph);
  }, [document, opened]);
  return opened;
}
