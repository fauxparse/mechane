import { Button, Check, Copy, Label, QrCode } from "@mechane/design-system";
import type { DeviceNode } from "@mechane/domain";
import { useCallback, useEffect, useState } from "react";

/**
 * How a physical device joins this one (#45): the code, the same code as a
 * QR, and a plain statement of what kind of Device it is.
 *
 * Nothing here is editable. The code is the server's to mint, and
 * `perConnection` is fixed at creation because it decides Event
 * attribution — a control that looks editable would promise a change the
 * model deliberately doesn't allow.
 */
export function DevicePairing({ device }: { device: DeviceNode }) {
  const [copied, setCopied] = useState(false);
  const code = device.pairingCode;

  const copy = useCallback(() => {
    if (!code) return;
    void navigator.clipboard.writeText(code).then(() => setCopied(true));
  }, [code]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Pairing code</Label>
        {code ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg tracking-widest">{code}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={copy}
              aria-label={`Copy pairing code ${code}`}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        ) : (
          // The gap between creating a Device and the first save landing:
          // ids are the client's, codes are the server's (#45).
          <p className="text-xs text-muted-foreground">Assigned when the Show is saved.</p>
        )}
      </div>

      {code ? (
        <div className="flex flex-col gap-1.5">
          <Label>QR</Label>
          <QrCode value={code} className="size-40" label={`QR code for pairing code ${code}`} />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {device.perConnection
          ? "Every phone that joins is its own instance, navigating independently. Events are anonymous."
          : "Everything that joins sees the same thing, and its Events count as this Device's."}
      </p>
    </div>
  );
}
