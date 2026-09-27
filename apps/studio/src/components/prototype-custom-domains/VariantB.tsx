// PROTOTYPE (issue #818) — Variant B: set it up inline on the Device.
//
// No Settings surface at all. You add a domain *to this Device* from its
// inspector, and a four-step checklist walks it to Live without leaving the
// Show Editor. Domains you already own appear only as a "use one you have"
// picker; moving one here is the same gesture as adding it.
import {
  AlertTriangleIcon,
  Button,
  CheckIcon,
  Input,
  LoaderCircleIcon,
  Section,
  SectionHelperText,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@mechane/design-system";
import { useState } from "react";

import {
  addDomain,
  checkNow,
  domainForDevice,
  pairingUrl,
  recordsFor,
  removeDomain,
  unbindDomain,
  useCustomDomains,
  type BindConsequence,
  type CustomDomain,
  type DeviceRef,
} from "./domain-store";
import { RebindConfirm, RecordRows, requestBind } from "./shared";

type Pending = { domain: CustomDomain; device: DeviceRef; consequence: BindConsequence } | null;

const STEPS = [
  { key: "unverified", title: "Prove it's yours" },
  { key: "connecting", title: "Point it at Mechanē" },
  { key: "securing", title: "Secure it" },
  { key: "live", title: "Live" },
] as const;

function stepIndex(domain: CustomDomain): number {
  if (domain.status === "attention") return 3;
  const index = STEPS.findIndex((step) => step.key === domain.status);
  return index === -1 ? 0 : index;
}

export function VariantBInspector({
  device,
  pairingCode,
}: {
  device: DeviceRef;
  pairingCode: string;
}) {
  const domains = useCustomDomains();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const current = domainForDevice(domains, device.deviceId);
  const others = domains.filter(
    (domain) => domain.boundTo?.deviceId !== device.deviceId && domain.status !== "revoked",
  );

  if (!current) {
    return (
      <Section label="Custom domain">
        <SectionRow>
          <form
            className="col-span-2 flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              const result = addDomain(draft, device);
              if (typeof result === "string") setError(result);
              else {
                setDraft("");
                setError(null);
              }
            }}
          >
            <Input
              placeholder="vote.yourshow.com"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Custom domain for this Device"
            />
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
        </SectionRow>
        {error ? <SectionHelperText className="text-destructive">{error}</SectionHelperText> : null}
        {others.length > 0 ? (
          <SectionRow>
            <div className="col-span-2">
              <Select
                value={null}
                onValueChange={(value) => {
                  const domain = others.find((candidate) => candidate.id === value);
                  if (domain) requestBind(domain, device, setPending);
                }}
              >
                <SelectTrigger aria-label="Use a domain you already have">
                  <SelectValue placeholder="…or use one you already have" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((domain) => (
                    <SelectItem key={domain.id} value={domain.id}>
                      {domain.hostname}
                      {domain.boundTo ? ` — in ${domain.boundTo.showName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SectionRow>
        ) : null}
        <SectionHelperText>
          Give this Device an address people can remember, instead of its join code.
        </SectionHelperText>
        <RebindConfirm pending={pending} onDone={() => setPending(null)} />
      </Section>
    );
  }

  const at = stepIndex(current);
  return (
    <Section
      label="Custom domain"
      buttons={
        <Button size="xs" variant="ghost" onClick={() => unbindDomain(current.id)}>
          Stop using
        </Button>
      }
    >
      <SectionRow>
        <div className="col-span-2 truncate font-mono text-sm">{current.hostname}</div>
      </SectionRow>

      {current.status === "attention" || current.status === "revoked" ? (
        <SectionRow>
          <div className="col-span-2 flex gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <span>
              {current.status === "revoked"
                ? `Taken offline by Mechanē. ${current.revokedReason ?? ""}`
                : current.problem}
            </span>
          </div>
        </SectionRow>
      ) : null}
      {current.contested && current.status === "unverified" ? (
        <SectionHelperText className="text-destructive">
          In use by another Mechanē account. Adding this record shows it's yours now.
        </SectionHelperText>
      ) : null}

      {current.status === "revoked" ? null : (
        <SectionRow>
          <ol className="col-span-2 flex flex-col">
            {STEPS.map((step, index) => {
              const done = index < at || (current.status === "live" && index === 3);
              const active = index === at && !done;
              return (
                <li key={step.key} className="flex gap-2">
                  <div className="flex flex-col items-center">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full border text-[10px]",
                        done && "border-transparent bg-emerald-500 text-white",
                        active && "border-foreground",
                        !done && !active && "border-border text-muted-foreground",
                      )}
                    >
                      {done ? (
                        <CheckIcon className="size-3" />
                      ) : active && step.key === "securing" ? (
                        <LoaderCircleIcon className="size-3 animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {index < STEPS.length - 1 ? <span className="w-px flex-1 bg-border" /> : null}
                  </div>
                  <div className={cn("flex min-w-0 flex-1 flex-col gap-2 pb-3")}>
                    <span
                      className={cn("text-sm", !active && !done && "text-muted-foreground")}
                    >
                      {step.title}
                    </span>
                    {active && step.key !== "live" ? (
                      <>
                        {step.key === "securing" ? (
                          <span className="text-xs text-muted-foreground">
                            Usually a few minutes. Nothing for you to do.
                          </span>
                        ) : (
                          <RecordRows
                            compact
                            records={recordsFor(current).filter((record) =>
                              step.key === "unverified" ? true : !record.name.startsWith("_mechane"),
                            )}
                          />
                        )}
                        {current.problem && current.status !== "attention" ? (
                          <span className="text-xs text-destructive">{current.problem}</span>
                        ) : null}
                        {step.key === "connecting" ? (
                          <span className="text-xs text-muted-foreground">
                            Cloudflare users: set it to “DNS only”.
                          </span>
                        ) : null}
                        <Button size="xs" variant="secondary" onClick={() => checkNow(current.id)}>
                          {current.dormant ? "Paused — check now" : "Check now"}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </SectionRow>
      )}

      <SectionHelperText>
        {current.status === "live"
          ? "The link and QR code now use this address."
          : `Until it's live, the link and QR code use ${pairingUrl(pairingCode).replace(/^https?:\/\//, "")}.`}{" "}
        <button type="button" className="underline" onClick={() => removeDomain(current.id)}>
          Remove domain
        </button>
      </SectionHelperText>
    </Section>
  );
}
