// The Device Share dialog (#838; prototype #818, Variant C): how people get
// to one Device. A large QR code of the address in use sits beside two tabs,
// the join code and "your own address". Setting up a domain is written as a
// hand-off, because most directors don't run their own DNS.
import {
  Button,
  CopyButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  QrCode,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@mechane/design-system";
import { deviceAddress } from "@mechane/domain/device-address";
import { devicePlayerUrl } from "@mechane/domain/device-qr";
import type { CustomDomain } from "@mechane/graphql-schema";
import { useState } from "react";

import {
  CustomDomainStatusBadge,
  DnsRecordRows,
  RebindConfirm,
  type PendingBind,
} from "./CustomDomainParts";
import {
  bindConsequence,
  dnsHandOff,
  isLiveDomain,
  remedyFor,
  statusOf,
  type DeviceOption,
} from "./custom-domain-model";

export interface ShareableDevice extends DeviceOption {
  pairingCode: string;
}

export interface DeviceShareDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  device: ShareableDevice;
  /** Every Custom Domain the user has; the one bound to `device` is shown. */
  domains: readonly CustomDomain[];
  playerOrigin: string;
  settingsHref: string;
  onManage(): void;
  onAdd(hostname: string): Promise<void>;
  onBind(domain: CustomDomain): Promise<void>;
  onCheckNow(domain: CustomDomain): Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export function DeviceShareDialog({
  open,
  onOpenChange,
  device,
  domains,
  playerOrigin,
  settingsHref,
  onManage,
  onAdd,
  onBind,
  onCheckNow,
}: DeviceShareDialogProps) {
  const domain =
    domains.find(
      (candidate) =>
        candidate.binding?.showId === device.showId &&
        candidate.binding.deviceId === device.deviceId,
    ) ?? null;
  const address = deviceAddress(
    {
      pairingCode: device.pairingCode,
      liveDomain: domain && isLiveDomain(domain) ? domain.hostname : null,
    },
    playerOrigin,
  );
  const pairingUrl = devicePlayerUrl(playerOrigin, device.pairingCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(52rem,calc(100vw-2rem))]">
        <DialogTitle>Share {device.deviceName}</DialogTitle>
        <DialogDescription>How people get to this Device.</DialogDescription>
        <div className="grid grid-cols-[14rem_1fr] gap-6">
          <div className="flex flex-col items-center gap-2 self-start rounded-lg bg-white p-3 text-black">
            <QrCode value={address.url} className="size-48" label={`QR code for ${address.text}`} />
            <span
              className="w-full truncate text-center font-mono text-xs"
              data-testid="share-address"
            >
              {address.text}
            </span>
          </div>
          <Tabs defaultValue={domain ? "domain" : "code"}>
            <TabsList>
              <TabsTrigger value="code">Join code</TabsTrigger>
              <TabsTrigger value="domain">Your own address</TabsTrigger>
            </TabsList>
            <TabsContent value="code" className="flex flex-col gap-3 pt-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-2xl tracking-widest">{device.pairingCode}</span>
                <CopyButton value={device.pairingCode} />
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate font-mono text-xs">{pairingUrl}</span>
                <CopyButton value={pairingUrl} />
              </div>
              <p className="text-muted-foreground">
                The join code always works, even once your own address is set up.
              </p>
            </TabsContent>
            <TabsContent value="domain" className="pt-3">
              {domain ? (
                <DomainProgress
                  domain={domain}
                  device={device}
                  pairingText={
                    deviceAddress({ pairingCode: device.pairingCode }, playerOrigin).text
                  }
                  onCheckNow={() => onCheckNow(domain)}
                />
              ) : (
                <AddForDevice device={device} domains={domains} onAdd={onAdd} onBind={onBind} />
              )}
              <a
                href={settingsHref}
                className="mt-4 inline-block text-xs underline"
                onClick={(event) => {
                  event.preventDefault();
                  onManage();
                }}
              >
                Manage in Show settings
              </a>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddForDevice({
  device,
  domains,
  onAdd,
  onBind,
}: {
  device: ShareableDevice;
  domains: readonly CustomDomain[];
  onAdd(hostname: string): Promise<void>;
  onBind(domain: CustomDomain): Promise<void>;
}) {
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingBind | null>(null);
  const available = domains.filter((domain) => domain.status !== "revoked");

  async function attempt(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  function bringHere(id: string) {
    const domain = available.find((candidate) => candidate.id === id);
    if (!domain) return;
    const consequence = bindConsequence(domains, domain.id, device);
    if (!consequence.moves && !consequence.displaces) {
      void attempt(() => onBind(domain));
      return;
    }
    setPending({
      hostname: domain.hostname,
      device,
      consequence,
      confirm: () => {
        setPending(null);
        void attempt(() => onBind(domain));
      },
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Use an address you own, like <span className="font-mono">vote.yourshow.com</span>, so the QR
        code and posters show your name, not ours.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (hostname.trim() === "") return;
          void attempt(() => onAdd(hostname.trim()));
        }}
      >
        <Input
          placeholder="vote.yourshow.com"
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          aria-label="Your own address"
        />
        <Button type="submit" disabled={busy || hostname.trim() === ""}>
          Use this address
        </Button>
      </form>
      {available.length > 0 ? (
        <Select value={null} onValueChange={(value) => value && bringHere(value)}>
          <SelectTrigger aria-label="Bring one you already have">
            <SelectValue>…or bring one you already have here</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {available.map((domain) => (
              <SelectItem key={domain.id} value={domain.id}>
                {domain.hostname}
                {domain.binding ? ` — now opens ${domain.binding.deviceName}` : " — not in use"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
      <RebindConfirm pending={pending} onCancel={() => setPending(null)} />
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function DomainProgress({
  domain,
  device,
  pairingText,
  onCheckNow,
}: {
  domain: CustomDomain;
  device: ShareableDevice;
  pairingText: string;
  onCheckNow(): Promise<void>;
}) {
  const [showRecords, setShowRecords] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const status = statusOf(domain);
  const live = isLiveDomain(domain);
  const handOff = dnsHandOff(domain);
  const history = [
    { label: "Added", at: domain.addedAt },
    domain.provenAt ? { label: "Ownership proven", at: domain.provenAt } : null,
    domain.wentLiveAt ? { label: "Went live", at: domain.wentLiveAt } : null,
    status === "needs_attention" ? { label: "Needs attention", at: domain.statusChangedAt } : null,
  ].filter((entry) => entry !== null);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono">{domain.hostname}</span>
        <CustomDomainStatusBadge domain={domain} />
      </div>
      <p>
        {remedyFor(domain)}
        {domain.reason && status !== "revoked" ? (
          <span
            className={domain.queued ? "block text-muted-foreground" : "block text-destructive"}
          >
            {domain.reason}
          </span>
        ) : null}
      </p>
      {!live && status !== "revoked" ? (
        <p className="text-muted-foreground">
          Until it's live, the link and QR code for {device.deviceName} use {pairingText}.
        </p>
      ) : null}

      {status !== "revoked" ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">
            Send this to whoever manages {domain.hostname}
          </span>
          <div className="relative">
            <Textarea
              readOnly
              value={handOff}
              aria-label="Message for whoever runs your DNS"
              className="h-40 font-mono text-xs"
            />
            <div className="absolute top-1 right-1">
              <CopyButton value={handOff} />
            </div>
          </div>
          <button
            type="button"
            className="self-start text-xs underline"
            onClick={() => setShowRecords((shown) => !shown)}
          >
            {showRecords ? "Hide the records" : "I'll do it myself: show the records"}
          </button>
          {showRecords ? <DnsRecordRows records={domain.records} /> : null}
        </div>
      ) : null}

      <ol className="flex flex-col gap-1 border-l border-border pl-3 text-xs text-muted-foreground">
        {history.map((entry) => (
          <li key={entry.label}>
            <span className="text-foreground">{entry.label}</span> · {formatWhen(entry.at)}
          </li>
        ))}
      </ol>

      {status !== "revoked" ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={checked !== null}
            onClick={() =>
              void onCheckNow()
                .then(() => setChecked("Checked just now"))
                .catch((error: unknown) => setChecked(messageOf(error)))
            }
          >
            {checked ?? "Check now"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
