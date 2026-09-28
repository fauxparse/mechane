// The canonical Player origin, which a Device QR code points phones at.
// Deliberately not `window.location.origin`: a projector loaded on one address
// must not put that address into the QR code of a different Device (#821).
export const PLAYER_ORIGIN =
  import.meta.env.VITE_PLAYER_URL ??
  (import.meta.env.PROD || import.meta.env.VITE_DEV_PROXY === "true"
    ? "https://show.mechane.dev"
    : "http://localhost:5174");
