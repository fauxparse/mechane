// PROTOTYPE — issue #604. Throwaway; see ./PrototypeSwitcher.tsx for the plan.
//
// "Updated 3 days ago" reads better on a dashboard than a date, and all three
// variants lean on it, so it is one function rather than three.

const DIVISIONS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.34524],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

const FORMAT = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(iso: string): string {
  let value = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [unit, span] of DIVISIONS) {
    if (Math.abs(value) < span) return FORMAT.format(Math.round(value), unit);
    value /= span;
  }
  return new Date(iso).toLocaleDateString();
}

/**
 * How long a Run has been up, as a duration rather than a point in time.
 * "23m" beats "23 minutes ago" on a live badge, where the number is the point
 * and the words are noise.
 */
export function elapsedSince(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
