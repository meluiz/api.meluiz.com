import type { HTMLElement } from 'node-html-parser';

import { createExtractorContext } from './context';

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
const ICON_PURPOSES = new Set<IconPurpose>(['any', 'maskable', 'monochrome']);

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
    const match = /^(\d+)x(\d+)$/i.exec(token);

    if (!match) {
      continue;
    }

    const width = Number(match[1]);
    const height = Number(match[2]);

    if (width === height && width > largestSquare) {
      largestSquare = width;
    }
  }

  return largestSquare > 0 ? largestSquare : null;
};

const classifyFormat = (href: string, type: string | undefined): IconFormat => {
  const dataMime = /^data:([^;,]+)/i.exec(href)?.[1];
  const mime = (type ?? dataMime)?.split(';')[0]?.trim().toLowerCase();

  if (mime === 'image/svg+xml') {
    return 'svg';
  }

  if (mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') {
    return 'ico';
  }

  let extension = '';

  try {
    const pathname = new URL(href).pathname;
    extension = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase();
  } catch {
    // Invalid candidates are discarded by the caller; format remains a best effort.
  }

  if (extension === 'svg' || extension === 'svgz') {
    return 'svg';
  }

  if (extension === 'ico' || extension === 'cur') {
    return 'ico';
  }

  return 'raster';
};

const resolveHttpUrl = (value: string | undefined, base: string) => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();

  if (/^data:image\//i.test(normalized)) {
    return normalized;
  }

  try {
    const url = new URL(normalized, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const purposesFrom = (value: unknown): IconPurpose[] => {
  if (typeof value !== 'string') {
    return ['any'];
  }

  return tokenize(value).filter((purpose): purpose is IconPurpose => {
    return ICON_PURPOSES.has(purpose as IconPurpose);
  });
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
    current.purposes = [
      ...new Set([...(current.purposes ?? []), ...(candidate.purposes ?? [])]),
    ];
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

  return size >= targetSize ? size - targetSize : 10_000 + targetSize - size;
};

/* ///////////////////////////////////////////////// */

export const rankCandidates = (
  candidates: IconCandidate[],
  targetSize = ASSUMED_DEFAULT_SIZE,
) => {
  return deduplicate(candidates).sort((left, right) => {
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
  });
};

/** Collect icon declarations and resolve them against the document's effective base URL. */
export const extractFaviconCandidates = (root: HTMLElement, documentUrl: string) => {
  const ctx = createExtractorContext(root, documentUrl);
  const candidates: IconCandidate[] = [];

  for (const link of root.querySelectorAll('link')) {
    const rels = tokenize(ctx.attribute(link, 'rel'));
    const isApple =
      rels.includes('apple-touch-icon') || rels.includes('apple-touch-icon-precomposed');

    if (!rels.includes('icon') && !isApple) {
      continue;
    }

    const href = resolveHttpUrl(
      ctx.attribute(link, 'href'),
      ctx.declaredBaseUrl ?? documentUrl,
    );

    if (!href) {
      continue;
    }

    const type = ctx.attribute(link, 'type');
    const format = classifyFormat(href, type);
    const declaredSize = parseSizes(ctx.attribute(link, 'sizes'));

    candidates.push({
      href,
      type,
      media: ctx.attribute(link, 'media'),
      size:
        format === 'svg'
          ? SCALABLE_SIZE
          : (declaredSize ?? (isApple ? ASSUMED_APPLE_SIZE : ASSUMED_DEFAULT_SIZE)),
      format,
      purposes: ['any'],
      source: 'html',
    });
  }

  return rankCandidates(candidates);
};

/** Find the manifest URL and resolve it against the document's effective base URL. */
export const extractManifestUrl = (root: HTMLElement, documentUrl: string): string | null => {
  const ctx = createExtractorContext(root, documentUrl);

  for (const link of ctx.links('manifest')) {
    const resolved = resolveHttpUrl(
      ctx.attribute(link, 'href'),
      ctx.declaredBaseUrl ?? documentUrl,
    );

    if (resolved) {
      return resolved;
    }
  }

  return null;
};

interface ManifestIcon {
  src?: unknown;
  sizes?: unknown;
  type?: unknown;
  purpose?: unknown;
}

/** Convert valid Web App Manifest icons into candidates resolved from the manifest URL. */
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

  for (const entry of icons as ManifestIcon[]) {
    if (typeof entry?.src !== 'string') {
      continue;
    }

    const href = resolveHttpUrl(entry.src, manifestUrl);
    const purposes = purposesFrom(entry.purpose);

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

  return rankCandidates(candidates);
};
