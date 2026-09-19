import type { HTMLElement } from 'node-html-parser';

type Elements = readonly HTMLElement[];
type ElementIndex = Map<string, HTMLElement[]>;

const EMPTY: Elements = Object.freeze([]);
const BASE_PROTOCOLS = new Set(['http:', 'https:']);
const UNSAFE_PROTOCOLS = new Set(['javascript:', 'vbscript:']);

/* ///////////////////////////////////////////////// */

const clean = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const normalize = (value: string | null | undefined) => {
  return clean(value)?.toLowerCase();
};

const tokenize = (value: string | null | undefined) => {
  // clean() already trimmed the edges, so the split never yields empty tokens
  return normalize(value)?.split(/\s+/) ?? [];
};

const mimeOf = (value: string | null | undefined) => {
  // "application/ld+json; charset=utf-8" -> "application/ld+json"
  return normalize(value?.split(';')[0]);
};

const append = (index: ElementIndex, key: string | undefined, element: HTMLElement) => {
  if (!key) {
    return;
  }

  const bucket = index.get(key);

  if (bucket) {
    bucket.push(element);
    return;
  }

  index.set(key, [element]);
};

const attribute = (element: HTMLElement | undefined, key: string) => {
  return clean(element?.getAttribute(key));
};

/* ///////////////////////////////////////////////// */

const indexDocument = (root: HTMLElement) => {
  const metas: ElementIndex = new Map();
  const links: ElementIndex = new Map();
  const scripts: ElementIndex = new Map();

  let base: string | undefined;

  // Single traversal in document order instead of one query per lookup
  for (const element of root.querySelectorAll('meta, link, script, base')) {
    switch (element.tagName) {
      case 'META': {
        const name = normalize(attribute(element, 'name'));
        const property = normalize(attribute(element, 'property'));

        append(metas, name, element);

        if (property !== name) {
          append(metas, property, element);
        }

        break;
      }

      case 'LINK': {
        for (const rel of new Set(tokenize(attribute(element, 'rel')))) {
          append(links, rel, element);
        }

        break;
      }

      case 'SCRIPT': {
        append(scripts, mimeOf(attribute(element, 'type')), element);
        break;
      }

      case 'BASE': {
        // Per the HTML spec, only the first <base> with an href counts
        base ??= attribute(element, 'href');
        break;
      }
    }
  }

  return { base, links, metas, scripts };
};

const resolveBaseUrl = (declared: string | undefined, documentUrl: string) => {
  if (!declared) {
    return undefined;
  }

  const candidate = URL.parse(declared, documentUrl);

  // Invalid or non-http(s) bases are ignored so extraction falls back to the document URL
  if (!candidate || !BASE_PROTOCOLS.has(candidate.protocol)) {
    return undefined;
  }

  return candidate.toString();
};

/* ///////////////////////////////////////////////// */

export type ExtractorContext = ReturnType<typeof createExtractorContext>;

export const createExtractorContext = (root: HTMLElement, resolvedUrl: string) => {
  const index = indexDocument(root);

  const declaredBaseUrl = resolveBaseUrl(index.base, resolvedUrl);
  const baseUrl = declaredBaseUrl ?? resolvedUrl;

  /* ------- queries ------- */

  const from = (selector: string) => {
    return root.querySelector(selector) ?? undefined;
  };

  const fromAll = (selector: string) => {
    return root.querySelectorAll(selector);
  };

  const get = (key: string) => {
    return (element: HTMLElement | undefined) => attribute(element, key);
  };

  const attr = (selector: string, key: string) => {
    return attribute(from(selector), key);
  };

  const text = (selector: string) => {
    return clean(from(selector)?.text.replace(/\s+/g, ' '));
  };

  /* ------- indexed lookups ------- */

  const metas = (key: string): Elements => {
    return index.metas.get(key.toLowerCase()) ?? EMPTY;
  };

  const meta = (key: string) => {
    for (const element of metas(key)) {
      const content = attribute(element, 'content');

      if (content !== undefined) {
        return content;
      }
    }

    return undefined;
  };

  const metaAll = (key: string) => {
    const values: string[] = [];

    for (const element of metas(key)) {
      const content = attribute(element, 'content');

      if (content !== undefined) {
        values.push(content);
      }
    }

    return values;
  };

  const links = (rel: string): Elements => {
    return index.links.get(rel.toLowerCase()) ?? EMPTY;
  };

  const scripts = (type: string): Elements => {
    const mime = mimeOf(type);

    if (!mime) {
      return EMPTY;
    }

    return index.scripts.get(mime) ?? EMPTY;
  };

  /* ------- values ------- */

  const resolve = (value: string | undefined) => {
    const normalized = clean(value);

    if (!normalized) {
      return undefined;
    }

    const url = URL.parse(normalized, baseUrl);

    // Never leak relative or script URLs: downstream assumes absolute, safe hrefs
    if (!url || UNSAFE_PROTOCOLS.has(url.protocol)) {
      return undefined;
    }

    return url.toString();
  };

  const toNumber = (value: string | undefined) => {
    const normalized = clean(value);

    if (!normalized) {
      return undefined;
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    baseUrl,
    declaredBaseUrl,
    from,
    fromAll,
    get,
    attr,
    attribute,
    text,
    meta,
    metaAll,
    metas,
    links,
    scripts,
    resolve,
    toNumber,
  };
};
