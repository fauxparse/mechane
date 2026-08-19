export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
] as const;

export const ACCEPTED_IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");
export const ACCEPTED_IMAGE_TYPE_SET = new Set<string>(ACCEPTED_IMAGE_TYPES);
export const ACCEPTED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".avif",
  ".heic",
  ".heif",
  ".svg",
]);

export const isAcceptedImageFile = (file: File): boolean => {
  if (ACCEPTED_IMAGE_TYPE_SET.has(file.type)) return true;
  const extensionStart = file.name.lastIndexOf(".");
  if (extensionStart === -1) return false;
  return ACCEPTED_IMAGE_EXTENSIONS.has(file.name.slice(extensionStart).toLowerCase());
};
