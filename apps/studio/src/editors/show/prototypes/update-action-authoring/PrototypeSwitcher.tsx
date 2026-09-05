/** PROTOTYPE — throwaway. Not production code. */
import { Button, ChevronLeftIcon, ChevronRightIcon } from "@mechane/design-system";
import { useEffect } from "react";

export interface VariantMeta {
  key: string;
  name: string;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: {
  variants: readonly VariantMeta[];
  current: string;
  onChange: (key: string) => void;
}) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const step = (delta: number) => {
    const next = (index + delta + variants.length) % variants.length;
    const target = variants[next];
    if (target) onChange(target.key);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 bg-neutral-900 px-2 py-1.5 text-neutral-50 shadow-lg dark:border-white/20">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Previous variant"
        className="size-7 rounded-full text-neutral-50 hover:bg-white/15 hover:text-neutral-50"
        onClick={() => step(-1)}
      >
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-64 px-2 text-center font-mono text-xs tracking-tight">
        {variants[index]?.key} — {variants[index]?.name}
      </span>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Next variant"
        className="size-7 rounded-full text-neutral-50 hover:bg-white/15 hover:text-neutral-50"
        onClick={() => step(1)}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}

/** Shared throwaway chrome: a fake editor surface with one or two right sidebars. */
export function PrototypeChrome({
  surface,
  panels,
}: {
  surface: React.ReactNode;
  panels: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="min-w-0 flex-1 overflow-auto p-8">{surface}</div>
      <div className="flex h-full shrink-0 gap-3 overflow-x-auto p-3">{panels}</div>
    </div>
  );
}

export function PrototypePanel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-lg border border-sidebar-border bg-sidebar shadow-sm">
      <div className="border-b border-sidebar-border px-4 py-3">
        <div className="text-sm font-medium">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
