import type { HTMLElement } from 'node-html-parser';

const clean = (value: string | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const normalize = (value: string | undefined) => {
  return clean(value)?.toLowerCase();
};

const tokens = (value: string | undefined) => {
  return normalize(value)?.split(/\s+/).filter(Boolean);
};

/* ///////////////////////////////////////////////// */

export type ExtractorContext = ReturnType<typeof createExtractorContext>;

export const createExtractorContext = (root: HTMLElement, resolvedUrl: string) => {
  const from = (selector: string) => {
    return root.querySelector(selector) ?? undefined;
  };

  const fromAll = (selector: string) => {
    return root.querySelectorAll(selector);
  };

  const attribute = (element: HTMLElement | undefined, key: string) => {
    return clean(element?.getAttribute(key));
  };

  const get = (key: string) => {
    return (element: HTMLElement | undefined) => attribute(element, key);
  };

  const attr = (selector: string, key: string) => {
    return attribute(from(selector), key);
  };

  const text = (selector: string) => {
    const value = from(selector)?.text.replace(/\s+/g, ' ').trim();
    return value || undefined;
  };

  const metaIndex = new Map<string, HTMLElement[]>();

  for (const element of fromAll('meta')) {
    const keys = new Set([
      normalize(attribute(element, 'name')),
      normalize(attribute(element, 'property')),
    ]);

    for (const key of keys) {
      if (!key) {
        continue;
      }

      const elements = metaIndex.get(key) ?? [];
      elements.push(element);
      metaIndex.set(key, elements);
    }
  }

  const meta = (key: string) => metaAll(key)[0];
  const metas = (key: string) => metaIndex.get(key.toLowerCase()) ?? [];
  const metaAll = (key: string) => {
    return metas(key)
      .map((element) => attribute(element, 'content'))
      .filter((value): value is string => value !== undefined);
  };

  const linkElements = fromAll('link');
  const links = (rel: string) => {
    const normalizedRel = rel.toLowerCase();
    return linkElements.filter((element) => {
      return tokens(attribute(element, 'rel'))?.includes(normalizedRel) ?? false;
    });
  };

  const scripts = (type: string) => {
    const normalizedType = type.toLowerCase();
    return fromAll('script').filter((element) => {
      return normalize(attribute(element, 'type')?.split(';')[0]) === normalizedType;
    });
  };

  const declaredBase = attribute(
    fromAll('base').find((element) => attribute(element, 'href')),
    'href',
  );
  let baseUrl = resolvedUrl;
  let declaredBaseUrl: string | undefined;

  if (declaredBase) {
    try {
      const candidate = new URL(declaredBase, resolvedUrl);

      if (candidate.protocol === 'http:' || candidate.protocol === 'https:') {
        baseUrl = candidate.toString();
        declaredBaseUrl = baseUrl;
      }
    } catch {
      // Invalid base elements are ignored so extraction can safely use the document URL.
    }
  }

  const resolve = (value: string | undefined) => {
    const normalized = clean(value);

    if (!normalized) {
      return undefined;
    }

    try {
      return new URL(normalized, baseUrl).toString();
    } catch {
      return normalized;
    }
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
    declaredBaseUrl,
  };
};
