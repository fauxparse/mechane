import type { Meta, StoryObj } from "@storybook/react-vite";

import { ImageAssetPicker } from "./ImageAssetPicker";

const preview =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'%3E%3Crect width='320' height='180' fill='%2331758f'/%3E%3Ccircle cx='240' cy='60' r='28' fill='%23f6c177'/%3E%3C/svg%3E";
const assets = [
  {
    id: "i-one",
    revision: "r1",
    url: preview,
    width: 320,
    height: 180,
    mimeType: "image/svg+xml",
    alt: "Stage lights",
    blurHash: null,
  },
  {
    id: "i-two",
    revision: "r2",
    url: preview,
    width: 320,
    height: 180,
    mimeType: "image/svg+xml",
    alt: "Blue backdrop",
    blurHash: null,
  },
] as const;

const meta = { title: "studio/ImageAssetPicker", component: ImageAssetPicker } satisfies Meta<
  typeof ImageAssetPicker
>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  args: {
    open: true,
    assets,
    onOpenChange: () => undefined,
    onSelect: () => undefined,
    onUpload: () => undefined,
  },
};
