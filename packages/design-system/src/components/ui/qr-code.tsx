// An inline SVG QR code. Path generation lives in the domain package so Studio
// and Scene images use the same matrix orientation.
import { qrCodeSvgPath } from "@mechane/domain/device-qr";
import { useMemo } from "react";

import { cn } from "../../lib/utils";

export interface QrCodeProps extends React.ComponentProps<"svg"> {
  /** What a scanner should read. */
  value: string;
  /**
   * Quiet-zone width, in modules. Four is the spec's minimum, and going
   * below it is the usual reason a code that looks fine won't scan.
   */
  margin?: number;
  /** Accessible name. The QR itself is unreadable to a screen reader. */
  label?: string;
}

export function QrCode({ value, margin = 4, label, className, ...props }: QrCodeProps) {
  // A QR's contents only change when its value does, and the encoding is
  // the expensive part of rendering one.
  const path = useMemo(() => qrCodeSvgPath(value, margin), [value, margin]);

  return (
    <svg
      viewBox={`0 0 ${path.extent} ${path.extent}`}
      // `crispEdges` because a QR is squares on a grid: smoothing their
      // edges is exactly the blurring that makes a small one fail to scan.
      shapeRendering="crispEdges"
      role="img"
      aria-label={label ?? `QR code for ${value}`}
      className={cn("size-full", className)}
      {...props}
    >
      <path d={path.d} fill="currentColor" />
    </svg>
  );
}
