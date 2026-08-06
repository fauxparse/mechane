// A QR code as inline SVG (issue #45).
//
// The only thing that touches the `qrcode` package. It's used through its
// synchronous `create()` — the module matrix — rather than its rendering
// helpers, which are async and would turn a render into an effect. Drawing
// the squares ourselves is a dozen lines, and it buys three things worth
// more than that: the component renders in one pass, it works unchanged on
// the server (where a Device's QR eventually becomes an image value it can
// wire into a Scene), and swapping the generator later means editing this
// file and nothing else.
//
// It's a plain SVG with `currentColor`, so it themes like text, stays
// crisp at any size, and scans in both light and dark.
import { create as createQrCode } from "qrcode";
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
  const path = useMemo(() => {
    const { modules } = createQrCode(value, { errorCorrectionLevel: "M" });
    const segments: string[] = [];
    for (let y = 0; y < modules.size; y += 1) {
      for (let x = 0; x < modules.size; x += 1) {
        // `M x y h1 v1 h-1 z` — one module as its own subpath, so the
        // whole code is a single fillable shape rather than N elements.
        if (modules.get(x, y)) segments.push(`M${x + margin} ${y + margin}h1v1h-1z`);
      }
    }
    return { d: segments.join(""), extent: modules.size + margin * 2 };
  }, [value, margin]);

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
