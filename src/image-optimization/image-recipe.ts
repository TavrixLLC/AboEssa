// Bump when encoding parameters, encoder versions, or generated formats change.
export const IMAGE_RECIPE = 'v1';
export const IMAGE_QUEUE = 'catalog-image-variants';
export const IMAGE_ATTEMPTS = 3;
export const MAX_IMAGE_EDGE = 8192;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const DEFAULT_IMAGE_PIXELS = 12_000_000;
export const CATALOG_FOLDERS = ['products', 'auctions'] as const;
export const SOURCE_KEY =
  /^(?:products|auctions)\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpe?g|webp)$/i;
export const VARIANT_PATH =
  /^[a-z0-9]+-v[1-9]\d*-(?:[a-f0-9]{64})-(?:placeholder|thumbnail|catalog|detail)\.(?:webp|jpg)$/;
export const VARIANT_FOLDER = 'catalog-variants';
