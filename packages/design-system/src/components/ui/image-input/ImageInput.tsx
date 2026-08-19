import { ResolvedImageValue } from "@mechane/domain";
import { cn } from "../../../lib/utils";
import { ImageUploadIcon } from "./ImageUploadIcon";
import {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "../button";
import { ACCEPTED_IMAGE_ACCEPT, firstAcceptedImage, isFileDrag } from "./utils";
import { Trash2Icon } from "lucide-react";

export type ImageInputProps = {
  className?: string;
  value: ResolvedImageValue | null;
  readOnly?: boolean;
  onChange: (value: ResolvedImageValue | null) => void;
  onDelete?: () => void;
  onUpload?: (props: ImageInputOnUploadProps) => void;
};

export type ImageInputOnUploadProps = {
  file: File;
  onProgress: (progress: number) => void;
  onSuccess: (value: ResolvedImageValue) => void;
  onError: (error: Error) => void;
};

export const ImageInput = ({
  className,
  value,
  readOnly = false,
  onChange,
  onDelete,
  onUpload,
}: ImageInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<"idle" | "loading">("idle");
  const [progress, setProgress] = useState(0);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const dragDepthRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!previewFile) return;

    const url = URL.createObjectURL(previewFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [previewFile]);

  const handleUploadProgress = useCallback((progress: number) => {
    setProgress(progress);
  }, []);

  const handleUploadSuccess = useCallback(
    (value: ResolvedImageValue) => {
      setState("idle");
      setPreviewFile(null);
      setPreviewUrl(null);
      onChange(value);
    },
    [onChange],
  );

  const handleUploadError = useCallback(() => {
    setState("idle");
    setPreviewFile(null);
    setPreviewUrl(null);
    onChange(null);
  }, [onChange]);

  const startUpload = (file: File) => {
    setState("loading");
    setProgress(0);
    setPreviewUrl(null);
    setPreviewFile(file);
    if (onUpload) {
      setState("loading");
      setProgress(0);
      onUpload({
        file,
        onProgress: handleUploadProgress,
        onSuccess: handleUploadSuccess,
        onError: handleUploadError,
      });
      return;
    }
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = firstAcceptedImage(event.currentTarget.files);
    if (file) startUpload(file);
    event.currentTarget.value = "";
  };

  const resetDragState = () => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = onUpload ? "copy" : "none";
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) resetDragState();
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetDragState();
    const file = firstAcceptedImage(event.dataTransfer.files);
    if (file) startUpload(file);
  };

  return (
    <div
      className={cn(
        "group/input relative w-full aspect-video rounded-md grid overflow-hidden *:col-start-1 *:row-start-1",
        className,
      )}
      data-empty={!value}
      data-state={state}
      data-dragging={isDragging || undefined}
      aria-readonly={!!readOnly}
    >
      <img
        src={previewUrl ?? value?.url}
        alt={value?.alt ?? "Image preview"}
        className="group-data-[empty=true]/input:hidden group-data-[state=loading]/input:block size-full min-h-0 min-w-0 object-cover rounded-[inherit] group-data-[state=loading]/input:opacity-100 group-data-[state=loading]/input:blur-(--progress-blur) transition-all"
        style={
          {
            "--progress-blur": `${Math.round((100 - progress) / 2)}px`,
          } as CSSProperties
        }
      />
      <div
        className="relative z-1 flex w-full h-full flex-col items-center justify-center gap-4 p-4 rounded-[inherit] bg-muted/50 border border-dashed border-transparent group-data-[empty=false]/input:opacity-0 group-data-[empty=false]/input:backdrop-blur-sm group-data-[empty=false]/input:backdrop-saturate-25 group-data-[empty=false]/input:backdrop-brightness-50 hover:opacity-100 group-data-[state=loading]/input:opacity-100 group-data-[dragging=true]/input:border-foreground group-data-[dragging=true]/input:opacity-100 transition-opacity duration-500 hover:duration-300"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ImageUploadIcon state={state} progress={progress} />
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          aria-label="Choose image file"
          accept={ACCEPTED_IMAGE_ACCEPT}
          onChange={handleFileInputChange}
        />
        <Button
          type="button"
          variant="outline"
          className="group-data-[empty=false]/input:border-foreground group-data-[empty=false]/input:hover:border-foreground disabled:border-transparent"
          onClick={() => inputRef.current?.click()}
          disabled={state === "loading"}
        >
          {state === "loading" ? "Uploading..." : "Browse files"}
        </Button>
        {onDelete && state !== "loading" && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-2 group-data-[empty=true]/input:hidden rounded-full bg-neutral-900/50 hover:bg-neutral-900/75 dark:bg-neutral-900/50 dark:hover:bg-neutral-900/75 fg-neutral-100"
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
