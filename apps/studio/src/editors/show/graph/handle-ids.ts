export type HandleId =
  | { kind: "input" }
  | { kind: "output" }
  | { kind: "variable"; id: string }
  | { kind: "field"; id: string }
  | { kind: "cue"; id: string }
  | { kind: "deviceSource"; name: string };

const INPUT_HANDLE = "in";
const OUTPUT_HANDLE = "out";

function encoded(kind: string, value: string): string {
  return `${kind}:${encodeURIComponent(value)}`;
}

/** Encodes a typed graph handle for React Flow. */
export function handleFor(handle: HandleId): string {
  switch (handle.kind) {
    case "input":
      return INPUT_HANDLE;
    case "output":
      return OUTPUT_HANDLE;
    case "variable":
      return encoded("variable", handle.id);
    case "field":
      return encoded("field", handle.id);
    case "cue":
      return encoded("cue", handle.id);
    case "deviceSource":
      return encoded("device", handle.name);
  }
}

function decoded(id: string, kind: string): string | null {
  const prefix = `${kind}:`;
  if (!id.startsWith(prefix)) return null;
  const value = id.slice(prefix.length);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Decodes a React Flow handle id into its typed graph meaning. */
export function readHandle(id: string): HandleId | null {
  if (id === INPUT_HANDLE) return { kind: "input" };
  if (id === OUTPUT_HANDLE) return { kind: "output" };

  const variable = decoded(id, "variable");
  if (variable !== null) return { kind: "variable", id: variable };
  const cue = decoded(id, "cue");
  if (cue !== null) return { kind: "cue", id: cue };
  const field = decoded(id, "field");
  if (field !== null) return { kind: "field", id: field };
  const deviceSource = decoded(id, "device");
  if (deviceSource !== null) return { kind: "deviceSource", name: deviceSource };
  return null;
}
