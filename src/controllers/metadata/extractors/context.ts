import type { HTMLElement } from 'node-html-parser';

export type ExtractorContext = ReturnType<typeof createExtractorContext>;

export const createExtractorContext = (root: HTMLElement, resolvedUrl: string) => {
  const from = (selector: string) => {
    return root.querySelector(selector) ?? undefined;
  };

  const fromAll = (selector: string) => {
    return root.querySelectorAll(selector);
  };

  const get = (key: string) => {
    return (element: HTMLElement | undefined) => {
      return element?.getAttribute(key);
    };
  };

  // Read an attribute straight from a selector — collapses the common from + get pair
  const attr = (selector: string, key: string) => {
    return from(selector)?.getAttribute(key);
  };

  // Map every match to one attribute's value, dropping the ones that have none
  const attrAll = (selector: string, key: string) => {
    return fromAll(selector)
      .map((element) => element.getAttribute(key))
      .filter((value): value is string => value !== undefined);
  };

  const text = (selector: string) => {
    return from(selector)?.text;
  };

  const resolve = (value: string | undefined) => {
    if (!value) {
      return undefined;
    }

    try {
      return new URL(value, resolvedUrl).toString();
    } catch {
      return value;
    }
  };

  const toNumber = (value: string | undefined) => {
    if (!value) {
      return undefined;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    from,
    fromAll,
    get,
    attr,
    attrAll,
    text,
    resolve,
    toNumber,
  };
};
