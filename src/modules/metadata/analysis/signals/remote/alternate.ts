import type { AlternatePageSignal } from '../../../schemas';
import type { ProbeContext } from './probe';

import parse from 'node-html-parser';

import { discard, readBody } from '@/shared/remote';
import { getComparableUrl } from '@/shared/url';

import { decodeDocument } from '../../../document';
import { createExtractorContext } from '../../../extraction/context';
import { describeFailure, probe } from './probe';

/* ///////////////////////////////////////////////// */

const MAX_HTML_BYTES = 400_000;

/* ///////////////////////////////////////////////// */

/**
 * Visit a language alternate and check that it is self-canonical and links back
 * to the analyzed page with an hreflang annotation.
 */
export const inspectAlternate = async (
  url: string,
  hrefLang: string | undefined,
  returnUrl: string,
  context: ProbeContext,
): Promise<AlternatePageSignal> => {
  try {
    const { response, url: resolvedUrl } = await probe(
      url,
      context,
      'text/html,application/xhtml+xml;q=0.9',
    );

    if (!response.ok) {
      await discard(response);

      return {
        url,
        hrefLang,
        status: response.status,
        reciprocal: null,
        error: `The alternate responded with status ${response.status}`,
      };
    }

    const { bytes, truncated } = await readBody(response, { maxBytes: MAX_HTML_BYTES });
    const html = decodeDocument(bytes, response.headers.get('content-type') ?? '');

    // A cut before </head> means canonical and hreflang were never seen; reporting
    // that as a mismatch would invent a defect out of our own byte ceiling
    if (truncated && !/<\/head\s*>/i.test(html)) {
      return {
        url,
        hrefLang,
        status: response.status,
        reciprocal: null,
        truncated: true,
        error: 'The alternate document was larger than the inspection limit',
      };
    }

    // The extractor context resolves hrefs against <base> and matches rel tokens
    // case-insensitively, exactly as for the analyzed page
    const ctx = createExtractorContext(parse(html), resolvedUrl);
    const target = getComparableUrl(returnUrl);

    const canonical = ctx
      .links('canonical')
      .map((element) => ctx.resolve(ctx.attribute(element, 'href')))
      .find((href) => href !== undefined);

    const reciprocal = ctx.links('alternate').some((element) => {
      const href = ctx.resolve(ctx.attribute(element, 'href'));

      return (
        !!href &&
        !!ctx.attribute(element, 'hreflang') &&
        target !== null &&
        getComparableUrl(href) === target
      );
    });

    return { url, hrefLang, status: response.status, canonical, reciprocal };
  } catch (cause) {
    return { url, hrefLang, reciprocal: null, ...describeFailure(cause) };
  }
};
