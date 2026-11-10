/** Phone uploads stay under the platform request limit. Imports use the larger original cap. */
export const MAX_UPLOAD_BYTES = 3_500_000

/** Grid variant. The full WebP stays the only file used for fingerprints and detail. */
export const THUMB_LONG_EDGE = 480
export const THUMB_QUALITY = 60
/**
 * Part of the thumbnail URL. Change it when the thumb recipe changes so a
 * private immutable cache does not keep the previous bytes.
 */
export const THUMB_CACHE_VERSION = `${THUMB_LONG_EDGE}-${THUMB_QUALITY}`
