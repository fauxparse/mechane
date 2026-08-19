import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ImageValue, ResolvedImageValue, VariableReference } from "@mechane/domain";
import { useCallback, useEffect, useRef, useState } from "react";

import { ImageInput, type ImageInputOnUploadProps, type ImageInputValue } from "./ImageInput";

const meta: Meta<typeof ImageInput> = {
  title: "design-system/ImageInput",
  component: ImageInput,
  parameters: {
    layout: "centered",
  },
  args: {
    onDelete: () => console.log("delete"),
  },
  render: (args) => <Harness className="w-sm" {...args} />,
};

export default meta;
const imagePreviewUrl = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 425'><rect width='640' height='425' fill='#252525'/><circle cx='200' cy='200' r='120' fill='#f59e0b'/></svg>",
)}`;
const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The selected file could not be read."));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });

const loadImageDimensions = (url: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("The selected file could not be decoded as an image."));
    image.src = url;
  });

const imageVariable = {
  id: "hero-image",
  name: "Hero image",
  type: "image",
  current: {
    kind: "image",
    value: { assetId: "123", revision: "1" },
  },
} satisfies VariableReference<ImageValue>;

const secondaryImageVariable = {
  id: "background-image",
  name: "Background image",
  type: "image",
  current: {
    kind: "image",
    value: { assetId: "456", revision: "1" },
  },
} satisfies VariableReference<ImageValue>;
type Story = StoryObj<typeof ImageInput>;

const Harness = (args: NonNullable<Story["args"]>) => {
  const [value, setValue] = useState<ImageInputValue | null>(args.value ?? null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const onUpload = useCallback(
    async ({ file, onProgress, onSuccess, onError }: ImageInputOnUploadProps) => {
      try {
        const url = await fileToDataUrl(file);
        const { width, height } = await loadImageDimensions(url);
        let totalProgress = 0;

        const step = () => {
          totalProgress = Math.min(totalProgress + 15, 100);
          onProgress(totalProgress);
          if (totalProgress < 100) {
            timerRef.current = window.setTimeout(step, 250);
          } else {
            timerRef.current = null;
            onSuccess({
              assetId: "123",
              url,
              width,
              height,
              alt: file.name,
              mimeType: file.type,
              blurHash: null,
            });
          }
        };

        timerRef.current = window.setTimeout(step, 250);
      } catch (cause) {
        onError({
          code: "INVALID_IMAGE",
          message: "The selected file could not be decoded as an image.",
          cause,
        });
      }
    },
    [],
  );

  return <ImageInput {...args} value={value} onChange={setValue} onUpload={onUpload} />;
};

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    value: {
      assetId: "123",
      url: imagePreviewUrl,
      width: 640,
      height: 425,
      alt: "Image",
      mimeType: "image/svg+xml",
      blurHash: null,
    } satisfies ResolvedImageValue,
  },
};

export const ConnectedVariable: Story = {
  args: {
    value: imageVariable,
    variables: [imageVariable, secondaryImageVariable],
    imageAssets: [
      {
        assetId: "123",
        url: imagePreviewUrl,
        width: 640,
        height: 425,
        alt: "Variable image",
        mimeType: "image/svg+xml",
        blurHash: null,
      },
      {
        assetId: "456",
        url: imagePreviewUrl,
        width: 640,
        height: 425,
        alt: "Background image",
        mimeType: "image/svg+xml",
        blurHash: null,
      },
    ],
  },
};

export const HiddenConnector: Story = {
  args: {
    value: imageVariable,
    variables: [imageVariable],
    allowLink: false,
  },
};
