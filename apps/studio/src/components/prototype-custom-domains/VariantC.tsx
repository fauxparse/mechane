// PROTOTYPE (issue #818) — Variant C: a Share dialog.
//
// The question a director actually has is "how do people get to this Device?".
// So the domain is set up beside the thing it changes — the QR code and the
// address — in one dialog opened from the Device. Setup is written as a
// hand-off: most directors don't run their own DNS, so the primary affordance
// is instructions to send to whoever does.
import {
  Button,
  CopyButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  QrCode,
  Section,
  SectionHelperText,
  SectionRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Share2Icon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@mechane/design-system";
import { useState } from "react";

import {
  STATUS_LABEL,
  addDomain,
  checkNow,
  domainForDevice,
  effectiveDeviceUrl,
  recordsFor,
  removeDomain,
  unbindDomain,
  useCustomDomains,
  type BindConsequence,
  type CustomDomain,
  type DeviceRef,
} from "./domain-store";
import { RebindConfirm, RecordRows, StatusBadge, ago, requestBind } from "./shared";

type Pending = { domain: CustomDomain; device: DeviceRef; consequence: BindConsequence } | null;

const NEXT: Record<CustomDomain["status"], string> = {
  unverified: "Waiting for the ownership record.",
  connecting: "Ownership proven. Waiting for the address to point at Mechanē.",
  securing: "All set up. Mechanē is issuing a certificate — usually a few minutes.",
  live: "Live. Scanning the QR code opens this address.",
  attention: "Something changed at the domain provider.",
  revoked: "Mechanē has taken this address offline.",
};

function handOff(domain: CustomDomain): string {
  const lines = recordsFor(domain).map(
    (record) => `  ${record.type}  ${record.name}  →  ${record.value}`,
  );
  return [
    `Hi — could you add these DNS records for ${domain.hostname}?`,
    "",
    ...lines,
    "",
    "If the domain is on Cloudflare, please set them to “DNS only” (grey cloud), and remove any AAAA records for this name.",
    "The _mechane record needs to stay in place permanently.",
    "",
    "Thanks!",
  ].join("\n");
}

export function VariantCInspector({
  device,
  pairingCode,
}: {
  device: DeviceRef;
  pairingCode: string;
}) {
  const domains = useCustomDomains();
  const [open, setOpen] = useState(false);
  const current = domainForDevice(domains, device.deviceId);
  const link = effectiveDeviceUrl(domains, device.deviceId, pairingCode);

  return (
    <Section label="Sharing">
      <SectionRow>
        <div className="col-span-2 flex flex-col gap-1">
          <span className="truncate font-mono text-sm">
            {link.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </span>
          {current && !link.viaDomain ? (
            <span className="text-xs text-muted-foreground">
              {current.hostname}: {STATUS_LABEL[current.status].toLowerCase()}
            </span>
          ) : null}
        </div>
      </SectionRow>
      <SectionRow>
        <Button className="col-span-2" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Share2Icon /> Share this Device…
        </Button>
      </SectionRow>
      <ShareDialog
        open={open}
        onOpenChange={setOpen}
        device={device}
        pairingCode={pairingCode}
      />
    </Section>
  );
}

function ShareDialog({
  open,
  onOpenChange,
  device,
  pairingCode,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  device: DeviceRef;
  pairingCode: string;
}) {
  const domains = useCustomDomains();
  const current = domainForDevice(domains, device.deviceId);
  const link = effectiveDeviceUrl(domains, device.deviceId, pairingCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(52rem,calc(100vw-2rem))]">
        <DialogTitle>Share {device.deviceName}</DialogTitle>
        <DialogDescription>How people get to this Device.</DialogDescription>
        <div className="grid grid-cols-[14rem_1fr] gap-6">
          <div className="flex flex-col items-center gap-2 rounded-lg bg-white p-3 text-black">
            <QrCode value={link.url} className="size-48" />
            <span className="w-full truncate text-center font-mono text-xs">
              {link.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </span>
            <span className="text-[11px] text-black/60">
              {link.viaDomain ? "Your address" : `Join code ${pairingCode}`}
            </span>
          </div>
          <Tabs defaultValue={current ? "domain" : "code"}>
            <TabsList>
              <TabsTrigger value="code">Join code</TabsTrigger>
              <TabsTrigger value="domain">Your own address</TabsTrigger>
            </TabsList>
            <TabsContent value="code" className="flex flex-col gap-2 pt-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl tracking-widest">{pairingCode}</span>
                <CopyButton value={pairingCode} />
              </div>
              <p className="text-muted-foreground">
                Always works, even with your own address set up. People can type it at{" "}
                {link.viaDomain ? "the Mechanē player" : "the address on the left"}.
              </p>
            </TabsContent>
            <TabsContent value="domain" className="pt-3">
              {current ? (
                <DomainProgress domain={current} />
              ) : (
                <AddForDevice device={device} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddForDevice({ device }: { device: DeviceRef }) {
  const domains = useCustomDomains();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const others = domains.filter((domain) => domain.status !== "revoked");

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Use an address you own — like <span className="font-mono">vote.yourshow.com</span> — so the
        QR code and posters show your name, not ours.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const result = addDomain(draft, device);
          if (typeof result === "string") setError(result);
          else setError(null);
        }}
      >
        <Input
          placeholder="vote.yourshow.com"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Your own address"
        />
        <Button type="submit">Use this address</Button>
      </form>
      {error ? <p className="text-destructive">{error}</p> : null}
      {others.length > 0 ? (
        <Select
          value={null}
          onValueChange={(value) => {
            const domain = others.find((candidate) => candidate.id === value);
            if (domain) requestBind(domain, device, setPending);
          }}
        >
          <SelectTrigger aria-label="Use an address you already have">
            <SelectValue placeholder="…or move one you already have here" />
          </SelectTrigger>
          <SelectContent>
            {others.map((domain) => (
              <SelectItem key={domain.id} value={domain.id}>
                {domain.hostname}
                {domain.boundTo ? ` — now opens ${domain.boundTo.deviceName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <RebindConfirm pending={pending} onDone={() => setPending(null)} />
    </div>
  );
}

function DomainProgress({ domain }: { domain: CustomDomain }) {
  const [showRecords, setShowRecords] = useState(false);
  const records = recordsFor(domain);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono">{domain.hostname}</span>
        <StatusBadge domain={domain} />
      </div>
      <p>
        {domain.contested && domain.status === "unverified"
          ? "In use by another Mechanē account. Once the record below is added, it moves to you."
          : domain.revokedReason
            ? `${NEXT.revoked} ${domain.revokedReason}`
            : NEXT[domain.status]}
        {domain.problem ? <span className="block text-destructive">{domain.problem}</span> : null}
      </p>

      {records.length > 0 && domain.status !== "live" ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">Send this to whoever manages {domain.hostname}</span>
          <div className="relative">
            <Textarea readOnly value={handOff(domain)} className="h-40 font-mono text-xs" />
            <div className="absolute top-1 right-1">
              <CopyButton value={handOff(domain)} />
            </div>
          </div>
          <button
            type="button"
            className="self-start text-xs underline"
            onClick={() => setShowRecords((shown) => !shown)}
          >
            {showRecords ? "Hide" : "I'll do it myself — show"} the records
          </button>
          {showRecords ? <RecordRows records={records} /> : null}
        </div>
      ) : null}

      <ol className="flex flex-col gap-1 border-l border-border pl-3 text-xs text-muted-foreground">
        {[...domain.history].reverse().map((entry, index) => (
          <li key={`${entry.at}-${index}`}>
            <span className="text-foreground">{entry.text}</span> · {ago(entry.at)}
          </li>
        ))}
      </ol>

      <div className="flex gap-2">
        {domain.status !== "live" && domain.status !== "revoked" ? (
          <Button size="sm" variant="secondary" onClick={() => checkNow(domain.id)}>
            Check now
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => unbindDomain(domain.id)}>
          Stop using here
        </Button>
        <Button size="sm" variant="destructive" onClick={() => removeDomain(domain.id)}>
          Remove address
        </Button>
      </div>
      <SectionHelperText className="col-span-full">
        Moving an address to another Device takes effect immediately — posters already printed will
        open the new Device.
      </SectionHelperText>
    </div>
  );
}
