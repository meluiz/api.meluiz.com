import type { Crawler } from '../types';
import type { ExtractorContext } from './context';

export const extractCrawler = (ctx: ExtractorContext): Crawler => {
  const { meta } = ctx;

  return {
    robots: meta('robots'),
    bingbot: meta('bingbot'),
    referrer: meta('referrer'),
    googlebot: meta('googlebot'),
    googlebotNews: meta('googlebot-news'),
    googlebotImage: meta('googlebot-image'),
    yandex: meta('yandex'),
    baiduspider: meta('baiduspider'),
  };
};
