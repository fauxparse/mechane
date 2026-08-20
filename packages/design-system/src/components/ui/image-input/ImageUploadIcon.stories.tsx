import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageUploadIcon } from "./ImageUploadIcon";
import { useState } from "react";
import { Button } from "../button";

const meta: Meta<typeof ImageUploadIcon> = {
  title: "design-system/ImageInput/ImageUploadIcon",
  component: ImageUploadIcon,
  parameters: {
    layout: "centered",
  },
  args: {
    state: "idle",
    progress: 0,
  },
  render: (args) => <ImageUploadIcon {...args} />,
};

export default meta;

type Story = StoryObj<typeof ImageUploadIcon>;

export const Idle: Story = {};

export const Uploading: Story = {
  args: {
    state: "loading",
    progress: 37,
  },
};

const Harness = (args: Story["args"]) => {
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "loading">("idle");

  const handleClick = () => {
    if (state !== "idle") return;

    setState("loading");
    setProgress(0);

    let totalProgress = 0;

    const step = () => {
      totalProgress = Math.min(totalProgress + Math.random() * 10 + 5, 100);
      setProgress(totalProgress);
      if (totalProgress < 100) {
        window.setTimeout(step, 250);
      } else {
        setState("idle");
      }
    };

    setTimeout(step, 250);
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <ImageUploadIcon {...args} state={state} progress={progress} />
      <Button disabled={state !== "idle"} variant="outline" onClick={handleClick}>
        {state === "loading" ? "Uploading…" : "Upload"}
      </Button>
    </div>
  );
};

export const Interactive: Story = {
  render: (args) => <Harness {...args} />,
};
