// PROTOTYPE (issue #818) — atoms every variant may use. Layout stays per-variant.
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Badge,
  Button,
  CopyButton,
  cn,
} from "@mechane/design-system";
import type { GraphNode } from "@mechane/domain/graph";

import {
  STATUS_LABEL,
  bindConsequence,
  bindDomain,
  type BindConsequence,
  type CustomDomain,
  type DeviceRef,
  type DnsRecord,
} from "./domain-store";

export function StatusBadge({ domain }: { domain: CustomDomain }) {
  const failing = domain.status === "attention" || domain.status === "revoked";
  return (
    <Badge
      variant={failing ? "destructive" : domain.status === "live" ? "outline" : "muted"}
      className={cn(
        domain.status === "live" &&
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      )}
    >
      {STATUS_LABEL[domain.status]}
      {domain.dormant ? " · paused" : ""}
    </Badge>
  );
}

export function RecordRows({ records, compact }: { records: DnsRecord[]; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {records.map((record) => (
        <div
          key={`${record.type}-${record.name}`}
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
          {compact ? null : <p className="mt-1 text-muted-foreground">{record.why}</p>}
        </div>
      ))}
    </div>
  );
}

export function devicesOf(
  graphNodes: readonly GraphNode[],
  showId: string,
  showName: string,
): DeviceRef[] {
  return graphNodes
    .filter((node): node is Extract<GraphNode, { kind: "device" }> => node.kind === "device")
    .map((node) => ({ showId, showName, deviceId: node.id, deviceName: node.name }));
}

export function ago(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/**
 * The confirmation a bind needs when it disturbs something already in the
 * wild. `pending` is null when the dialog is closed.
 */
export function RebindConfirm({
  pending,
  onDone,
}: {
  pending: { domain: CustomDomain; device: DeviceRef; consequence: BindConsequence } | null;
  onDone(): void;
}) {
  if (!pending) return null;
  const { domain, device, consequence } = pending;
  return (
    <AlertDialog open onOpenChange={(open) => !open && onDone()}>
      <AlertDialogContent>
        <AlertDialogTitle>Point {domain.hostname} at {device.deviceName}?</AlertDialogTitle>
        <AlertDialogDescription>
          {consequence.moves ? (
            <>
              It opens <strong>{consequence.moves.deviceName}</strong> in{" "}
              <strong>{consequence.moves.showName}</strong> right now. Anyone who scans a poster or
              QR code with this address will land on {device.deviceName} instead, straight away.
            </>
          ) : null}
          {consequence.displaces ? (
            <>
              {" "}
              {device.deviceName} already uses <strong>{consequence.displaces.hostname}</strong>;
              that address will stop opening it and show the Mechanē holding page.
            </>
          ) : null}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              bindDomain(domain.id, device);
              onDone();
            }}
          >
            Point it here
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Binds straight away when nothing is disturbed; otherwise asks via `ask`. */
export function requestBind(
  domain: CustomDomain,
  device: DeviceRef,
  ask: (pending: { domain: CustomDomain; device: DeviceRef; consequence: BindConsequence }) => void,
): void {
  const consequence = bindConsequence(domain.id, device);
  if (consequence.moves || consequence.displaces) ask({ domain, device, consequence });
  else bindDomain(domain.id, device);
}
