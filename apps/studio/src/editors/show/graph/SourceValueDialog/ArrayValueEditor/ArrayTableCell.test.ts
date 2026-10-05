import { ImageInput, type ImageInputValue } from "@mechane/design-system";
import { generateId } from "@mechane/domain/id";
import type { ResolvedImageValue } from "@mechane/domain/shapes";
import { isValidElement, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { ArrayTableCell } from "./ArrayTableCell";
import type { ShapeRecord } from "./types";

const uploadedImage = {
  assetId: "asset-new",
  revision: "revision-new",
  url: "/new.png",
  width: 32,
  height: 32,
  name: "new.png",
  alt: "New image",
  mimeType: "image/png",
  blurHash: null,
} satisfies ResolvedImageValue & { revision: string };

function changeImage(
  next: ImageInputValue | null,
  imageAssets: ComponentProps<typeof ArrayTableCell>["imageAssets"] = [],
) {
  const record: ShapeRecord = {
    kind: "shape",
    id: generateId("structuredValue"),
    fields: { photo: null, name: "Alice" },
  };
  const changeRecord = vi.fn();
  if (!("type" in ArrayTableCell) || typeof ArrayTableCell.type !== "function") {
    throw new Error("Expected a memoized cell");
  }
  const cell: unknown = ArrayTableCell.type({
    field: { id: "photo", name: "Photo", type: "image", required: false, defaultValue: null },
    record,
    value: record.fields.photo,
    readOnly: false,
    canUploadImage: true,
    imageAssets,
    callbacks: {
      changeRecord,
      reportValidity: vi.fn(),
      keyDownInCell: vi.fn(),
      deleteRecord: vi.fn(),
      uploadImage: vi.fn(),
    },
  } satisfies ComponentProps<typeof ArrayTableCell>);
  if (!isValidElement<{ children: unknown }>(cell)) throw new Error("Expected an editable cell");
  const input = cell.props.children;
  if (!isValidElement<ComponentProps<typeof ImageInput>>(input) || input.type !== ImageInput) {
    throw new Error("Expected an image input");
  }
  input.props.onChange(next);
  return { record, changeRecord };
}

describe("table image field changes", () => {
  it("saves a completed upload before the asset list refreshes", () => {
    const { record, changeRecord } = changeImage(uploadedImage);
    expect(changeRecord).toHaveBeenCalledWith({
      ...record,
      fields: { ...record.fields, photo: { assetId: "asset-new", revision: "revision-new" } },
    });
  });

  it("uses the uploaded revision rather than a stale asset-list revision", () => {
    const { record, changeRecord } = changeImage(uploadedImage, [
      { ...uploadedImage, revision: "revision-old" },
    ]);
    expect(changeRecord).toHaveBeenCalledWith({
      ...record,
      fields: { ...record.fields, photo: { assetId: "asset-new", revision: "revision-new" } },
    });
  });

  it("resolves existing images without an embedded revision from the asset list", () => {
    const { revision: _, ...resolvedImage } = uploadedImage;
    const { record, changeRecord } = changeImage(resolvedImage, [uploadedImage]);
    expect(changeRecord).toHaveBeenCalledWith({
      ...record,
      fields: { ...record.fields, photo: { assetId: "asset-new", revision: "revision-new" } },
    });
  });
});
