import {
  assertValidGraphState,
  InvalidGraphStateError,
  type GraphState,
} from "@mechane/domain/graph";
import { assertValidImageName, InvalidImageNameError } from "@mechane/domain/images";
import { isRunErrorCategory, type RunErrorCategory } from "@mechane/domain/run-errors";
import { assertValidShowName, InvalidShowNameError } from "@mechane/domain/show";
import {
  assertValidThemeMode,
  assertValidThemePalette,
  InvalidThemeModeError,
  InvalidThemePaletteError,
} from "@mechane/domain/theme-settings";
import { GraphQLError } from "graphql";
import { ImageProcessingError } from "../images";

export function toShapeValue(value: unknown, type: unknown): unknown {
  if (typeof type === "string") return { kind: type, value };
  if (type && typeof type === "object" && "kind" in type) {
    if (type.kind === "array") return { kind: "array", value };
    if (type.kind === "shape") return { kind: "object", value };
  }
  return null;
}

export function validRunErrorCategory(value: string): RunErrorCategory {
  if (!isRunErrorCategory(value)) {
    throw new GraphQLError(`Unknown Run error category: "${value}".`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return value;
}

export function validShowName(name: string): string {
  try {
    return assertValidShowName(name);
  } catch (error) {
    if (error instanceof InvalidShowNameError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

export function validImageName(name: string): string {
  try {
    return assertValidImageName(name);
  } catch (error) {
    if (error instanceof InvalidImageNameError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

export function validThemeMode(value: string): string {
  try {
    return assertValidThemeMode(value);
  } catch (error) {
    if (error instanceof InvalidThemeModeError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

export function validThemePalette(value: string): string {
  try {
    return assertValidThemePalette(value);
  } catch (error) {
    if (error instanceof InvalidThemePaletteError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

export function validGraphState(value: string): GraphState {
  try {
    return assertValidGraphState(value);
  } catch (error) {
    if (error instanceof InvalidGraphStateError) {
      throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
    }
    throw error;
  }
}

export function imageUploadError(error: unknown): never {
  if (error instanceof ImageProcessingError) {
    throw new GraphQLError(error.message, { extensions: { code: error.code } });
  }
  throw error;
}
