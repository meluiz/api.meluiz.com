import type { AnalysisContext } from '../schemas';

/* ///////////////////////////////////////////////// */

// Directives that remove the page from the index ("none" means noindex, nofollow)
const BLOCKING_DIRECTIVES = new Set(['noindex', 'none']);

// Directives that keep the page indexed but restrict links, snippets or images
const LIMITING_DIRECTIVES = new Set(['nofollow', 'nosnippet', 'noimageindex', 'max-snippet:0']);

// Directives whose own syntax contains a colon, so they are never mistaken for
// the "user-agent:" prefix that X-Robots-Tag allows
const VALUED_DIRECTIVES = new Set([
  'max-snippet',
  'max-image-preview',
  'max-video-preview',
  'unavailable_after',
]);

// X-Robots-Tag groups addressed to these crawlers are graded with the generic ones
const GRADED_CRAWLERS = new Set(['googlebot', 'bingbot']);

/* ///////////////////////////////////////////////// */

export const textValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/** Length in user-perceived characters, so accents and emoji count once. */
export const characterLength = (value: string) => {
  return [...value].length;
};

export const clamp = (value: number) => {
  return Math.min(1, Math.max(0, value));
};

/** Outcome for a check whose missing subject is already charged by `parent`. */
export const coveredBy = (parent: string) => {
  return { outcome: 'not-applicable' as const, dependsOn: parent };
};

export const pluralize = (count: number, singular: string, plural = `${singular}s`) => {
  return count === 1 ? singular : plural;
};

/* ------- robots directives ------- */

/** Flatten meta robots values into normalized directives ("max-snippet: 0" → "max-snippet:0"). */
export const directivesOf = (...values: Array<string | undefined>) => {
  return values
    .flatMap((value) => {
      return (
        value
          ?.toLocaleLowerCase()
          .replace(/:\s+/g, ':')
          .split(/[\s,]+/) ?? []
      );
    })
    .filter(Boolean);
};

export const classifyDirectives = (directives: readonly string[]) => {
  return {
    blocksIndexing: directives.some((directive) => BLOCKING_DIRECTIVES.has(directive)),
    limitsDiscovery: directives.some((directive) => LIMITING_DIRECTIVES.has(directive)),
  };
};

/**
 * Directives from an X-Robots-Tag value that apply to generic crawlers or to the
 * graded ones. A "googlebot: noindex" group is kept; an "otherbot: noindex" group
 * is not. Directives after a user-agent prefix belong to that agent.
 */
export const headerDirectivesOf = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  const directives: string[] = [];
  let agent: string | undefined;

  for (const part of value.toLocaleLowerCase().split(',')) {
    const segment = part.trim();

    if (!segment) {
      continue;
    }

    const prefixed = /^([a-z0-9_-]+)\s*:\s*(.+)$/.exec(segment);
    let directive = segment;

    if (prefixed?.[1] && prefixed[2]) {
      if (VALUED_DIRECTIVES.has(prefixed[1])) {
        directive = `${prefixed[1]}:${prefixed[2].trim()}`;
      } else {
        agent = prefixed[1];
        directive = prefixed[2].trim();
      }
    }

    if (agent === undefined || GRADED_CRAWLERS.has(agent)) {
      directives.push(...directivesOf(directive));
    }
  }

  return directives;
};

/* ------- http ------- */

/** Canonical targets from the Link header, resolved against the page URL. */
export const httpCanonicalValues = (context: AnalysisContext, pageUrl: string) => {
  const link = context.http?.headers.link;

  if (!link) {
    return [];
  }

  return [...link.matchAll(/<([^>]+)>\s*;[^,]*\brel=["']?canonical["']?/gi)].flatMap(
    (match) => {
      const target = match[1]?.trim();

      if (!target) {
        return [];
      }

      // Relative targets are legal in Link headers; unparsable ones stay raw so the
      // check can report them as invalid
      return [URL.parse(target, pageUrl)?.toString() ?? target];
    },
  );
};

/** Canonical name of a charset label, so "utf8" and "UTF-8" compare equal. */
export const canonicalCharset = (label: string | undefined) => {
  const normalized = label
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .toLocaleLowerCase();

  if (!normalized) {
    return undefined;
  }

  try {
    return new TextDecoder(normalized as Bun.Encoding).encoding;
  } catch {
    return normalized;
  }
};
