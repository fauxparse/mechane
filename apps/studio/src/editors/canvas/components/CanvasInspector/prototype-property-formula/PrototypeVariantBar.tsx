// PROTOTYPE (issue #711) — the floating variant switcher.
//
// High-contrast on purpose: it must not read as part of the design under
// evaluation. Hidden unless `?variant=` is present, and never rendered in a
// production build.
import { ChevronLeftIcon, ChevronRightIcon, cn } from "@mechane/design-system";
import { useEffect, type ReactNode } from "react";

import {
  PROTOTYPE_VARIANTS,
  VARIANT_NAMES,
  activeVariant,
  showVariant,
  type PrototypeVariant,
} from "./prototype-variant";

function step(from: PrototypeVariant, delta: number): PrototypeVariant {
  const index = PROTOTYPE_VARIANTS.indexOf(from);
  const next = (index + delta + PROTOTYPE_VARIANTS.length) % PROTOTYPE_VARIANTS.length;
  return PROTOTYPE_VARIANTS[next] ?? from;
}

export function PrototypeVariantBar() {
  const variant = activeVariant();

  useEffect(() => {
    if (!variant) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest("[contenteditable]"))
      ) {
        return;
      }
      showVariant(step(variant, event.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  if (!variant || process.env.NODE_ENV === "production") return null;

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-yellow-300 text-black shadow-lg ring-2 ring-black/20">
      <div className="flex items-center gap-1 px-1 py-1">
        <BarButton label="Previous variant" onClick={() => showVariant(step(variant, -1))}>
          <ChevronLeftIcon className="size-4" />
        </BarButton>
        <span className="px-2 text-xs font-semibold whitespace-nowrap">
          #711 · {variant} ({VARIANT_NAMES[variant]}) · Formulas are in memory; results are written
        </span>
        <BarButton label="Next variant" onClick={() => showVariant(step(variant, 1))}>
          <ChevronRightIcon className="size-4" />
        </BarButton>
      </div>
    </div>
  );
}

function BarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("rounded-full p-1 hover:bg-black/10")}
    >
      {children}
    </button>
  );
}
