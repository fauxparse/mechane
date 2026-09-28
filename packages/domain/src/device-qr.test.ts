import { create as createQrCode } from "qrcode";
import { expect, it } from "vitest";

import { deviceQrImageValue } from "./device-qr";

function svgPathFor(value: string, margin = 4): string {
  const { modules } = createQrCode(value, { errorCorrectionLevel: "M" });
  const squares: string[] = [];
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(y, x)) squares.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    }
  }
  return squares.join("");
}

const device = { id: "device-1", pairingCode: "RTS8F" };

it("encodes the Device's Player URL as SVG rows", () => {
  const image = deviceQrImageValue(device, "https://show.mechane.dev");

  expect(decodeURIComponent(image.url)).toContain(
    `<path d="${svgPathFor("https://show.mechane.dev/s/RTS8F")}"`,
  );
});

it("encodes a live Custom Domain instead of the pairing URL", () => {
  const image = deviceQrImageValue(
    { ...device, liveDomain: "vote.knifefight.nz" },
    "https://show.mechane.dev",
  );

  expect(decodeURIComponent(image.url)).toContain(
    `<path d="${svgPathFor("https://vote.knifefight.nz/")}"`,
  );
  expect(image.revision).toBe("https://vote.knifefight.nz/");
});

it("revises the image whenever the address changes", () => {
  const canonical = deviceQrImageValue(device, "https://show.mechane.dev");
  const local = deviceQrImageValue(device, "http://localhost:5174");
  const domain = deviceQrImageValue(
    { ...device, liveDomain: "vote.x.nz" },
    "https://show.mechane.dev",
  );

  expect(new Set([canonical.revision, local.revision, domain.revision]).size).toBe(3);
  expect(local.url).not.toBe(canonical.url);
  expect(domain.url).not.toBe(canonical.url);
});
