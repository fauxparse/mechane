import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { ImageCropper, type ImageCropperProps } from "./ImageCropper";

const source =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23252525'/%3E%3Ccircle cx='280' cy='300' r='180' fill='%23f59e0b'/%3E%3Crect x='560' y='180' width='440' height='260' rx='24' fill='%233b82f6'/%3E%3C/svg%3E";

const meta: Meta<typeof ImageCropper> = {
  title: "design-system/ImageInput/ImageCropper",
  component: ImageCropper,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    source,
    aspectRatio: 16 / 9,
  },
  render: (args) => <Harness {...args} />,
};

export default meta;
type Story = StoryObj<typeof ImageCropper>;

const Harness = (args: ImageCropperProps) => {
  const [open, setOpen] = useState(args.open);

  return (
    <ImageCropper
      {...args}
      open={open}
      onCancel={() => setOpen(false)}
      onComplete={(file) => {
        setOpen(false);
        console.log("crop complete", file);
      }}
      onError={(error) => console.error("crop error", error)}
    />
  );
};

export const Default: Story = {};

export const Square: Story = {
  args: {
    aspectRatio: 1,
    outputWidth: 800,
    outputHeight: 800,
  },
};
