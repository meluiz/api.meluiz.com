import type { FaviconContentType } from './assets';

/* ///////////////////////////////////////////////// */

/*
 * The icon served when a site has none, or none could be fetched. It mirrors
 * what Google's favicon service answers for an unknown domain: a 16px grey
 * globe. Ours rather than theirs, so the placeholder costs no request and
 * always arrives.
 *
 * A 16x16 RGBA PNG, drawn once and inlined; the glyph is a neutral grey on a
 * transparent ground, so it reads on a light and a dark page alike.
 */

const FALLBACK_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAwElEQVR42q2TMQqDMBiFFdMbdHN39B7eoMfpYpf2DhkES516ii5CN1fPUHDpIvYFPiUUoZQ4fJC8/+XB/yeJjqdzFMKaaMRB1KKFGs38CshFJ0YxiRtMaB2e1QBXeIlGXEQvdtCjNXjy7wBDujPE4iFKL7xEi/F0czuzwfU3iL1IxFsUXkCBluAZOLMEuCFVrFN6zryADC1lX3FmCXCTfgor7piv7C3riZrF224aENxC8BCDrzH4IW3ylDf5TH/zAVs46GDKWyUvAAAAAElFTkSuQmCC';

/** Edge of the placeholder, in pixels. Matches Google's default icon. */
export const FALLBACK_SIZE = 16;

export interface FallbackAsset {
  bytes: Uint8Array;
  contentType: FaviconContentType;
}

/** The placeholder icon. Decoded once: its bytes never change. */
export const FALLBACK_ASSET: FallbackAsset = {
  bytes: Uint8Array.from(Buffer.from(FALLBACK_PNG, 'base64')),
  contentType: 'image/png',
};
