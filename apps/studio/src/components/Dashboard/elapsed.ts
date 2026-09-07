// Time as the dashboard says it (issue #604).
//
// Two different jobs, deliberately not one function: "when did this last
// change" wants a point in the past relative to now, and "how long has this
// Run been up" wants a duration. The second one sits on a live badge next to a
// three-letter word, so it is a number and a unit and nothing else.

const DIVISIONS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.34524],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "3 minutes ago", falling back to a date once "last year" stops helping. */
export function relativeTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  let value = (parsed - Date.now()) / 1000;
  for (const [unit, span] of DIVISIONS) {
    if (Math.abs(value) < span) return RELATIVE.format(Math.round(value), unit);
    value /= span;
  }
  return new Date(parsed).toLocaleDateString();
}

/**
 * How long a Run has been up: "45s", "12m", "2h 05m".
 *
 * Clamped at zero because a Run's `startedAt` comes from the server, and a
 * client clock a few seconds behind it should read "0s" rather than count
 * upwards from a negative.
 */
export function elapsedSince(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
