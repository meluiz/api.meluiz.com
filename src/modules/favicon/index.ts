/*
 * The boundary of the favicon module. It owns the lookup and how an icon is
 * served; the DOM side of finding one is borrowed from `metadata/extraction`.
 */

export type { AssetOptions, FaviconAsset, FaviconContentType } from './assets';
export type { GetFaviconOptions } from './service';

export { ASSET_SIZE } from './hash';
export { favicon, faviconStatic } from './routes';
export { GetFaviconQuery } from './schemas';
export { getFaviconByUrl } from './service';
