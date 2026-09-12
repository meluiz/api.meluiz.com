import type { Dict } from '@motiro/types';
import type { Author, General, StructuredData, StructuredDataIssue } from '../types';
import type { ExtractorContext } from './context';

import { isObject } from '@motiro/guard';

/* ///////////////////////////////////////////////// */

const STRUCTURED_DATA_REQUIREMENTS: Dict<string[]> = {
  Article: ['headline', 'image', 'datePublished', 'author'],
  BlogPosting: ['headline', 'image', 'datePublished', 'author'],
  BreadcrumbList: ['itemListElement'],
  Event: ['name', 'startDate', 'location'],
  FAQPage: ['mainEntity'],
  JobPosting: ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'],
  LocalBusiness: ['name', 'address'],
  NewsArticle: ['headline', 'image', 'datePublished', 'author'],
  Organization: ['name', 'url', 'logo'],
  Product: ['name', 'image', 'offers'],
  Recipe: ['name', 'image', 'recipeIngredient', 'recipeInstructions'],
  VideoObject: ['name', 'thumbnailUrl', 'uploadDate'],
  WebSite: ['name', 'url'],
};

const DATE_PROPERTIES = [
  'dateModified',
  'datePosted',
  'datePublished',
  'endDate',
  'startDate',
  'uploadDate',
];

/* ///////////////////////////////////////////////// */

const typesOf = (node: Dict) => {
  const value = node['@type'];

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && !!item.trim());
  }

  return [];
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

const hasSchemaContext = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.some(hasSchemaContext);
  }

  if (typeof value === 'string') {
    return /^https?:\/\/schema\.org\/?$/i.test(value);
  }

  if (isObject(value)) {
    return hasSchemaContext(value['@context']);
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

const validateStructuredDataNode = (node: Dict, issues: StructuredDataIssue[]) => {
  const types = typesOf(node);

  if (types.length === 0) {
    issues.push({ severity: 'error', message: 'A structured-data node has an invalid @type.' });
    return;
  }

  for (const type of types) {
    for (const property of STRUCTURED_DATA_REQUIREMENTS[type] ?? []) {
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

    if (value !== undefined && (typeof value !== 'string' || Number.isNaN(Date.parse(value)))) {
      issues.push({
        type: types[0],
        property,
        severity: 'error',
        message: `${property} is not a valid date value.`,
      });
    }
  }
};

/* ///////////////////////////////////////////////// */

const extractStructuredData = (ctx: ExtractorContext): StructuredData => {
  const scripts = ctx.scripts('application/ld+json');
  const types = new Set<string>();
  const issues: StructuredDataIssue[] = [];

  let valid = 0;
  let invalid = 0;

  for (const script of scripts) {
    try {
      const parsed: unknown = JSON.parse(script.text.trim());

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

        validateStructuredDataNode(node, issues);
      }

      valid += 1;
    } catch {
      invalid += 1;
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
  const hrefs = ctx
    .links('author')
    .map(ctx.get('href'))
    .map(ctx.resolve)
    .filter((value): value is string => value !== undefined);

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
  const { attr, attribute, fromAll, get, links, meta, metas, resolve, text } = ctx;

  const httpEquivCharset = fromAll('meta[http-equiv]').find((element) => {
    return attribute(element, 'http-equiv')?.toLowerCase() === 'content-type';
  });

  const charset =
    attr('meta[charset]', 'charset') ??
    /charset=([^;]+)/i.exec(attribute(httpEquivCharset, 'content') ?? '')?.[1]?.trim();

  const linkUrl = (rel: string) => {
    const href = links(rel).map(get('href')).find(Boolean);
    return resolve(href);
  };

  return {
    title: text('title'),
    description: meta('description'),
    url: linkUrl('canonical'),
    baseUrl: ctx.declaredBaseUrl,
    previous: linkUrl('prev') ?? linkUrl('previous'),
    next: linkUrl('next'),
    language: attr('html', 'lang'),
    charset,
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
    alternates: links('alternate').map((element) => ({
      href: resolve(get('href')(element)),
      hrefLang: get('hreflang')(element),
      media: get('media')(element),
      type: get('type')(element),
      title: get('title')(element),
    })),
    favicons: links('icon').map((element) => ({
      rel: get('rel')(element),
      type: get('type')(element),
      sizes: get('sizes')(element),
      href: resolve(get('href')(element)),
    })),
    themeColors: metas('theme-color').map((element) => ({
      media: get('media')(element),
      value: get('content')(element),
    })),
    verification: {
      google: meta('google-site-verification'),
      bing: meta('msvalidate.01'),
      yandex: meta('yandex-verification'),
      pinterest: meta('p:domain_verify'),
    },
    structuredData: extractStructuredData(ctx),
  };
};
