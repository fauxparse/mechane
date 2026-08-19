import type { ImageValue, ObjectFit, ObjectPosition, VariableReference } from "@mechane/domain";
import { isPropertyConnection } from "@mechane/domain";
import {
  Button,
  ImageInput,
  type ImageInputValue,
  RotateCcwIcon,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mechane/design-system";

import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import { elementIconFor } from "../utils";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { ObjectPositionSelector } from "./ObjectPositionSelector";
import { variableInput } from "./canvas-inspector-values";
import { Section, SectionRow } from "./Section";

export const InspectorHeader = () => {
  const { focused, elements } = useCanvasInspectorContext();
  const Icon = elementIconFor(elements.map((element) => element.type));
  const label =
    elements.length > 1
      ? `${elements.length} Elements`
      : elements[0]
        ? canvasElementDisplayName(elements[0])
        : focused
          ? canvasDisplayName(focused)
          : "Selection";

  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4" />
      <span className="truncate grow">{label}</span>
    </div>
  );
};

const OBJECT_FIT_OPTIONS: readonly { value: ObjectFit; label: string }[] = [
  { value: "cover", label: "Fill" },
  { value: "contain", label: "Fit" },
  { value: "none", label: "Crop" },
];

const OBJECT_POSITION_OPTIONS: readonly {
  value: Exclude<ObjectPosition, "center">;
  label: string;
}[] = [
  { value: "left top", label: "Top left" },
  { value: "center top", label: "Top center" },
  { value: "right top", label: "Top right" },
  { value: "left center", label: "Center left" },
  { value: "center center", label: "Center" },
  { value: "right center", label: "Center right" },
  { value: "left bottom", label: "Bottom left" },
  { value: "center bottom", label: "Bottom center" },
  { value: "right bottom", label: "Bottom right" },
];

const positionValue = (value: unknown): Exclude<ObjectPosition, "center"> => {
  if (value === "center") return "center center";
  return OBJECT_POSITION_OPTIONS.find((option) => option.value === value)?.value ?? "center center";
};
const imageReferenceFor = (value: unknown): { assetId: string; revision: string } | null => {
  if (
    !value ||
    typeof value !== "object" ||
    isPropertyConnection(value) ||
    !("assetId" in value) ||
    !("revision" in value) ||
    typeof value.assetId !== "string" ||
    typeof value.revision !== "string"
  ) {
    return null;
  }
  return { assetId: value.assetId, revision: value.revision };
};
const isImageVariable = (value: ImageInputValue | null): value is VariableReference<ImageValue> =>
  value !== null && typeof value === "object" && "id" in value && "name" in value;

export const ImageSection = () => {
  const { selected, update, common, variables, imageAssets, onImageUpload } =
    useCanvasInspectorContext();
  const allImages = selected.length > 0 && selected.every((element) => element.type === "image");
  if (!allImages) return null;

  const rawObjectFit = common("objectFit");
  const objectFitMixed =
    rawObjectFit === undefined &&
    selected.some((element) => Reflect.get(element, "objectFit") !== undefined);
  const objectFitValue = objectFitMixed
    ? null
    : (OBJECT_FIT_OPTIONS.find((option) => option.value === rawObjectFit)?.value ?? "cover");
  const rawObjectPosition = common("objectPosition");
  const objectPositionMixed =
    rawObjectPosition === undefined &&
    selected.some((element) => Reflect.get(element, "objectPosition") !== undefined);
  const objectPositionValue = objectPositionMixed ? undefined : positionValue(rawObjectPosition);
  const sharedImage = selected.length === 1 ? imageReferenceFor(common("image")) : null;
  const intrinsicAsset = sharedImage
    ? imageAssets.find(
        (asset) => asset.id === sharedImage.assetId && asset.revision === sharedImage.revision,
      )
    : undefined;
  const linkedImage = variableInput(common("image"), "image", variables);
  const imageInputValue: ImageInputValue | null = isImageVariable(
    linkedImage as ImageInputValue | null,
  )
    ? (linkedImage as ImageInputValue)
    : intrinsicAsset
      ? { ...intrinsicAsset, assetId: intrinsicAsset.id }
      : null;
  const imageInputVariables = variables.filter((variable) => variable.type === "image");
  const imageInputAssets = imageAssets.map((asset) => ({
    assetId: asset.id,
    url: asset.url,
    width: asset.width,
    height: asset.height,
    alt: asset.alt,
    mimeType: asset.mimeType,
    blurHash: asset.blurHash,
  }));

  const handleImageChange = (next: ImageInputValue | null) => {
    if (isImageVariable(next)) {
      update({ image: { kind: "variable", variableId: next.id } });
      return;
    }
    if (next === null) {
      update({}, ["image"]);
      return;
    }
    const revision =
      "revision" in next && typeof next.revision === "string"
        ? next.revision
        : imageAssets.find((asset) => asset.id === next.assetId)?.revision;
    if (revision) update({ image: { assetId: next.assetId, revision } });
  };

  return (
    <Section label="Image">
      <SectionRow>
        <ObjectPositionSelector
          className="col-start-1 row-start-1 row-span-2"
          value={objectPositionValue}
          onChange={(value) => update({ objectPosition: value })}
        />
        <Select
          items={OBJECT_FIT_OPTIONS}
          value={objectFitValue}
          onValueChange={(value) => {
            if (value) update({ objectFit: value as ObjectFit });
          }}
        >
          <SelectTrigger
            aria-label="Object fit"
            className="w-full rounded-sm border-0 bg-muted/50 px-2 row-start-1 col-start-2"
            size="sm"
          >
            <SelectValue
              placeholder={
                objectFitMixed
                  ? "Mixed"
                  : OBJECT_FIT_OPTIONS.find((option) => option.value === objectFitValue)?.label
              }
            />
          </SelectTrigger>
          <SelectContent>
            {OBJECT_FIT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="w-full col-start-2"
          disabled={!intrinsicAsset}
          onClick={() => {
            if (!intrinsicAsset || selected.length !== 1) return;
            const current = selected[0]!;
            update({
              sizing: {
                ...current.sizing,
                width: { mode: "fixed", value: intrinsicAsset.width },
                height: { mode: "fixed", value: intrinsicAsset.height },
              },
              objectFit: "cover",
              objectPosition: "center center",
            });
          }}
        >
          <RotateCcwIcon />
          Reset size
        </Button>
      </SectionRow>
      <SectionRow>
        <ImageInput
          className="col-span-3"
          value={imageInputValue}
          variables={imageInputVariables}
          imageAssets={imageInputAssets}
          onChange={handleImageChange}
          onDelete={() => update({}, ["image"])}
          onUpload={onImageUpload}
        />
      </SectionRow>
    </Section>
  );
};
