import type { IconCandidate } from '../extraction';

import { ASSUMED_APPLE_SIZE, ASSUMED_DEFAULT_SIZE, SCALABLE_SIZE } from '../extraction';

/* ///////////////////////////////////////////////// */

/*
 * Candidates nobody declared. The icons a page or its manifest does declare are
 * read from the DOM by the extraction layer; these are the guesses made when
 * that comes back empty, so they are the only ones that belong to the favicon
 * lookup itself.
 */

const GOOGLE_FAVICON_ENDPOINT = 'https://www.google.com/s2/favicons';

/** Size requested from Google; large enough to downscale to any supported size. */
export const GOOGLE_FAVICON_SIZE = 128;

const CONVENTIONAL_PATHS = [
  ['/favicon.svg', SCALABLE_SIZE, 'svg'],
  ['/apple-touch-icon.png', ASSUMED_APPLE_SIZE, 'raster'],
  ['/favicon.png', 64, 'raster'],
  ['/favicon.ico', ASSUMED_DEFAULT_SIZE, 'ico'],
] as const;

/** Well-known locations browsers probe when a page declares no icon. */
export const conventionalCandidates = (url: string): IconCandidate[] => {
  return CONVENTIONAL_PATHS.map(([pathname, size, format]) => ({
    href: new URL(pathname, url).toString(),
    size,
    format,
    purposes: ['any'],
    source: 'conventional',
  }));
};

/** Last resort: Google's favicon service, which knows icons of most public sites. */
export const googleCandidate = (url: string): IconCandidate => {
  const endpoint = new URL(GOOGLE_FAVICON_ENDPOINT);

  endpoint.searchParams.set('domain_url', new URL('/', url).toString());
  endpoint.searchParams.set('sz', String(GOOGLE_FAVICON_SIZE));

  return {
    href: endpoint.toString(),
    size: GOOGLE_FAVICON_SIZE,
    format: 'raster',
    purposes: ['any'],
    source: 'google',
  };
};
