const STANDARD_PROTOCOLS = new Set(['http:', 'https:']);

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
