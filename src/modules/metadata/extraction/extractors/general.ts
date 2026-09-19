import type { Dict } from '@motiro/types';
import type { HTMLElement } from 'node-html-parser';
import type { Author, General, StructuredData, StructuredDataIssue } from '../../schemas';
import type { ExtractorContext } from '../context';

import { isObject } from '@motiro/guard';

/* ///////////////////////////////////////////////// */

// A Map instead of an object literal: a lookup such as "constructor" or
// "toString" must not resolve to Object.prototype members.
const STRUCTURED_DATA_REQUIREMENTS = new Map<string, readonly string[]>([
  ['Article', ['headline', 'image', 'datePublished', 'author']],
  ['BlogPosting', ['headline', 'image', 'datePublished', 'author']],
  ['BreadcrumbList', ['itemListElement']],
  ['Event', ['name', 'startDate', 'location']],
  ['FAQPage', ['mainEntity']],
  ['JobPosting', ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation']],
  ['LocalBusiness', ['name', 'address']],
  ['NewsArticle', ['headline', 'image', 'datePublished', 'author']],
  ['Organization', ['name', 'url', 'logo']],
  ['Product', ['name', 'image', 'offers']],
  ['Recipe', ['name', 'image', 'recipeIngredient', 'recipeInstructions']],
  ['VideoObject', ['name', 'thumbnailUrl', 'uploadDate']],
  ['WebSite', ['name', 'url']],
]);

const DATE_PROPERTIES = [
  'dateModified',
  'datePosted',
  'datePublished',
  'endDate',
  'startDate',
  'uploadDate',
];

const SCHEMA_CONTEXT = /^https?:\/\/schema\.org\/?$/i;
const SCHEMA_TYPE_PREFIX = /^(?:https?:\/\/schema\.org\/|schema:)/i;

// ISO 8601 as accepted by search engines: a date, optionally followed by a time
// and a timezone. Date.parse is not used because it also accepts "March 5, 2024".
const ISO_8601 =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?)?$/;

/* ///////////////////////////////////////////////// */

const normalizeType = (value: string) => {
  // "https://schema.org/Article" and "schema:Article" both mean "Article"
  return value.trim().replace(SCHEMA_TYPE_PREFIX, '');
};

const typesOf = (node: Dict) => {
  const value = node['@type'];
  const candidates = Array.isArray(value) ? value : [value];

  return candidates
    .filter((item): item is string => typeof item === 'string')
    .map(normalizeType)
    .filter(Boolean);
};

const hasValue = (value: unknown) => {
  if (typeof value === 'string') {
    return !!value.trim();
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null;
};

const isIsoDate = (value: unknown) => {
  return typeof value === 'string' && ISO_8601.test(value.trim());
};

const hasSchemaContext = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(hasSchemaContext);
  }

  if (typeof value === 'string') {
    return SCHEMA_CONTEXT.test(value.trim());
  }

  if (isObject(value)) {
    // Covers both a node ({ "@context": ... }) and an expanded context
    // object ({ "@vocab": "https://schema.org/" })
    return hasSchemaContext(value['@context']) || hasSchemaContext(value['@vocab']);
  }

  return false;
};

const collectStructuredDataNodes = (value: unknown) => {
  const pending = [value];
  const nodes: Dict[] = [];

  while (pending.length > 0) {
    const current = pending.pop();

    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }

    if (!isObject(current)) {
      continue;
    }

    if (current['@type'] !== undefined) {
      nodes.push(current);
    }

    const graph = current['@graph'];

    if (graph !== undefined) {
      pending.push(graph);
    }
  }

  return nodes;
};

const validateStructuredDataNode = (
  node: Dict,
  types: string[],
  issues: StructuredDataIssue[],
) => {
  if (types.length === 0) {
    issues.push({ severity: 'error', message: 'A structured-data node has an invalid @type.' });
    return;
  }

  for (const type of types) {
    for (const property of STRUCTURED_DATA_REQUIREMENTS.get(type) ?? []) {
      if (!hasValue(node[property])) {
        issues.push({
          type,
          property,
          severity: 'warning',
          message: `${type} is missing the recommended ${property} property.`,
        });
      }
    }
  }

  for (const property of DATE_PROPERTIES) {
    const value = node[property];

    if (value !== undefined && !isIsoDate(value)) {
      issues.push({
        type: types[0],
        property,
        severity: 'error',
        message: `${property} is not a valid ISO 8601 date.`,
      });
    }
  }
};

/* ///////////////////////////////////////////////// */

const extractTitle = (ctx: ExtractorContext) => {
  // The first <title> outside inline SVG: an icon's <title> is not the page title
  const element = ctx.fromAll('title').find((title) => !title.closest('svg'));
  const value = element?.text.replace(/\s+/g, ' ').trim();

  return value || undefined;
};

const extractCharset = (ctx: ExtractorContext) => {
  const declared = ctx.attr('meta[charset]', 'charset');

  if (declared) {
    return declared;
  }

  const httpEquiv = ctx.fromAll('meta[http-equiv]').find((element) => {
    return ctx.attribute(element, 'http-equiv')?.toLowerCase() === 'content-type';
  });

  return /charset=([^;]+)/i.exec(ctx.attribute(httpEquiv, 'content') ?? '')?.[1]?.trim();
};

const extractStructuredData = (ctx: ExtractorContext): StructuredData => {
  const scripts = ctx.scripts('application/ld+json');
  const types = new Set<string>();
  const issues: StructuredDataIssue[] = [];

  let valid = 0;
  let invalid = 0;

  for (const script of scripts) {
    let parsed: unknown;

    try {
      // rawText, not text: script content is never entity-decoded by browsers,
      // and decoding would turn a literal &quot; inside a JSON string into a quote
      parsed = JSON.parse(script.rawText.trim());
    } catch {
      invalid += 1;
      continue;
    }

    valid += 1;

    if (!hasSchemaContext(parsed)) {
      issues.push({
        severity: 'warning',
        property: '@context',
        message: 'The JSON-LD block does not declare https://schema.org as its context.',
      });
    }

    const nodes = collectStructuredDataNodes(parsed);

    if (nodes.length === 0) {
      issues.push({
        severity: 'error',
        property: '@type',
        message: 'The JSON-LD block does not contain a typed structured-data node.',
      });
    }

    for (const node of nodes) {
      const nodeTypes = typesOf(node);

      for (const type of nodeTypes) {
        types.add(type);
      }

      validateStructuredDataNode(node, nodeTypes, issues);
    }
  }

  return {
    count: scripts.length,
    valid,
    invalid,
    types: [...types],
    issues,
  };
};

const extractAuthors = (ctx: ExtractorContext): Author[] => {
  const names = ctx.metaAll('author');
  const hrefs = ctx.links('author').flatMap((element) => {
    const href = ctx.resolve(ctx.attribute(element, 'href'));
    return href ? [href] : [];
  });

  const count = Math.max(names.length, hrefs.length);
  const authors: Author[] = [];

  for (let index = 0; index < count; index += 1) {
    authors.push({
      name: names[index],
      href: hrefs[index],
    });
  }

  return authors;
};

/* ///////////////////////////////////////////////// */

export const extractGeneral = (ctx: ExtractorContext): General => {
  const { attr, attribute, links, meta, metas, resolve } = ctx;

  const linkUrl = (rel: string) => {
    for (const element of links(rel)) {
      const href = resolve(attribute(element, 'href'));

      if (href) {
        return href;
      }
    }

    return undefined;
  };

  const toAlternate = (element: HTMLElement) => ({
    href: resolve(attribute(element, 'href')),
    hrefLang: attribute(element, 'hreflang'),
    media: attribute(element, 'media'),
    type: attribute(element, 'type'),
    title: attribute(element, 'title'),
  });

  const toFavicon = (element: HTMLElement) => ({
    rel: attribute(element, 'rel'),
    type: attribute(element, 'type'),
    sizes: attribute(element, 'sizes'),
    href: resolve(attribute(element, 'href')),
  });

  const toThemeColor = (element: HTMLElement) => ({
    media: attribute(element, 'media'),
    value: attribute(element, 'content'),
  });

  return {
    title: extractTitle(ctx),
    description: meta('description'),
    url: linkUrl('canonical'),
    baseUrl: ctx.declaredBaseUrl,
    previous: linkUrl('prev') ?? linkUrl('previous'),
    next: linkUrl('next'),
    language: attr('html', 'lang'),
    charset: extractCharset(ctx),
    robots: meta('robots'),
    keywords: meta('keywords'),
    generator: meta('generator'),
    license: meta('license'),
    viewport: meta('viewport'),
    colorScheme: meta('color-scheme'),
    formatDetection: meta('format-detection'),
    applicationName: meta('application-name'),
    manifest: linkUrl('manifest'),
    authors: extractAuthors(ctx),
    alternates: links('alternate').map(toAlternate),
    favicons: links('icon').map(toFavicon),
    themeColors: metas('theme-color').map(toThemeColor),
    verification: {
      google: meta('google-site-verification'),
      bing: meta('msvalidate.01'),
      yandex: meta('yandex-verification'),
      pinterest: meta('p:domain_verify'),
    },
    structuredData: extractStructuredData(ctx),
  };
};
