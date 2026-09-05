import type { Crawler } from '../types';
import type { ExtractorContext } from './context';

export const extractCrawler = (ctx: ExtractorContext): Crawler => {
  const { attr } = ctx;

  return {
    robots: attr('meta[name=robots]', 'content'),
    bingbot: attr('meta[name=bingbot]', 'content'),
    referrer: attr('meta[name=referrer]', 'content'),
    googlebot: attr('meta[name=googlebot]', 'content'),
  };
};
