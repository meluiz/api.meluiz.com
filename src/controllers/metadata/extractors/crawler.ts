import type { Crawler } from '../types';
import type { ExtractorContext } from './context';

export const extractCrawler = (ctx: ExtractorContext): Crawler => {
  const { meta } = ctx;

  return {
    robots: meta('robots'),
    referrer: meta('referrer'),

    yandex: meta('yandex'),
    bingbot: meta('bingbot'),
    baiduspider: meta('baiduspider'),

    googlebot: meta('googlebot'),
    googlebotNews: meta('googlebot-news'),
    googlebotImage: meta('googlebot-image'),
  };
};
