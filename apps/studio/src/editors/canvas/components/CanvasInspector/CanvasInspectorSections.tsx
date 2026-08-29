import {
  Button,
  EditableName,
  ImageInput,
  InputGroupAddon,
  RotateCcwIcon,
  Section,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ImageInputValue,
} from "@mechane/design-system";
import {
  isPropertyConnection,
  type ImageAssetReference,
  type ImageValue,
  type ObjectFit,
  type ObjectPosition,
  type ResolvedImageValue,
  type VariableReference,
} from "@mechane/domain";
import { VariableInspector } from "../../../../components/VariableInspector";
import { canvasDisplayName, canvasElementDisplayName } from "../../data/canvas-names";
import { elementIconFor } from "../utils";

import { useCanvasInspectorContext } from "./CanvasInspectorContext";
import { ObjectPositionSelector } from "./ObjectPositionSelector";
import { variableInput, variableOptions } from "./canvas-inspector-values";

export const InspectorHeader = () => {
  const { focused, elements, update, onRenameArtboard } = useCanvasInspectorContext();
  const Icon = elementIconFor(elements.map((element) => element.type));
  const selectedElement = elements.length === 1 ? elements[0] : null;
  const selectedCanvas = elements.length === 0 ? focused : null;
  const editable = selectedElement ?? selectedCanvas;
  const label =
    elements.length > 1
      ? `${elements.length} Elements`
      : selectedElement
        ? canvasElementDisplayName(selectedElement)
        : focused
          ? canvasDisplayName(focused)
          : "Selection";

  const commitName = (name: string) => {
    const next = name.trim();
    if (selectedElement) {
      if (next !== (selectedElement.name ?? "")) update({ name: next });
    } else if (selectedCanvas && next && next !== selectedCanvas.name) {
      onRenameArtboard?.(selectedCanvas.artId, next);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {editable ? (
        <EditableName
          key={selectedElement?.id ?? selectedCanvas?.artId}
          value={editable.name ?? ""}
          placeholder={label}
          ariaLabel="Name"
          onCommit={commitName}
        >
          <InputGroupAddon align="inline-start" className="px-1 mr-0">
            <Icon className="size-4 shrink-0" />
          </InputGroupAddon>
        </EditableName>
      ) : (
        <>
          <span className="truncate grow">{label}</span>
          <Icon className="size-4 shrink-0" />
        </>
      )}
    </div>
  );
};
export const BlockVariablesSection = () => {
  const { focused, target, blocks, shapes, imageAssets, onImageUpload, blockVariableEditing } =
    useCanvasInspectorContext();
  if (!focused || focused.kind !== "block" || target.id !== focused.canvas.root.id) return null;
  const block = blocks.find((candidate) => candidate.id === focused.artId);
  if (!block || !blockVariableEditing) return null;
  const resolvedImageAssets: readonly (ResolvedImageValue &
    Pick<ImageAssetReference, "revision">)[] = imageAssets.map((asset) => ({
    assetId: asset.id,
    revision: asset.revision,
    url: asset.url,
    width: asset.width,
    height: asset.height,
    alt: asset.alt,
    mimeType: asset.mimeType,
    blurHash: asset.blurHash,
  }));
  return (
    <VariableInspector
      variables={block.variables}
      editing={blockVariableEditing}
      shapes={shapes}
      imageAssets={resolvedImageAssets}
      onImageUpload={onImageUpload}
    />
  );
};

const OBJECT_FIT_OPTIONS: readonly { value: ObjectFit; label: string }[] = [
  { value: "cover", label: "Fill" },
  { value: "contain", label: "Fit" },
  { value: "none", label: "Crop" },
  { value: "fill", label: "Stretch" },
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
const isImageVariable = (value: unknown): value is VariableReference<ImageValue> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  "id" in value &&
  "name" in value &&
  "fieldType" in value &&
  value.fieldType === "image";

export const ImageSection = () => {
  const {
    selected,
    update,
    common,
    variables,
    shapes,
    imageAssets,
    deviceQrImages,
    onImageUpload,
  } = useCanvasInspectorContext();
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
  const linkedImage = variableInput(common("image"), "image", variables, shapes);
  const linkedVariable = isImageVariable(linkedImage) ? linkedImage : null;
  const linkedQrAsset = linkedVariable ? deviceQrImages[linkedVariable.id] : undefined;
  const resetAsset = intrinsicAsset ?? linkedQrAsset;
  const imageInputValue: ImageInputValue | null = isImageVariable(linkedImage)
    ? linkedImage
    : intrinsicAsset
      ? { ...intrinsicAsset, assetId: intrinsicAsset.id }
      : null;
  const imageInputVariables = variableOptions("image", variables, shapes).filter(isImageVariable);
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
      update({
        image: { kind: "variable", variableId: next.id, fieldPath: next.fieldPath ?? [] },
      });
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
      <ImageInput
        className="col-span-2"
        value={imageInputValue}
        variables={imageInputVariables}
        imageAssets={imageInputAssets}
        onChange={handleImageChange}
        onDelete={() => update({}, ["image"])}
        onUpload={onImageUpload}
      />
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
          <SelectTrigger aria-label="Object fit" className="row-start-1 col-start-2">
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
          variant="outline"
          className="w-full col-start-2"
          disabled={!resetAsset}
          onClick={() => {
            if (!resetAsset || selected.length !== 1) return;
            const current = selected[0]!;
            update({
              sizing: {
                ...current.sizing,
                width: { mode: "fixed", value: resetAsset.width },
                height: { mode: "fixed", value: resetAsset.height },
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
    </Section>
  );
};
