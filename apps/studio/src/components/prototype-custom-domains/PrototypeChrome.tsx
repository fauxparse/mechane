// PROTOTYPE (issue #818) — the floating variant switcher and the state panel.
//
// High-contrast on purpose: neither is part of the design under evaluation.
// The state panel stands in for the background checker: its buttons fire the
// transitions #817 assigns to Vercel, Mechanē's checks and admins.
import { ChevronLeftIcon, ChevronRightIcon, cn } from "@mechane/design-system";
import { useEffect, useState, type ReactNode } from "react";

import {
  SIMULATED_EVENTS,
  STATUS_LABEL,
  resetPrototype,
  simulate,
  useCustomDomains,
} from "./domain-store";
import {
  PROTOTYPE_VARIANTS,
  VARIANT_HINTS,
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

export function PrototypeChrome() {
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
    <>
      <div className="pointer-events-auto fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-yellow-300 text-black shadow-lg ring-2 ring-black/20">
        <div className="flex items-center gap-1 px-1 py-1">
          <BarButton label="Previous variant" onClick={() => showVariant(step(variant, -1))}>
            <ChevronLeftIcon className="size-4" />
          </BarButton>
          <span className="px-2 text-xs font-semibold whitespace-nowrap">
            #818 · {variant} ({VARIANT_NAMES[variant]}) · {VARIANT_HINTS[variant]}
          </span>
          <BarButton label="Next variant" onClick={() => showVariant(step(variant, 1))}>
            <ChevronRightIcon className="size-4" />
          </BarButton>
        </div>
      </div>
      <StatePanel />
    </>
  );
}

function StatePanel() {
  const domains = useCustomDomains();
  const [open, setOpen] = useState(true);

  return (
    <div className="pointer-events-auto fixed bottom-16 left-4 z-[60] w-80 rounded-lg bg-yellow-100 text-black shadow-lg ring-2 ring-black/20">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold"
        onClick={() => setOpen((value) => !value)}
      >
        <span>#818 state · simulate the checker</span>
        <span>{open ? "hide" : "show"}</span>
      </button>
      {open ? (
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-auto px-3 pb-3 text-[11px]">
          {domains.map((domain) => (
            <div key={domain.id} className="rounded border border-black/15 bg-white/60 p-2">
              <div className="font-mono font-semibold">{domain.hostname}</div>
              <div>
                {STATUS_LABEL[domain.status]}
                {domain.dormant ? " · dormant" : ""}
                {domain.contested ? " · contested" : ""}
                {" · "}
                {domain.boundTo
                  ? `→ ${domain.boundTo.showName} › ${domain.boundTo.deviceName}`
                  : "unbound"}
              </div>
              {domain.problem ? <div className="text-red-700">{domain.problem}</div> : null}
              <div className="mt-1 flex flex-wrap gap-1">
                {SIMULATED_EVENTS.filter((candidate) =>
                  candidate.from.includes(domain.status),
                ).map((candidate) => (
                  <button
                    key={candidate.event}
                    type="button"
                    className="rounded bg-black/80 px-1.5 py-0.5 text-white hover:bg-black"
                    onClick={() => simulate(domain.id, candidate.event)}
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="self-start underline" onClick={resetPrototype}>
            Reset to seed
          </button>
        </div>
      ) : null}
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
