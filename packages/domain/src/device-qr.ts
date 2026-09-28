import { create as createQrCode } from "qrcode";

import type { ImageAssetReference, ResolvedImageValue } from "./shapes";

export function qrCodeSvgPath(value: string, margin = 4): { d: string; extent: number } {
  const { modules } = createQrCode(value, { errorCorrectionLevel: "M" });
  const segments: string[] = [];
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(y, x)) segments.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    }
  }
  return { d: segments.join(""), extent: modules.size + margin * 2 };
}

/** Where a physical device joins the Show a pairing code belongs to. */
export function devicePlayerUrl(playerOrigin: string, pairingCode: string): string {
  return new URL(`/s/${pairingCode}`, playerOrigin).toString();
}

/**
 * Produces the image value represented by a Device's QR output handle.
 *
 * The QR payload is the Device's Player URL, so a phone camera lands in the
 * Player. That URL is also the image revision: changing either the pairing
 * code or the Player origin changes both the revision and the data URL.
 */
export function deviceQrImageValue(
  deviceId: string,
  pairingCode: string,
  playerOrigin: string,
): ResolvedImageValue & Pick<ImageAssetReference, "revision"> {
  const margin = 4;
  const playerUrl = devicePlayerUrl(playerOrigin, pairingCode);
  const { d, extent } = qrCodeSvgPath(playerUrl, margin);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges"><path d="${d}" fill="black"/></svg>`;
  return {
    assetId: `device-qr:${deviceId}`,
    revision: playerUrl,
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    width: extent,
    height: extent,
    alt: `QR code for pairing code ${pairingCode}`,
    mimeType: "image/svg+xml",
    blurHash: null,
  };
}
