import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageInput, ImageInputOnUploadProps } from "./ImageInput";
import { ResolvedImageValue } from "@mechane/domain";
import { useCallback, useState } from "react";

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
      totalProgress = Math.min(totalProgress + Math.random() * 10 + 5, 100);
      onProgress(totalProgress);
      if (totalProgress < 100) {
        window.setTimeout(step, 250);
      } else {
        onSuccess({
          assetId: "123",
          url: URL.createObjectURL(file),
          width: 640,
          height: 425,
          alt: "Image",
          mimeType: file.type,
          blurHash: null,
        });
      }
    };

    setTimeout(step, 250);
  }, []);

  return <ImageInput value={value} onChange={setValue} onUpload={onUpload} {...args} />;
};

export const Default: Story = {};

export const WithValue: Story = {
  args: {
    value: {
      assetId: "123",
      url: "https://picsum.photos/id/56/640/480",
      width: 640,
      height: 425,
      alt: "Image",
      mimeType: "image/jpeg",
      blurHash: null,
    } satisfies ResolvedImageValue,
  },
};
