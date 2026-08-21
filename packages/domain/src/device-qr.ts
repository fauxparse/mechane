import { create as createQrCode } from "qrcode";

import type { ImageAssetReference, ResolvedImageValue } from "./shapes";

/**
 * Produces the image value represented by a Device's QR output handle.
 *
 * The pairing code is the QR payload, so changing the code necessarily changes
 * both the image revision and the generated data URL.
 */
export function deviceQrImageValue(
  deviceId: string,
  pairingCode: string,
): ResolvedImageValue & Pick<ImageAssetReference, "revision"> {
  const { modules } = createQrCode(pairingCode, { errorCorrectionLevel: "M" });
  const margin = 4;
  const extent = modules.size + margin * 2;
  const squares: string[] = [];
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(x, y)) squares.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges"><path d="${squares.join("")}" fill="black"/></svg>`;
  return {
    assetId: `device-qr:${deviceId}`,
    revision: pairingCode,
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    width: extent,
    height: extent,
    alt: `QR code for pairing code ${pairingCode}`,
    mimeType: "image/svg+xml",
    blurHash: null,
  };
}
