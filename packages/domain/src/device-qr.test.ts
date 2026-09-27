import { create as createQrCode } from "qrcode";
import { expect, it } from "vitest";

import { deviceQrImageValue } from "./device-qr";

it("draws QR matrix rows as SVG rows", () => {
  const value = "https://show.mechane.dev/s/RTS8F";
  const margin = 4;
  const { modules } = createQrCode(value, { errorCorrectionLevel: "M" });
  const expectedSquares: string[] = [];

  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(y, x)) expectedSquares.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    }
  }

  const image = deviceQrImageValue("device-1", value);
  const svg = decodeURIComponent(image.url);

  expect(svg).toContain(`<path d="${expectedSquares.join("")}"`);
});
