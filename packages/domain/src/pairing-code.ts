/**
 * The alphabet used for Device pairing codes. It omits characters that are
 * easy to confuse when read aloud or viewed at a distance.
 */
export const CODE_ALPHABET = "123456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** The canonical shape of a Device pairing code. */
export const PAIRING_CODE_PATTERN = /^[1-9A-HJKMNP-Z]{5}$/;
