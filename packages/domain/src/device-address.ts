// Where a Device is opened: its live Custom Domain once it has one, or its
// pairing URL on the canonical Player origin (issues #821, #836). Links, QR
// codes and the Device's Address output all read it from here, so they
// can't disagree.
//
// The fallback always uses the canonical Player origin the caller passes,
// never the page's own origin: a projector loaded on one Device's Custom
// Domain must not put that address into another Device's QR code.
import { devicePlayerUrl } from "./device-qr";

export interface DeviceAddressSource {
  readonly pairingCode: string;
  /** The hostname of the Device's live Custom Domain, or null. */
  readonly liveDomain?: string | null;
}

export interface DeviceAddress {
  /** The full URL, for links and QR codes. */
  readonly url: string;
  /** The URL without its scheme, for reading aloud or printing. */
  readonly text: string;
}

export function deviceAddress(device: DeviceAddressSource, playerOrigin: string): DeviceAddress {
  let url: string;
  if (device.liveDomain) {
    // A `.localhost` domain only exists in development, where the Player is
    // plain HTTP on the canonical origin's port.
    const local =
      device.liveDomain === "localhost" || device.liveDomain.endsWith(".localhost")
        ? new URL(playerOrigin)
        : null;
    url = local
      ? `http://${device.liveDomain}${local.port ? `:${local.port}` : ""}/`
      : `https://${device.liveDomain}/`;
  } else {
    url = devicePlayerUrl(playerOrigin, device.pairingCode);
  }
  return { url, text: url.replace(/^[a-z]+:\/\//, "").replace(/\/$/, "") };
}
