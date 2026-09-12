const STANDARD_PROTOCOLS = new Set(['http:', 'https:']);

/* ///////////////////////////////////////////////// */

export const compareUrl = (left?: string | URL | null, right?: string | URL | null) => {
  const comparableLeft = getComparableUrl(left);
  const comparableRight = getComparableUrl(right);

  return comparableLeft !== null && comparableLeft === comparableRight;
};

export const parseHttpUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return STANDARD_PROTOCOLS.has(url.protocol) ? url : null;
  } catch {
    return null;
  }
};

export const getNormalizedUrl = (url: string): string | null => {
  let href = url.trim();

  if (href.length === 0) {
    return null;
  }

  if (href.startsWith('//')) {
    href = `https:${href}`;
  }

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(href);

  if (!hasProtocol) {
    href = `https://${href}`;
  }

  let nextUrl: URL;

  try {
    nextUrl = new URL(href);
  } catch {
    return null;
  }

  if (!STANDARD_PROTOCOLS.has(nextUrl.protocol)) {
    return null;
  }

  nextUrl.hostname = nextUrl.hostname.toLowerCase().replace(/^www\./, '');

  nextUrl.username = '';
  nextUrl.password = '';

  nextUrl.hash = nextUrl.hash.replace(/#?:~:text=.*$/, '');
  nextUrl.pathname = nextUrl.pathname.replace(/\/{2,}/g, '/');

  nextUrl.searchParams.sort();

  let result = nextUrl.toString();

  if (nextUrl.pathname === '/' && !nextUrl.search && !nextUrl.hash) {
    result = result.replace(/\/$/, '');
  }

  return result;
};

export const getComparableUrl = (value?: string | URL | null) => {
  if (!value) {
    return null;
  }

  const normalized = getNormalizedUrl(typeof value === 'string' ? value : value.toString());

  if (!normalized) {
    return null;
  }

  const url = new URL(normalized);

  url.hash = '';
  url.pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';

  return url.toString();
};
