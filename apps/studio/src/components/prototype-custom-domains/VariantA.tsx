// PROTOTYPE (issue #818) — Variant A: a Domains library in Settings.
//
// The domain belongs to the user, so it is managed where the user's things
// live: /settings lists every Custom Domain as a row, with its records and
// remedy folded underneath. The Device inspector only *picks* one.
import {
  Button,
  ChevronDownIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ExternalLinkIcon,
  Input,
  Section,
  SectionHelperText,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mechane/design-system";
import { useState } from "react";

import {
  addDomain,
  checkNow,
  domainForDevice,
  effectiveDeviceUrl,
  knownDevices,
  recordsFor,
  removeDomain,
  unbindDomain,
  useCustomDomains,
  type BindConsequence,
  type CustomDomain,
  type DeviceRef,
} from "./domain-store";
import { withVariant } from "./prototype-variant";
import { RebindConfirm, RecordRows, StatusBadge, requestBind } from "./shared";

type Pending = { domain: CustomDomain; device: DeviceRef; consequence: BindConsequence } | null;

const REMEDY: Record<CustomDomain["status"], string> = {
  unverified: "Add this record at your domain provider so we know the address is yours.",
  connecting: "Ownership proven. Now point the address at Mechanē.",
  securing: "DNS is right. We're issuing a certificate — usually a few minutes.",
  live: "Working. Keep both records in place.",
  attention: "Something changed at your domain provider.",
  revoked: "Mechanē has taken this address offline.",
};

export function VariantASettings() {
  const domains = useCustomDomains();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const devices = knownDevices();

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-medium">Custom domains</h2>
        <p className="text-sm text-muted-foreground">
          Addresses you own that open one of your Devices, like vote.yourshow.com. You can move an
          address between Shows whenever you like.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const result = addDomain(draft);
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
          aria-label="New custom domain"
        />
        <Button type="submit">Add domain</Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {domains.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No custom domains yet.</li>
        ) : null}
        {domains.map((domain) => (
          <Collapsible key={domain.id} render={<li />} defaultOpen={domain.status !== "live"}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,15rem)_auto] items-center gap-3 p-3">
              <span className="truncate font-mono text-sm">{domain.hostname}</span>
              <StatusBadge domain={domain} />
              <Select
                value={domain.boundTo?.deviceId ?? "__none"}
                disabled={domain.status === "revoked"}
                onValueChange={(value) => {
                  if (value === "__none") return unbindDomain(domain.id);
                  const device = devices.find((candidate) => candidate.deviceId === value);
                  if (device) requestBind(domain, device, setPending);
                }}
              >
                <SelectTrigger className="w-full min-w-0" aria-label={`Device ${domain.hostname} opens`}>
                  <SelectValue>
                    {domain.boundTo
                      ? `${domain.boundTo.showName} › ${domain.boundTo.deviceName}`
                      : "Not in use"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not in use</SelectItem>
                  {devices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.showName} › {device.deviceName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CollapsibleTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="Details" />}
              >
                <ChevronDownIcon />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="flex flex-col gap-3 px-3 pb-3">
                <p className="text-sm">
                  {domain.contested && domain.status === "unverified"
                    ? "This address is in use by another Mechanē account. Add the record below to show it's yours now."
                    : domain.revokedReason
                      ? `${REMEDY.revoked} ${domain.revokedReason}`
                      : REMEDY[domain.status]}
                  {domain.problem ? (
                    <span className="block text-destructive">{domain.problem}</span>
                  ) : null}
                  {domain.boundTo && domain.status !== "live" && domain.status !== "revoked" ? (
                    <span className="block text-muted-foreground">
                      {domain.boundTo.deviceName}'s link and QR code keep using its join code until
                      this is live.
                    </span>
                  ) : null}
                </p>
                <RecordRows records={recordsFor(domain)} />
                {domain.status === "connecting" || domain.status === "attention" ? (
                  <p className="text-xs text-muted-foreground">
                    Using Cloudflare? Set this record to “DNS only” (grey cloud). Remove any AAAA
                    records for this address.
                  </p>
                ) : null}
                <div className="flex gap-2">
                  {domain.status !== "live" && domain.status !== "revoked" ? (
                    <Button size="sm" variant="secondary" onClick={() => checkNow(domain.id)}>
                      Check now
                    </Button>
                  ) : null}
                  <Button size="sm" variant="destructive" onClick={() => removeDomain(domain.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </ul>
      <RebindConfirm pending={pending} onDone={() => setPending(null)} />
    </section>
  );
}

export function VariantAInspector({
  device,
  pairingCode,
}: {
  device: DeviceRef;
  pairingCode: string;
}) {
  const domains = useCustomDomains();
  const [pending, setPending] = useState<Pending>(null);
  const current = domainForDevice(domains, device.deviceId);
  const link = effectiveDeviceUrl(domains, device.deviceId, pairingCode);

  return (
    <Section label="Custom domain">
      <SectionRow>
        <div className="col-span-2">
          <Select
            value={current?.id ?? "__none"}
            onValueChange={(value) => {
              if (value === "__none") return current && unbindDomain(current.id);
              const domain = domains.find((candidate) => candidate.id === value);
              if (domain) requestBind(domain, device, setPending);
            }}
          >
            <SelectTrigger aria-label="Custom domain">
              <SelectValue>{current ? current.hostname : "None"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">None</SelectItem>
              {domains
                .filter((domain) => domain.status !== "revoked")
                .map((domain) => (
                  <SelectItem key={domain.id} value={domain.id}>
                    {domain.hostname}
                    {domain.boundTo && domain.boundTo.deviceId !== device.deviceId
                      ? ` — in ${domain.boundTo.showName}`
                      : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </SectionRow>
      {current ? (
        <SectionRow className="items-center">
          <div className="col-span-2 flex items-center gap-2">
            <StatusBadge domain={current} />
          </div>
        </SectionRow>
      ) : null}
      <SectionHelperText>
        Opens at{" "}
        <a href={link.url} target="_blank" rel="noreferrer" className="underline">
          {link.url.replace(/^https?:\/\//, "")}
          <ExternalLinkIcon className="ml-1 inline size-3" />
        </a>
        {current && !link.viaDomain ? " until the domain is live." : "."}{" "}
        <a href={withVariant("/settings")} className="underline">
          Manage domains
        </a>
      </SectionHelperText>
      <RebindConfirm pending={pending} onDone={() => setPending(null)} />
    </Section>
  );
}
