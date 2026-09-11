import type { HTMLElement } from 'node-html-parser';

/* ///////////////////////////////////////////////// */

// rel tokens we treat as icon declarations. mask-icon is monochrome (Safari
// pinned tabs), so we drop it entirely as a display favicon.
const ICON_RELS = new Set([
  'icon',
  'shortcut icon',
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
]);

// Assumed edge (px) for candidates that declare no `sizes`. Apple-touch icons
// are conventionally 180; a bare icon/.ico is usually small.
const ASSUMED_APPLE_SIZE = 180;
const ASSUMED_DEFAULT_SIZE = 32;

const SVG_SIZE = Number.POSITIVE_INFINITY;

export type IconFormat = 'svg' | 'ico' | 'raster';

export interface IconCandidate {
  href: string;
  size: number;
  format: IconFormat;
}

const parseSizes = (sizes: string | undefined) => {
  if (!sizes) {
    return null;
  }

  if (/\bany\b/i.test(sizes)) {
    return SVG_SIZE;
  }

  let largest = 0;

  for (const token of sizes.trim().split(/\s+/)) {
    const edge = Number.parseInt(token.split(/x/i)[0] ?? '', 10);

    if (Number.isFinite(edge) && edge > largest) {
      largest = edge;
    }
  }

  return largest > 0 ? largest : null;
};

// Classify by declared type first, then by URL extension. Drives whether the
// caller can resize it (raster) or must serve it as-is (svg/ico).
const classifyFormat = (href: string, type: string | undefined): IconFormat => {
  const value = `${type ?? ''} ${href}`.toLowerCase();

  if (value.includes('svg')) {
    return 'svg';
  }

  if (value.includes('ico') || value.includes('icon')) {
    return 'ico';
  }

  return 'raster';
};

// Rank candidates for a target size: SVG first (scales losslessly), then the
// largest raster/ico (most pixels to downscale from, mirroring Google). We
// prefer the largest rather than the closest because the caller now resizes.
export const rankCandidates = (candidates: IconCandidate[]) => {
  return [...candidates].sort((a, b) => {
    const aSvg = a.format === 'svg';
    const bSvg = b.format === 'svg';

    if (aSvg !== bSvg) {
      return aSvg ? -1 : 1;
    }

    if (a.size !== b.size) {
      return b.size - a.size;
    }

    // Equal size: prefer resizable raster over ico.
    if (a.format !== b.format) {
      return a.format === 'raster' ? -1 : 1;
    }

    return 0;
  });
};

/**
 * Collect and rank favicon candidates declared in the document, resolved
 * against the post-redirect base. Returns them best-first so the caller can
 * walk the list — resizing rasters, serving SVG as-is, and skipping ICO when a
 * resizable candidate exists. Empty when the document declares none.
 */
export const extractFaviconCandidates = (root: HTMLElement, base: string): IconCandidate[] => {
  const candidates: IconCandidate[] = [];

  for (const link of root.querySelectorAll('link')) {
    const rel = link.getAttribute('rel')?.trim().toLowerCase();

    if (!rel) {
      continue;
    }

    const isIcon = ICON_RELS.has(rel) || rel.split(/\s+/).some((token) => token === 'icon');

    if (!isIcon) {
      continue;
    }

    const href = link.getAttribute('href')?.trim();

    if (!href || href.toLowerCase().startsWith('data:')) {
      continue;
    }

    let resolved: string;

    try {
      resolved = new URL(href, base).toString();
    } catch {
      continue;
    }

    const declaredSize = parseSizes(link.getAttribute('sizes'));
    const assumedSize = rel.includes('apple-touch-icon')
      ? ASSUMED_APPLE_SIZE
      : ASSUMED_DEFAULT_SIZE;

    candidates.push({
      href: resolved,
      size: declaredSize ?? assumedSize,
      format: classifyFormat(resolved, link.getAttribute('type') ?? undefined),
    });
  }

  return rankCandidates(candidates);
};

/**
 * Find the manifest URL declared by <link rel="manifest">, resolved against the
 * post-redirect base. Null when absent.
 */
export const extractManifestUrl = (root: HTMLElement, base: string): string | null => {
  for (const link of root.querySelectorAll('link')) {
    const rel = link.getAttribute('rel')?.trim().toLowerCase();

    if (rel !== 'manifest') {
      continue;
    }

    const href = link.getAttribute('href')?.trim();

    if (!href) {
      continue;
    }

    try {
      return new URL(href, base).toString();
    } catch {
      return null;
    }
  }

  return null;
};

interface ManifestIcon {
  src?: unknown;
  sizes?: unknown;
  type?: unknown;
}

/**
 * Turn a parsed web app manifest's `icons` array into ranked candidates,
 * resolved against the manifest's own URL. Tolerant of malformed entries.
 */
export const candidatesFromManifest = (
  manifest: unknown,
  manifestUrl: string,
): IconCandidate[] => {
  const icons = (manifest as { icons?: unknown })?.icons;

  if (!Array.isArray(icons)) {
    return [];
  }

  const candidates: IconCandidate[] = [];

  for (const entry of icons as ManifestIcon[]) {
    if (typeof entry?.src !== 'string') {
      continue;
    }

    let resolved: string;

    try {
      resolved = new URL(entry.src, manifestUrl).toString();
    } catch {
      continue;
    }

    const sizes = typeof entry.sizes === 'string' ? entry.sizes : undefined;
    const type = typeof entry.type === 'string' ? entry.type : undefined;

    candidates.push({
      href: resolved,
      size: parseSizes(sizes) ?? ASSUMED_DEFAULT_SIZE,
      format: classifyFormat(resolved, type),
    });
  }

  return candidates;
};
