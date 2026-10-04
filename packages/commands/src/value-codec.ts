import {
  assertValidValueEnvelope,
  canonicalValue,
  countValueLogicalRecords,
  expandPortableValue,
  portableText,
  validateValueInput,
  VALUE_MAX_BYTES,
  VALUE_MAX_LOGICAL_RECORDS,
  ValueTransferError,
  type TypedValueEnvelope,
  type ValidatedValue,
  type ValueHandoff,
} from "@mechane/domain/value-transfer";

function reject(code: string, message: string): never {
  throw new ValueTransferError({
    category: "rejected-input",
    stage: "decode",
    code,
    message,
    path: [],
    nextAction: "Correct or re-copy the JSON value, then paste again.",
  });
}

const utf8 = new TextEncoder();
export const VALUE_MEDIA_TYPES: Readonly<Record<string, true | undefined>> = {
  "text/plain": true,
  "application/vnd.mechane.source-value+json": true,
  "web application/vnd.mechane.source-value+json": true,
};
const JSON_NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const JSON_LITERALS = [
  ["true", true],
  ["false", false],
  ["null", null],
] as const;
function assertBytes(text: string): number {
  const bytes = utf8.encode(text).byteLength;
  if (bytes > VALUE_MAX_BYTES) reject("byte-limit", "The value exceeds 10 MiB of UTF-8 text.");
  return bytes;
}

type Frame =
  | {
      kind: "object";
      value: Record<string, unknown>;
      key: string;
      phase: "first-key" | "key" | "colon" | "value" | "comma";
    }
  | { kind: "array"; value: unknown[]; phase: "first-value" | "value" | "comma" };

/** Duplicate keys are rejected before ordinary object construction can erase them. */
export function parseValueJson(text: string): unknown {
  assertBytes(text);
  let offset = 0;
  let root: unknown;
  let hasRoot = false;
  const frames: Frame[] = [];
  const whitespace = () => {
    while (
      text[offset] === " " ||
      text[offset] === "\t" ||
      text[offset] === "\n" ||
      text[offset] === "\r"
    )
      offset += 1;
  };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      const character = text[offset++];
      if (character === "\\") {
        offset += 1;
        continue;
      }
      if (character === '"') {
        try {
          const value: unknown = JSON.parse(text.slice(start, offset));
          if (typeof value === "string") return value;
        } catch {
          reject("malformed-json", "Malformed JSON string.");
        }
        reject("malformed-json", "Malformed JSON string.");
      }
      if (character !== undefined && character.charCodeAt(0) < 32)
        reject("malformed-json", "Unescaped control character in a JSON string.");
    }
    reject("malformed-json", "Unterminated JSON string.");
  };
  const attach = (value: unknown) => {
    const frame = frames.at(-1);
    if (!frame) {
      if (hasRoot) reject("malformed-json", "JSON contains more than one root value.");
      root = value;
      hasRoot = true;
    } else if (frame.kind === "array") {
      frame.value.push(value);
      frame.phase = "comma";
    } else {
      frame.value[frame.key] = value;
      frame.phase = "comma";
    }
  };
  const value = () => {
    whitespace();
    const character = text[offset];
    if (character === "{" || character === "[") {
      offset += 1;
      if (character === "{") {
        const object: Record<string, unknown> = Object.create(null);
        attach(object);
        frames.push({ kind: "object", value: object, key: "", phase: "first-key" });
      } else {
        const array: unknown[] = [];
        attach(array);
        frames.push({ kind: "array", value: array, phase: "first-value" });
      }
      return;
    }
    if (character === '"') {
      attach(string());
      return;
    }
    for (const [literal, scalar] of JSON_LITERALS) {
      if (text.startsWith(literal, offset)) {
        offset += literal.length;
        attach(scalar);
        return;
      }
    }
    JSON_NUMBER.lastIndex = offset;
    const match = JSON_NUMBER.exec(text);
    if (!match) reject("malformed-json", `Expected a JSON value at character ${offset}.`);
    offset += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) reject("non-finite-number", "JSON numbers must be finite.");
    attach(number);
  };

  value();
  while (frames.length > 0) {
    whitespace();
    const frame = frames[frames.length - 1]!;
    const character = text[offset];
    if (frame.kind === "object") {
      switch (frame.phase) {
        case "first-key":
          if (character === "}") {
            offset += 1;
            frames.pop();
            break;
          }
          frame.phase = "key";
          continue;
        case "key":
          if (character !== '"') reject("malformed-json", "Expected a JSON object member name.");
          frame.key = string();
          if (Object.hasOwn(frame.value, frame.key))
            reject("duplicate-key", `Duplicate JSON member ${JSON.stringify(frame.key)}.`);
          frame.phase = "colon";
          break;
        case "colon":
          if (character !== ":")
            reject("malformed-json", "Expected a colon after a JSON member name.");
          offset += 1;
          frame.phase = "value";
          break;
        case "value":
          value();
          break;
        case "comma":
          if (character === "}") {
            offset += 1;
            frames.pop();
          } else if (character === ",") {
            offset += 1;
            frame.phase = "key";
          } else reject("malformed-json", "Expected a comma or closing object brace.");
          break;
      }
    } else {
      switch (frame.phase) {
        case "first-value":
          if (character === "]") {
            offset += 1;
            frames.pop();
            break;
          }
          frame.phase = "value";
          continue;
        case "value":
          value();
          break;
        case "comma":
          if (character === "]") {
            offset += 1;
            frames.pop();
          } else if (character === ",") {
            offset += 1;
            frame.phase = "value";
          } else reject("malformed-json", "Expected a comma or closing array bracket.");
          break;
      }
    }
  }
  whitespace();
  if (!hasRoot || offset !== text.length)
    reject("malformed-json", "Unexpected content after the JSON value.");
  return root;
}

export function countLogicalRecords(value: ValidatedValue): number {
  const records = countValueLogicalRecords(value);
  if (records > VALUE_MAX_LOGICAL_RECORDS)
    reject("record-limit", "The value exceeds 100,000 logical records.");
  return records;
}

function comparable(value: ValidatedValue): string {
  if (value.kind === "plain") return canonicalValue(value.value);
  const envelope = value.envelope;
  return canonicalValue({
    ...envelope,
    records: [...envelope.records].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  });
}

/** Only representations actually exposed by this chosen handoff are compared. */
export function decodeValueHandoff(handoff: ValueHandoff): ValidatedValue {
  if (handoff.length === 0) reject("missing-text", "The clipboard contains no JSON value.");
  if (!handoff.some((representation) => representation.mediaType === "text/plain"))
    reject("missing-text", "Portable text/plain is required.");
  let selected: ValidatedValue | null = null;
  let comparison: string | null = null;
  for (const representation of handoff) {
    if (VALUE_MEDIA_TYPES[representation.mediaType] !== true)
      reject(
        "unsupported-representation",
        "This handoff exposes an unsupported value representation.",
      );
    const decoded = validateValueInput(parseValueJson(representation.text));
    countLogicalRecords(decoded);
    const current = comparable(decoded);
    if (selected !== null && (selected.kind !== decoded.kind || comparison !== current)) {
      reject(
        "conflicting-representations",
        "The representations exposed by this clipboard handoff disagree.",
      );
    }
    selected = decoded;
    comparison = current;
  }
  if (!selected) reject("missing-text", "The clipboard contains no JSON value.");
  return selected;
}

export function encodeValue(
  envelope: TypedValueEnvelope,
  mode: "typed" | "plain",
): { text: string; bytes: number; records: number } {
  const validated = assertValidValueEnvelope(envelope);
  const value = validateValueInput(mode === "typed" ? validated : expandPortableValue(validated));
  const records = countLogicalRecords(value);
  const text = portableText(value.kind === "typed" ? value.envelope : value.value);
  return { text, bytes: assertBytes(text), records };
}
