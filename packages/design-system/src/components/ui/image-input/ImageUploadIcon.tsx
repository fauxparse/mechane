import { CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/utils";

type ImageUploadIconProps = {
  className?: string;
  state: "idle" | "loading";
  progress: number;
};

export const ImageUploadIcon = ({
  className,
  state: externalState,
  progress,
}: ImageUploadIconProps) => {
  const [state, setState] = useState<"idle" | "loading" | "complete">(externalState);
  const previousExternalState = useRef(externalState);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }

    const wasLoading = previousExternalState.current === "loading";
    previousExternalState.current = externalState;

    if (externalState === "idle") {
      if (!wasLoading) {
        setState("idle");
        return;
      }

      setState("complete");
      timer.current = window.setTimeout(() => {
        setState("idle");
      }, 1000);
    } else {
      setState(externalState);
    }

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [externalState]);

  return (
    <div
      className={cn(
        "group/icon size-16 grid items-center justify-center user-select-none",
        className,
      )}
      data-state={state}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-8 -8 40 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="col-start-1 row-start-1 size-full"
        style={
          {
            "--progress": progress / 100.0,
          } as CSSProperties
        }
      >
        <path
          className={cn(
            "[stroke-dasharray:1] [stroke-dashoffset:calc(1-var(--progress))]",
            state !== "idle" ? "opacity-100 transition-all ease-in-out" : "opacity-0",
          )}
          pathLength="1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          style={{ "--progress": `${progress / 100.0}` } as CSSProperties}
        />
        <circle
          className={cn(
            "transition-all duration-500 ease-in-out",
            state === "idle"
              ? "translate-y-0 opacity-100 ease-[linear(0,0.417_25.5%,0.867_49.4%,1_57.7%,0.925_65.1%,0.908_68.6%,0.902_72.2%,0.916_78.2%,0.988_92.1%,1)] delay-500"
              : "-translate-y-full opacity-0",
          )}
          cx="9"
          cy="9"
          r="2"
        />
        <path
          className={cn(
            "origin-[9px_17px] [stroke-dasharray:1]",
            state === "loading"
              ? "opacity-0 [stroke-dashoffset:1]"
              : state === "complete"
                ? "opacity-100 [stroke-dashoffset:0] transition-[stroke-dashoffset] duration-500 ease-in-out"
                : "transform-[translate(7px,-7px)_rotate(180deg)] transition-transform duration-300 ease-in-out",
          )}
          d="M4 12 9 17 20 6"
          pathLength="1"
        />
      </svg>

      <div
        className={cn(
          "col-start-1 row-start-1 m-auto border-[currentColor] border-2 transition-all duration-500 ease-out",
          state === "idle" ? "size-[50%] rounded-[15%]" : "size-[80%] rounded-[50%]",
          state === "loading" ? "opacity-25" : "opacity-100",
        )}
      ></div>
      <div
        className={cn(
          "col-start-1 row-start-1 text-sm text-center font-medium text-muted-foreground opacity-0 group-data-[state=loading]/icon:opacity-100 pointer-events-none tabular-nums transition-opacity duration-300",
        )}
      >
        {Math.min(99, Math.round(progress))}%
      </div>
    </div>
  );
};
