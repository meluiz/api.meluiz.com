import type { HTMLElement } from 'node-html-parser';
import type { ExtractorContext } from '../extraction';

/* ///////////////////////////////////////////////// */

export type IconFormat = 'svg' | 'ico' | 'raster';
export type IconPurpose = 'any' | 'maskable' | 'monochrome';
export type IconSource = 'html' | 'manifest' | 'conventional' | 'google';

export interface IconCandidate {
  href: string;
  size: number;
  format: IconFormat;
  type?: string;
  media?: string;
  purposes?: IconPurpose[];
  source?: IconSource;
}

/* ///////////////////////////////////////////////// */

const ASSUMED_APPLE_SIZE = 180;
const ASSUMED_DEFAULT_SIZE = 32;
const SCALABLE_SIZE = Number.POSITIVE_INFINITY;
const UNDERSIZED_PENALTY = 10_000;

const ICON_RELS = ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'] as const;
const ICON_PURPOSES = new Set<string>(['any', 'maskable', 'monochrome']);
const ICO_TYPES = new Set(['image/x-icon', 'image/vnd.microsoft.icon']);
const ICO_EXTENSIONS = new Set(['ico', 'cur']);
const SVG_EXTENSIONS = new Set(['svg', 'svgz']);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

/* ///////////////////////////////////////////////// */

const tokenize = (value: string | undefined) => {
  return value?.trim().toLowerCase().split(/\s+/).filter(Boolean) ?? [];
};

const parseSizes = (sizes: string | undefined) => {
  const tokens = tokenize(sizes);

  if (tokens.includes('any')) {
    return SCALABLE_SIZE;
  }

  let largestSquare = 0;

  for (const token of tokens) {
    const match = /^(\d+)x(\d+)$/.exec(token);

    if (!match) {
      continue;
    }

    const width = Number(match[1]);
    const height = Number(match[2]);

    if (width === height && width > largestSquare) {
      largestSquare = width;
    }
  }

  return largestSquare > 0 ? largestSquare : undefined;
};

const extensionOf = (href: string) => {
  const pathname = URL.parse(href)?.pathname ?? '';
  const dot = pathname.lastIndexOf('.');

  return dot === -1 ? '' : pathname.slice(dot + 1).toLowerCase();
};

const classifyFormat = (href: string, type: string | undefined): IconFormat => {
  const dataMime = /^data:([^;,]+)/i.exec(href)?.[1];
  const mime = (type ?? dataMime)?.split(';')[0]?.trim().toLowerCase();

  if (mime === 'image/svg+xml') {
    return 'svg';
  }

  if (mime && ICO_TYPES.has(mime)) {
    return 'ico';
  }

  // data: URLs have no meaningful extension; their MIME was the only signal
  if (dataMime) {
    return 'raster';
  }

  const extension = extensionOf(href);

  if (SVG_EXTENSIONS.has(extension)) {
    return 'svg';
  }

  if (ICO_EXTENSIONS.has(extension)) {
    return 'ico';
  }

  return 'raster';
};

/** Resolve an icon href: inline data:image URLs or absolute http(s) URLs only. */
const resolveIconUrl = (value: string | undefined, base: string) => {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  if (/^data:image\//i.test(normalized)) {
    return normalized;
  }

  const url = URL.parse(normalized, base);

  if (!url || !HTTP_PROTOCOLS.has(url.protocol)) {
    return undefined;
  }

  return url.toString();
};

const purposesFrom = (value: unknown): IconPurpose[] => {
  // A missing purpose means "any" per the Web App Manifest spec
  if (typeof value !== 'string') {
    return ['any'];
  }

  return tokenize(value).filter((purpose): purpose is IconPurpose => {
    return ICON_PURPOSES.has(purpose);
  });
};

const mergePurposes = (left?: IconPurpose[], right?: IconPurpose[]) => {
  // Two candidates without purposes must stay without purposes: an empty list
  // would rank them as monochrome-only instead of "any"
  if (!left && !right) {
    return undefined;
  }

  return [...new Set([...(left ?? ['any']), ...(right ?? ['any'])])];
};

const deduplicate = (candidates: IconCandidate[]) => {
  const unique = new Map<string, IconCandidate>();

  for (const candidate of candidates) {
    const current = unique.get(candidate.href);

    if (!current) {
      unique.set(candidate.href, {
        ...candidate,
        purposes: candidate.purposes ? [...candidate.purposes] : undefined,
      });

      continue;
    }

    current.size = Math.max(current.size, candidate.size);
    current.type ??= candidate.type;
    current.media ??= candidate.media;
    current.purposes = mergePurposes(current.purposes, candidate.purposes);
  }

  return [...unique.values()];
};

const purposePriority = (purposes: IconPurpose[] | undefined) => {
  if (!purposes || purposes.includes('any')) {
    return 0;
  }

  return purposes.includes('maskable') ? 1 : 2;
};

const sizeDistance = (size: number, targetSize: number) => {
  if (size === SCALABLE_SIZE) {
    return 0;
  }

  // Any icon large enough to downscale beats every icon that must be upscaled
  return size >= targetSize ? size - targetSize : UNDERSIZED_PENALTY + targetSize - size;
};

const compareCandidates = (targetSize: number) => {
  return (left: IconCandidate, right: IconCandidate) => {
    const purposeDifference = purposePriority(left.purposes) - purposePriority(right.purposes);

    if (purposeDifference !== 0) {
      return purposeDifference;
    }

    const mediaDifference = Number(!!left.media) - Number(!!right.media);

    if (mediaDifference !== 0) {
      return mediaDifference;
    }

    const scalableDifference = Number(right.format === 'svg') - Number(left.format === 'svg');

    if (scalableDifference !== 0) {
      return scalableDifference;
    }

    const sizeDifference =
      sizeDistance(left.size, targetSize) - sizeDistance(right.size, targetSize);

    if (sizeDifference !== 0) {
      return sizeDifference;
    }

    if (left.format !== right.format) {
      return left.format === 'raster' ? -1 : 1;
    }

    return 0;
  };
};

/* ///////////////////////////////////////////////// */

/** Deduplicate candidates by href and order them from best to worst for a target size. */
export const rankCandidates = (
  candidates: IconCandidate[],
  targetSize = ASSUMED_DEFAULT_SIZE,
) => {
  return deduplicate(candidates).sort(compareCandidates(targetSize));
};

/**
 * Collect icon declarations resolved against the document's effective base URL.
 * Candidates are returned unranked: the caller ranks them once, for the real target
 * size, after merging them with manifest icons.
 */
export const extractFaviconCandidates = (ctx: ExtractorContext) => {
  // An element can carry several icon rels ("icon apple-touch-icon"); it becomes
  // one candidate, treated as an Apple icon if any of its rels is an Apple one
  const elements = new Map<HTMLElement, boolean>();

  for (const rel of ICON_RELS) {
    for (const element of ctx.links(rel)) {
      elements.set(element, elements.get(element) === true || rel !== 'icon');
    }
  }

  const candidates: IconCandidate[] = [];

  for (const [element, isApple] of elements) {
    const href = resolveIconUrl(ctx.attribute(element, 'href'), ctx.baseUrl);

    if (!href) {
      continue;
    }

    const type = ctx.attribute(element, 'type');
    const format = classifyFormat(href, type);
    const assumedSize = isApple ? ASSUMED_APPLE_SIZE : ASSUMED_DEFAULT_SIZE;

    candidates.push({
      href,
      type,
      media: ctx.attribute(element, 'media'),
      size:
        format === 'svg'
          ? SCALABLE_SIZE
          : (parseSizes(ctx.attribute(element, 'sizes')) ?? assumedSize),
      format,
      purposes: ['any'],
      source: 'html',
    });
  }

  return candidates;
};

/** Find the first valid manifest URL, resolved against the document's effective base URL. */
export const extractManifestUrl = (ctx: ExtractorContext) => {
  for (const element of ctx.links('manifest')) {
    const href = resolveIconUrl(ctx.attribute(element, 'href'), ctx.baseUrl);

    // A manifest is fetched as JSON, so an inline data:image href is never valid here
    if (href && !href.startsWith('data:')) {
      return href;
    }
  }

  return undefined;
};

interface ManifestIcon {
  src?: unknown;
  sizes?: unknown;
  type?: unknown;
  purpose?: unknown;
}

/** Convert valid Web App Manifest icons into unranked candidates resolved from the manifest URL. */
export const candidatesFromManifest = (
  manifest: unknown,
  manifestUrl: string,
): IconCandidate[] => {
  if (typeof manifest !== 'object' || manifest === null) {
    return [];
  }

  const icons = (manifest as { icons?: unknown }).icons;

  if (!Array.isArray(icons)) {
    return [];
  }

  const candidates: IconCandidate[] = [];

  for (const entry of icons as Array<ManifestIcon | null>) {
    if (typeof entry?.src !== 'string') {
      continue;
    }

    const href = resolveIconUrl(entry.src, manifestUrl);
    const purposes = purposesFrom(entry.purpose);

    // Monochrome-only icons are silhouettes meant for system tinting, not favicons
    if (
      !href ||
      purposes.length === 0 ||
      purposes.every((purpose) => purpose === 'monochrome')
    ) {
      continue;
    }

    const sizes = typeof entry.sizes === 'string' ? entry.sizes : undefined;
    const type = typeof entry.type === 'string' ? entry.type.trim() || undefined : undefined;
    const format = classifyFormat(href, type);

    candidates.push({
      href,
      type,
      size: format === 'svg' ? SCALABLE_SIZE : (parseSizes(sizes) ?? ASSUMED_DEFAULT_SIZE),
      format,
      purposes,
      source: 'manifest',
    });
  }

  return candidates;
};

/* ------- fallbacks ------- */

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
