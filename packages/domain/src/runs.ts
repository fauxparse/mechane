import type { RunId, ShowId } from "./id";
import type { SourceValues, StructuredValues } from "./structured-values";

export const RUN_STATUSES = ["active", "ended"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export interface Run {
  id: RunId;
  showId: ShowId;
  status: RunStatus;
  startedAt: Date;
  endedAt: Date | null;
  sourceValues: SourceValues;
  structuredValues: StructuredValues;
}

export function isRunStatus(value: string): value is RunStatus {
  return RUN_STATUSES.includes(value as RunStatus);
}
