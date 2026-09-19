/*
 * The request and response contracts of the module. Request schemas validate
 * what comes in; the response is binary, so it is described rather than parsed.
 */

export { GetFaviconAssetParam, GetFaviconQuery } from './request';
export { FALLBACK_RESPONSE, IMAGE_RESPONSE } from './response';
