import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ImageValue, ResolvedImageValue, VariableReference } from "@mechane/domain";
import { useCallback, useState } from "react";

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

const imageVariable = {
  id: "hero-image",
  name: "Hero image",
  type: "image",
  current: {
    kind: "image",
    value: { assetId: "123", revision: "1" },
  },
} satisfies VariableReference<ImageValue>;
type Story = StoryObj<typeof ImageInput>;

const Harness = (args: NonNullable<Story["args"]>) => {
  const [value, setValue] = useState<ImageInputValue | null>(args.value ?? null);
  const onUpload = useCallback(({ file, onProgress, onSuccess }: ImageInputOnUploadProps) => {
    let totalProgress = 0;

    const step = () => {
      totalProgress = Math.min(totalProgress + 15, 100);
      onProgress(totalProgress);
      if (totalProgress < 100) {
        window.setTimeout(step, 250);
      } else {
        onSuccess({
          assetId: "123",
          url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 425'%3E%3Crect width='640' height='425' fill='%23252525'/%3E%3C/svg%3E",
          width: 640,
          height: 425,
          alt: file.name,
          mimeType: file.type,
          blurHash: null,
        });
      }
    };

    window.setTimeout(step, 250);
  }, []);

  return <ImageInput {...args} value={value} onChange={setValue} onUpload={onUpload} />;
};

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    value: {
      assetId: "123",
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 425'%3E%3Crect width='640' height='425' fill='%23252525'/%3E%3C/svg%3E",
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
    variables: [imageVariable],
    imageAssets: [
      {
        assetId: "123",
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 425'%3E%3Crect width='640' height='425' fill='%23252525'/%3E%3C/svg%3E",
        width: 640,
        height: 425,
        alt: "Variable image",
        mimeType: "image/svg+xml",
        blurHash: null,
      },
    ],
  },
};
