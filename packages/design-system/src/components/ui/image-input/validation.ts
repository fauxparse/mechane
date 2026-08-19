import { DEFAULT_IMAGE_UPLOAD_POLICY } from "@mechane/domain";

import { isAcceptedImageFile } from "./utils";
import type { ImageInputDimensions, ImageInputError, ImageInputValidation } from "./types";

const imageDimensions = async (file: File): Promise<ImageInputDimensions> => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected file could not be read."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () =>
      reject(new Error("The selected file could not be decoded as an image."));
    element.src = dataUrl;
  });
  return { width: image.naturalWidth, height: image.naturalHeight };
};

const error = (
  code: ImageInputError["code"],
  message: string,
  cause?: unknown,
): ImageInputError => ({
  code,
  message,
  ...(cause === undefined ? {} : { cause }),
});

export const validateImageFile = async (
  file: File,
  validation: ImageInputValidation = {},
): Promise<ImageInputDimensions> => {
  if (!isAcceptedImageFile(file)) {
    throw error("FILE_TYPE_UNSUPPORTED", "Choose a supported image file.");
  }

  const maxSourceBytes = validation.maxSourceBytes ?? DEFAULT_IMAGE_UPLOAD_POLICY.maxSourceBytes;
  if (file.size > maxSourceBytes) {
    throw error(
      "SOURCE_TOO_LARGE",
      `Image files must be smaller than ${Math.round(maxSourceBytes / 1024 / 1024)} MB.`,
    );
  }

  let dimensions: ImageInputDimensions;
  try {
    dimensions = await imageDimensions(file);
  } catch (cause) {
    throw error("INVALID_IMAGE", "The selected file could not be decoded as an image.", cause);
  }

  const { width, height } = dimensions;
  const pixels = width * height;
  const maxPixels = validation.maxPixels ?? DEFAULT_IMAGE_UPLOAD_POLICY.maxPixels;
  if (pixels > maxPixels) {
    throw error("PIXEL_LIMIT_EXCEEDED", "The selected image has too many pixels.");
  }

  const maxWidth = validation.maxWidth ?? DEFAULT_IMAGE_UPLOAD_POLICY.maxAxis;
  const maxHeight = validation.maxHeight ?? DEFAULT_IMAGE_UPLOAD_POLICY.maxAxis;
  if (width > maxWidth || height > maxHeight) {
    throw error("DIMENSION_LIMIT_EXCEEDED", "The selected image exceeds the maximum dimensions.");
  }

  if (validation.minWidth !== undefined && width < validation.minWidth) {
    throw error(
      "DIMENSION_LIMIT_EXCEEDED",
      "The selected image is narrower than the minimum width.",
    );
  }
  if (validation.minHeight !== undefined && height < validation.minHeight) {
    throw error(
      "DIMENSION_LIMIT_EXCEEDED",
      "The selected image is shorter than the minimum height.",
    );
  }

  return dimensions;
};
