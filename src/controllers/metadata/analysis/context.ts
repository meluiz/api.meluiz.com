import type { HTMLElement, Node } from 'node-html-parser';
import type { MetadataAnalysisMode } from '../types';

import { NodeType } from 'node-html-parser';

import { getTokensOf } from '#util/text';

/* ///////////////////////////////////////////////// */

export interface DetectedLanguage {
  code: 'en' | 'es' | 'pt';
  confidence: number;
}

export interface DocumentImageSignal {
  src?: string;
  alt?: string;
}

export interface DocumentSignals {
  titleCount: number;
  descriptionCount: number;
  canonicalCount: number;
  h1s: string[];
  mainText: string;
  images: DocumentImageSignal[];
  metadataOutsideHead: string[];
  detectedLanguage?: DetectedLanguage;
}

export interface HttpSignals {
  status: number;
  headers: Record<string, string>;
  redirects: string[];
}

export type RemoteResourceKind = 'favicon' | 'open-graph-image' | 'twitter-image';

export interface RemoteResourceSignal {
  kind: RemoteResourceKind;
  url: string;
  status?: number;
  contentType?: string;
  bytes?: number;
  width?: number;
  height?: number;
  error?: string;
  /** The request ran out of time; the resource is unmeasured, not broken. */
  timeout?: boolean;
}

export interface RobotsSignals {
  url: string;
  status?: number;
  allowed: boolean | null;
  sitemaps: string[];
  error?: string;
  timeout?: boolean;
}

export interface SitemapSignals {
  url: string;
  status?: number;
  containsCanonical: boolean | null;
  /** Number of sitemap documents inspected, following one index level. */
  inspected?: number;
  error?: string;
  timeout?: boolean;
}

export interface AlternatePageSignal {
  url: string;
  hrefLang?: string;
  status?: number;
  canonical?: string;
  reciprocal: boolean | null;
  /** The body was cut before `</head>`, so canonical/hreflang are unknown. */
  truncated?: boolean;
  error?: string;
  timeout?: boolean;
}

export interface DeepAnalysisSignals {
  resources: RemoteResourceSignal[];
  robots?: RobotsSignals;
  sitemap?: SitemapSignals;
  alternates: AlternatePageSignal[];
}

export interface MetadataAnalysisContext {
  mode: MetadataAnalysisMode;
  document?: DocumentSignals;
  http?: HttpSignals;
  deep?: DeepAnalysisSignals;
}

/* ///////////////////////////////////////////////// */

const LANGUAGE_WORDS = {
  en: new Set(['and', 'are', 'for', 'from', 'how', 'that', 'the', 'this', 'with', 'your']),
  es: new Set(['como', 'con', 'del', 'el', 'esta', 'para', 'por', 'que', 'una', 'y']),
  pt: new Set(['como', 'com', 'da', 'de', 'do', 'esta', 'para', 'por', 'que', 'uma']),
} as const;

const MAX_MAIN_TEXT = 10_000;
const METADATA_SELECTOR = "title, meta, link, script[type='application/ld+json']";

/**
 * Tags whose text content is never visible prose. `script` in particular used
 * to leak JavaScript source into the language detector, where identifiers and
 * string literals read as English stopwords.
 */
const NON_TEXTUAL_TAGS = new Set(['IFRAME', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE']);

const tagNameOf = (element: HTMLElement) => element.tagName?.toLocaleUpperCase() ?? '';

/** `<svg><title>` is an accessibility label, not a document title. */
const isInsideSvg = (element: HTMLElement) => {
  let parent = element.parentNode;

  while (parent) {
    if (tagNameOf(parent) === 'SVG') {
      return true;
    }

    parent = parent.parentNode;
  }

  return false;
};

const visibleText = (element: HTMLElement, limit: number) => {
  const parts: string[] = [];
  let length = 0;

  const walk = (node: Node) => {
    if (length >= limit) {
      return;
    }

    if (node.nodeType === NodeType.TEXT_NODE) {
      const text = node.text.replace(/\s+/g, ' ').trim();

      if (text) {
        parts.push(text);
        length += text.length + 1;
      }

      return;
    }

    if (node.nodeType !== NodeType.ELEMENT_NODE) {
      return;
    }

    if (NON_TEXTUAL_TAGS.has(tagNameOf(node as HTMLElement))) {
      return;
    }

    for (const child of node.childNodes) {
      walk(child);
    }
  };

  walk(element);

  // Joined with spaces so adjacent elements do not fuse into a single token.
  return parts.join(' ').slice(0, limit);
};

const detectLanguage = (text: string): DetectedLanguage | undefined => {
  const tokens = getTokensOf(text);

  if (tokens.length < 20) {
    return undefined;
  }

  const scores = Object.entries(LANGUAGE_WORDS).map(([code, languageWords]) => {
    const words: ReadonlySet<string> = languageWords;

    return {
      code: code as DetectedLanguage['code'],
      matches: tokens.filter((token) => words.has(token)).length,
    };
  });

  const ordered = scores.sort((left, right) => right.matches - left.matches);
  const best = ordered[0];
  const second = ordered[1];

  if (!best || best.matches < 2 || best.matches === second?.matches) {
    return undefined;
  }

  return {
    code: best.code,
    confidence: Math.min(
      0.95,
      best.matches / Math.max(4, best.matches + (second?.matches ?? 0)),
    ),
  };
};

const metadataLabel = (element: HTMLElement) => {
  const tag = element.tagName.toLocaleLowerCase();

  if (tag === 'meta') {
    return (
      element.getAttribute('name') ??
      element.getAttribute('property') ??
      (element.hasAttribute('charset') ? 'charset' : 'meta')
    );
  }

  if (tag === 'link') {
    return `link:${element.getAttribute('rel') ?? 'unknown'}`;
  }

  return tag;
};

/* ///////////////////////////////////////////////// */

export const extractDocumentSignals = (root: HTMLElement): DocumentSignals => {
  const head = root.querySelector('head');
  const headMetadata = new Set(head?.querySelectorAll(METADATA_SELECTOR) ?? []);
  const allMetadata = root
    .querySelectorAll(METADATA_SELECTOR)
    .filter((element) => !isInsideSvg(element));
  const mainText = visibleText(
    root.querySelector('main') ?? root.querySelector('body') ?? root,
    MAX_MAIN_TEXT,
  );

  return {
    titleCount: allMetadata.filter((element) => tagNameOf(element) === 'TITLE').length,
    descriptionCount: root.querySelectorAll('meta[name=description]').length,
    canonicalCount: root.querySelectorAll('link[rel=canonical]').length,
    mainText,
    h1s: root
      .querySelectorAll('h1')
      .map((element) => visibleText(element, 300))
      .filter(Boolean),
    detectedLanguage: detectLanguage(mainText),
    images: root.querySelectorAll('img').map((element) => ({
      src: element.getAttribute('src'),
      alt: element.getAttribute('alt'),
    })),
    metadataOutsideHead: allMetadata
      .filter((element) => !headMetadata.has(element))
      .map(metadataLabel),
  };
};
