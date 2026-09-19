import type { Crawler } from '../../types';
import type { ExtractorContext } from '../context';

export const extractCrawler = (ctx: ExtractorContext): Crawler => {
  const { metaAll } = ctx;

  const directives = (name: string) => {
    const values = metaAll(name);
    return values.length > 0 ? values.join(', ') : undefined;
  };

  return {
    robots: directives('robots'),
    // The referrer policy is applied per tag, so the last one in the document wins
    referrer: metaAll('referrer').at(-1),

    yandex: directives('yandex'),
    bingbot: directives('bingbot'),
    baiduspider: directives('baiduspider'),

    googlebot: directives('googlebot'),
    googlebotNews: directives('googlebot-news'),
    googlebotImage: directives('googlebot-image'),
  };
};
