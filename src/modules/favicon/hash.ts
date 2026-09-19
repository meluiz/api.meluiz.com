import { UrlSchema } from '@/shared/schemas';

/* ///////////////////////////////////////////////// */

// Icons behind the hash route are embedded in pages, so they have one fixed size
export const ASSET_SIZE = 64;

/*
 * The hash is the site URL in base64url. That alphabet survives a path segment
 * untouched, so nothing needs escaping, and it holds no dot, so the optional
 * extension can be split off on one.
 *
 * Both halves of the format live here: a response advertises a hash the asset
 * route has to accept back, and apart they drift.
 */

/* ///////////////////////////////////////////////// */

/**
 * Asset hash for a site URL. The URL is normalized first, so every spelling of
 * a site yields one hash, and re-encoding what `decodeAssetHash` returned gives
 * back the same hash.
 */
export const encodeAssetHash = (url: string) => {
  const result = UrlSchema.safeParse(url);

  return new TextEncoder().encode(result.success ? result.data : url).toBase64({
    alphabet: 'base64url',
    omitPadding: true,
  });
};

/** Site URL from an asset hash; `undefined` when it does not decode to a valid URL. */
export const decodeAssetHash = (hash: string) => {
  const encoded = hash.split('.')[0];

  if (!encoded) {
    return undefined;
  }

  const result = UrlSchema.safeParse(Buffer.from(encoded, 'base64url').toString());

  return result.success ? result.data : undefined;
};
