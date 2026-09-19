import type { HTMLElement, Node } from 'node-html-parser';
import type { DocumentSignals } from '../../types/analysis';

import { NodeType } from 'node-html-parser';

import { detectLanguage } from './language';

/* ///////////////////////////////////////////////// */

const MAX_MAIN_TEXT = 10_000;
const MAX_HEADING_TEXT = 300;

const METADATA_SELECTOR = "title, meta, link, script[type='application/ld+json']";

/**
 * Tags whose text content is never visible prose. `script` in particular would
 * leak JavaScript source into the language detector, where identifiers and
 * string literals read as English stopwords.
 */
const NON_TEXTUAL_TAGS = new Set(['IFRAME', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE']);

/* ///////////////////////////////////////////////// */

const tagNameOf = (element: HTMLElement) => {
  return element.tagName?.toLocaleUpperCase() ?? '';
};

const attributeOf = (element: HTMLElement, name: string) => {
  return element.getAttribute(name)?.trim().toLocaleLowerCase();
};

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

  // Joined with spaces so adjacent elements do not fuse into a single token
  return parts.join(' ').slice(0, limit);
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

/**
 * Metadata that sits outside the head. `<head>` and `<body>` tags are optional in
 * HTML and minifiers routinely drop them, and this parser does not synthesize the
 * missing elements the way a browser does. So "outside the head" is only
 * reported when the markup makes it provable: an explicit head, or an explicit
 * body that contains metadata.
 */
const metadataOutsideHead = (root: HTMLElement, metadata: HTMLElement[]) => {
  const head = root.querySelector('head');

  if (head) {
    const inHead = new Set(head.querySelectorAll(METADATA_SELECTOR));
    return metadata.filter((element) => !inHead.has(element));
  }

  const body = root.querySelector('body');

  if (body) {
    const inBody = new Set(body.querySelectorAll(METADATA_SELECTOR));
    return metadata.filter((element) => inBody.has(element));
  }

  return [];
};

/* ///////////////////////////////////////////////// */

/** DOM-level facts the metadata extractors do not model. */
export const extractDocumentSignals = (root: HTMLElement): DocumentSignals => {
  const metadata = root
    .querySelectorAll(METADATA_SELECTOR)
    .filter((element) => !isInsideSvg(element));

  const mainText = visibleText(
    root.querySelector('main') ?? root.querySelector('body') ?? root,
    MAX_MAIN_TEXT,
  );

  // Attribute values are compared case-insensitively, as browsers and crawlers do:
  // name="Description" and rel="Canonical" are still duplicates
  const descriptionCount = metadata.filter((element) => {
    return tagNameOf(element) === 'META' && attributeOf(element, 'name') === 'description';
  }).length;

  const canonicalCount = metadata.filter((element) => {
    return (
      tagNameOf(element) === 'LINK' &&
      !!attributeOf(element, 'rel')?.split(/\s+/).includes('canonical')
    );
  }).length;

  return {
    titleCount: metadata.filter((element) => tagNameOf(element) === 'TITLE').length,
    descriptionCount,
    canonicalCount,
    mainText,
    h1s: root
      .querySelectorAll('h1')
      .map((element) => visibleText(element, MAX_HEADING_TEXT))
      .filter(Boolean),
    detectedLanguage: detectLanguage(mainText),
    images: root.querySelectorAll('img').map((element) => ({
      src: element.getAttribute('src'),
      alt: element.getAttribute('alt'),
    })),
    metadataOutsideHead: metadataOutsideHead(root, metadata).map(metadataLabel),
  };
};
