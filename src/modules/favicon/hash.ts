import { UrlSchema } from '@/shared/schemas';

/* ///////////////////////////////////////////////// */

// Icons behind the hash route are embedded in pages, so they have one fixed size
export const ASSET_SIZE = 64;

/* ///////////////////////////////////////////////// */

/** Site URL from an asset hash; `undefined` when it does not decode to a valid URL. */
export const decodeAssetHash = (hash: string) => {
  const encoded = hash.split('.')[0];

  if (!encoded) {
    return undefined;
  }

  const result = UrlSchema.safeParse(Buffer.from(encoded, 'base64url').toString());

  return result.success ? result.data : undefined;
};
