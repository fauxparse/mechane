import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ImageInputOnUploadProps } from "./ImageInput";
import type { ResolvedImageValue } from "@mechane/domain";
import { useCallback, useState } from "react";
import { ImageInput } from "./ImageInput";

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

type Story = StoryObj<typeof ImageInput>;

const Harness = (args: Story["args"]) => {
  const [value, setValue] = useState<ResolvedImageValue | null>(null);

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

  return <ImageInput value={value} onChange={setValue} onUpload={onUpload} {...args} />;
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
