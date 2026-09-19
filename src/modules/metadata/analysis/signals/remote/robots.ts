import type { RobotsSignals } from '../../../schemas/analysis';
import type { ProbeContext } from './probe';

import { discard, readBody } from '@/shared/remote';

import { describeFailure, probe } from './probe';

/* ///////////////////////////////////////////////// */

// Google reads the first 500 KiB of robots.txt and ignores the rest
const MAX_ROBOTS_BYTES = 512_000;

// The crawler whose group is evaluated; generic "*" rules apply when no group names it
const CRAWLER = 'googlebot';

/* ///////////////////////////////////////////////// */

interface RobotsRule {
  directive: 'allow' | 'disallow';
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

/* ///////////////////////////////////////////////// */

const escapePattern = (value: string) => {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
};

/** Robots path matching: `*` is a wildcard and a trailing `$` anchors the end. */
const pathMatches = (rule: string, path: string) => {
  const endAnchored = rule.endsWith('$');
  const source = escapePattern(endAnchored ? rule.slice(0, -1) : rule);

  return new RegExp(`^${source}${endAnchored ? '$' : ''}`).test(path);
};

/** How specific an agent is for the crawler; `-1` when it does not apply. */
const agentSpecificity = (agent: string) => {
  if (agent === '*') {
    return 0;
  }

  return CRAWLER.startsWith(agent) ? agent.length : -1;
};

const parseRobots = (body: string, pageUrl: URL) => {
  const sitemaps: string[] = [];
  const groups: RobotsGroup[] = [];

  let group: RobotsGroup | undefined;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim();
    const separator = line?.indexOf(':') ?? -1;

    if (!line || separator < 0) {
      continue;
    }

    const field = line.slice(0, separator).trim().toLocaleLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'sitemap') {
      // Invalid sitemap declarations are ignored and surface as absence
      const sitemap = URL.parse(value, pageUrl.href);

      if (sitemap) {
        sitemaps.push(sitemap.toString());
      }

      continue;
    }

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group; a rule closes it
      if (!group || group.rules.length > 0) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }

      group.agents.push(value.toLocaleLowerCase());
      continue;
    }

    // An empty Disallow allows everything, so it adds no rule
    if ((field === 'allow' || field === 'disallow') && group && value) {
      group.rules.push({ directive: field, path: value });
    }
  }

  // Only the most specific matching groups apply; "*" is the fallback
  const specificity = Math.max(
    -1,
    ...groups.flatMap(({ agents }) => agents.map(agentSpecificity)),
  );

  const rules =
    specificity < 0
      ? []
      : groups
          .filter(({ agents }) =>
            agents.some((agent) => agentSpecificity(agent) === specificity),
          )
          .flatMap(({ rules }) => rules);

  // The longest matching rule wins; on a tie, allow wins
  const path = `${pageUrl.pathname}${pageUrl.search}`;
  const [winner] = rules
    .filter((rule) => pathMatches(rule.path, path))
    .sort((left, right) => {
      const byLength = right.path.length - left.path.length;
      return byLength !== 0 ? byLength : left.directive === 'allow' ? -1 : 1;
    });

  return {
    allowed: winner ? winner.directive === 'allow' : null,
    sitemaps,
  };
};

/* ///////////////////////////////////////////////// */

export const inspectRobots = async (
  pageUrl: string,
  context: ProbeContext,
): Promise<RobotsSignals> => {
  const page = new URL(pageUrl);
  const url = new URL('/robots.txt', page).toString();

  try {
    const { response } = await probe(url, context, 'text/plain,*/*;q=0.1');

    // RFC 9309: a robots.txt that is unavailable (4xx other than 429) imposes no
    // rules. 5xx and 429 mean it is unreachable, which is left as unknown.
    const unavailable =
      response.status >= 400 && response.status < 500 && response.status !== 429;

    if (unavailable) {
      await discard(response);
      return { url, status: response.status, allowed: null, sitemaps: [] };
    }

    if (!response.ok) {
      await discard(response);

      return {
        url,
        status: response.status,
        allowed: null,
        sitemaps: [],
        error: `robots.txt responded with status ${response.status}`,
      };
    }

    // Past the limit the file is truncated, as crawlers do, instead of rejected
    const { bytes } = await readBody(response, { maxBytes: MAX_ROBOTS_BYTES });
    const parsed = parseRobots(new TextDecoder().decode(bytes), page);

    return { url, status: response.status, ...parsed };
  } catch (cause) {
    return { url, allowed: null, sitemaps: [], ...describeFailure(cause) };
  }
};
