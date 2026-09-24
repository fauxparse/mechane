/**
 * The package's one canonical object guard.
 *
 * Both decoders read documents whose shape is only known at runtime, so they
 * narrow to an object and then check the fields they actually use. Neither
 * defines its own guard: one of these per file is how two decoders of the
 * same wire drift apart.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
