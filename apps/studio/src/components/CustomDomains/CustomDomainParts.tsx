// The pieces Show settings and the Device Share dialog both show: a status
// badge, the DNS records with copy buttons, and the rebind confirmation.
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  CopyButton,
  cn,
} from "@mechane/design-system";
import type { CustomDomain } from "@mechane/graphql-schema";

import {
  deviceLabel,
  recordPurpose,
  STATUS_LABEL,
  statusOf,
  type BindConsequence,
  type DeviceOption,
  type DnsRecordView,
} from "./custom-domain-model";

export function CustomDomainStatusBadge({ domain }: { domain: CustomDomain }) {
  const status = statusOf(domain);
  const failing = status === "needs_attention" || status === "revoked";
  const suffix = domain.queued ? " · queued" : domain.dormant ? " · paused" : "";
  return (
    <Badge
      variant={failing ? "destructive" : status === "live" ? "outline" : "muted"}
      className={cn(
        status === "live" &&
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {STATUS_LABEL[status]}
      {suffix}
    </Badge>
  );
}

export function DnsRecordRows({ records }: { records: readonly DnsRecordView[] }) {
  return (
    <div className="flex flex-col gap-2">
      {records.map((record) => (
        <div
          key={`${record.type}-${record.name}-${record.value}`}
          className="rounded-md border border-border bg-muted/30 p-2 text-xs"
        >
          <div className="flex items-center gap-2">
            <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono font-semibold">
              {record.type}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono" title={record.name}>
              {record.name}
            </span>
            <CopyButton value={record.name} />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-muted-foreground">→</span>
            <span className="min-w-0 flex-1 truncate font-mono" title={record.value}>
              {record.value}
            </span>
            <CopyButton value={record.value} />
          </div>
          <p className="mt-1 text-muted-foreground">{recordPurpose(record)}</p>
        </div>
      ))}
    </div>
  );
}

export interface PendingBind {
  hostname: string;
  device: DeviceOption;
  consequence: BindConsequence;
  confirm(): void;
}

/**
 * The one confirmation a bind needs when it disturbs something already in
 * the wild: moving a domain from another Device, or displacing the Device's
 * existing domain. It applies straight away.
 */
export function RebindConfirm({
  pending,
  onCancel,
}: {
  pending: PendingBind | null;
  onCancel(): void;
}) {
  if (!pending) return null;
  const { hostname, device, consequence } = pending;
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogTitle>
          Point {hostname} at {device.deviceName}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          {consequence.moves ? (
            <>
              It opens <strong>{deviceLabel(consequence.moves)}</strong> now. Posters and QR codes
              already out there will open {device.deviceName} instead, within a minute.
            </>
          ) : null}
          {consequence.displaces ? (
            <>
              {consequence.moves ? " " : null}
              {device.deviceName} already uses <strong>{consequence.displaces.hostname}</strong>,
              which will stop opening it within a minute.
            </>
          ) : null}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
          <Button onClick={pending.confirm}>Point it here</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
