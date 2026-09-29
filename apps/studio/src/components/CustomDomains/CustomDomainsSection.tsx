// Show settings' Custom domains section (#837; prototype #818, Variant A).
// Rows list only the domains bound to this Show's Devices; each folds out
// its remedy, records, Check now and Remove. Adding binds straight away to
// the Device picked beside the field, and "bring one you already have"
// binds one of the user's unbound domains. Limits read as next steps.
import {
  Button,
  ChevronDownIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@mechane/design-system";
import type { CustomDomain } from "@mechane/graphql-schema";
import { useEffect, useState } from "react";

import {
  CustomDomainStatusBadge,
  DnsRecordRows,
  RebindConfirm,
  type PendingBind,
} from "./CustomDomainParts";
import {
  bindConsequence,
  CUSTOM_DOMAIN_CAP,
  deviceLabel,
  isLiveDomain,
  remedyFor,
  statusOf,
  type DeviceOption,
} from "./custom-domain-model";

export interface CustomDomainActions {
  add(hostname: string, device: DeviceOption): Promise<void>;
  bind(domain: CustomDomain, device: DeviceOption): Promise<void>;
  unbind(domain: CustomDomain): Promise<void>;
  remove(domain: CustomDomain): Promise<void>;
  checkNow(domain: CustomDomain): Promise<void>;
}

export interface CustomDomainsSectionProps {
  showId: string;
  /** Every Custom Domain the user has, in any Show or none. */
  domains: readonly CustomDomain[];
  /** The user's domains bound to no Device. */
  unbound: readonly CustomDomain[];
  /** This Show's saved Devices. */
  devices: readonly DeviceOption[];
  actions: CustomDomainActions;
}

const NOT_IN_USE = "__not-in-use";
const CHECK_NOW_COOLDOWN_MS = 30_000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export function CustomDomainsSection({
  showId,
  domains,
  unbound,
  devices,
  actions,
}: CustomDomainsSectionProps) {
  const [hostname, setHostname] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingBind | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = domains.filter((domain) => domain.binding?.showId === showId);
  const capReached = domains.length >= CUSTOM_DOMAIN_CAP;
  const device = devices.find((candidate) => candidate.deviceId === deviceId) ?? null;

  async function attempt(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Runs `apply` straight away, or after the confirmation when it disturbs a live address. */
  function confirmThen(
    target: DeviceOption,
    domainHostname: string,
    domainId: string | null,
    apply: () => Promise<void>,
  ) {
    const consequence = bindConsequence(domains, domainId, target);
    if (!consequence.moves && !consequence.displaces) {
      void attempt(apply);
      return;
    }
    setPending({
      hostname: domainHostname,
      device: target,
      consequence,
      confirm: () => {
        setPending(null);
        void attempt(apply);
      },
    });
  }

  function add() {
    if (!device || hostname.trim() === "") return;
    const entered = hostname.trim();
    confirmThen(device, entered, null, async () => {
      await actions.add(entered, device);
      setHostname("");
      setNote(null);
    });
  }

  function bringExisting(domainId: string) {
    const domain = unbound.find((candidate) => candidate.id === domainId);
    if (!domain) return;
    if (!device) {
      setError("Pick the Device it should open first.");
      return;
    }
    confirmThen(device, domain.hostname, domain.id, async () => {
      await actions.bind(domain, device);
      setNote(null);
    });
  }

  function pickDevice(domain: CustomDomain, value: string | null) {
    if (value === NOT_IN_USE) {
      void attempt(() => actions.unbind(domain)).then((unbound) => {
        if (!unbound) return;
        setNote(
          `${domain.hostname} is no longer in use. It's waiting under “bring one you already have”.`,
        );
      });
      return;
    }
    const target = devices.find((candidate) => candidate.deviceId === value);
    if (target) confirmThen(target, domain.hostname, domain.id, () => actions.bind(domain, target));
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="custom-domains-heading">
      <div>
        <h2 id="custom-domains-heading" className="text-lg font-medium">
          Custom domains
        </h2>
        <p className="text-sm text-muted-foreground">
          Addresses you own that open one of this Show's Devices, like vote.yourshow.com. The
          Device's join code keeps working alongside.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <Input
          className="min-w-48 flex-1"
          placeholder="vote.yourshow.com"
          value={hostname}
          disabled={capReached}
          onChange={(event) => setHostname(event.target.value)}
          aria-label="New custom domain"
        />
        <Select value={deviceId} onValueChange={(value) => setDeviceId(value)}>
          <SelectTrigger className="w-56" aria-label="Device it opens">
            <SelectValue>
              {device ? device.deviceName : devices.length === 0 ? "Save a Device first" : "Device"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {devices.map((option) => (
              <SelectItem key={option.deviceId} value={option.deviceId}>
                {option.deviceName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={capReached || busy || !device || hostname.trim() === ""}>
          Add domain
        </Button>
      </form>
      {capReached ? (
        <p className="text-sm text-muted-foreground">
          You're using all {CUSTOM_DOMAIN_CAP} custom domains. Remove one to add another.
        </p>
      ) : null}
      {unbound.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Or bring one you already have:</span>
          <Select value={null} onValueChange={(value) => value && bringExisting(value)}>
            <SelectTrigger className="w-72" aria-label="Bring one you already have">
              <SelectValue>Choose a domain</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {unbound.map((domain) => (
                <SelectItem
                  key={domain.id}
                  value={domain.id}
                  disabled={domain.status === "revoked"}
                >
                  {domain.hostname} — not in use
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {rows.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">
            No custom domains open this Show's Devices yet.
          </li>
        ) : null}
        {rows.map((domain) => (
          <CustomDomainRow
            key={domain.id}
            domain={domain}
            devices={devices}
            onPickDevice={(value) => pickDevice(domain, value)}
            onCheckNow={() => actions.checkNow(domain)}
            onRemove={() => void attempt(() => actions.remove(domain))}
          />
        ))}
      </ul>
      <RebindConfirm pending={pending} onCancel={() => setPending(null)} />
    </section>
  );
}

function CustomDomainRow({
  domain,
  devices,
  onPickDevice,
  onCheckNow,
  onRemove,
}: {
  domain: CustomDomain;
  devices: readonly DeviceOption[];
  onPickDevice(value: string | null): void;
  onCheckNow(): Promise<void>;
  onRemove(): void;
}) {
  const status = statusOf(domain);
  const revoked = status === "revoked";
  // Folded open for a domain that needs doing; after that the director decides.
  const [open, setOpen] = useState(() => !isLiveDomain(domain) || status === "needs_attention");
  const [checkedJustNow, setCheckedJustNow] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  useEffect(() => {
    if (!checkedJustNow) return;
    const timer = setTimeout(() => setCheckedJustNow(false), CHECK_NOW_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [checkedJustNow]);

  async function checkNow() {
    setCheckError(null);
    try {
      await onCheckNow();
    } catch (caught) {
      if (messageOf(caught) !== "Checked just now.") setCheckError(messageOf(caught));
    }
    setCheckedJustNow(true);
  }

  return (
    <Collapsible render={<li />} open={open} onOpenChange={setOpen}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,15rem)_auto] items-center gap-3 p-3">
        <span className="truncate font-mono text-sm">{domain.hostname}</span>
        <CustomDomainStatusBadge domain={domain} />
        <Select
          value={domain.binding?.deviceId ?? NOT_IN_USE}
          disabled={revoked}
          onValueChange={onPickDevice}
        >
          <SelectTrigger className="w-full min-w-0" aria-label={`Device ${domain.hostname} opens`}>
            <SelectValue>{domain.binding ? domain.binding.deviceName : "Not in use"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {devices.map((option) => (
              <SelectItem key={option.deviceId} value={option.deviceId}>
                {option.deviceName}
              </SelectItem>
            ))}
            <SelectItem value={NOT_IN_USE}>Not in use</SelectItem>
          </SelectContent>
        </Select>
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Details" />}>
          <ChevronDownIcon />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 px-3 pb-3">
          <p className="text-sm">
            {remedyFor(domain)}
            {domain.reason && !revoked ? (
              <span
                className={domain.queued ? "block text-muted-foreground" : "block text-destructive"}
              >
                {domain.reason}
              </span>
            ) : null}
            {domain.binding && !isLiveDomain(domain) && !revoked ? (
              <span className="block text-muted-foreground">
                Until it's live, {deviceLabel(domain.binding)} keeps its join code link and QR code.
              </span>
            ) : null}
          </p>
          {revoked ? null : <DnsRecordRows records={domain.records} />}
          {revoked ? null : (
            <p className="text-xs text-muted-foreground">
              Using Cloudflare? Set these records to “DNS only” (grey cloud). Remove any AAAA
              records for this address.
            </p>
          )}
          {checkError ? (
            <p role="alert" className="text-sm text-destructive">
              {checkError}
            </p>
          ) : null}
          <div className="flex gap-2">
            {revoked ? null : (
              <Button
                size="sm"
                variant="secondary"
                disabled={checkedJustNow}
                onClick={() => void checkNow()}
              >
                {checkedJustNow ? "Checked just now" : "Check now"}
              </Button>
            )}
            <Button size="sm" variant="destructive" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
