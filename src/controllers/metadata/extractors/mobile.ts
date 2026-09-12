import type { Mobile } from '../types';
import type { ExtractorContext } from './context';

export const extractMobile = (ctx: ExtractorContext): Mobile => {
  const { get, links, meta, resolve } = ctx;

  const toTouchIcon = (element: Parameters<ReturnType<typeof get>>[0]) => ({
    sizes: get('sizes')(element),
    href: resolve(get('href')(element)),
  });

  return {
    mobileWebAppCapable: meta('mobile-web-app-capable'),
    appleTouchIcons: links('apple-touch-icon').map(toTouchIcon),
    appleMobileWebAppTitle: meta('apple-mobile-web-app-title'),
    appleMobileWebAppCapable: meta('apple-mobile-web-app-capable'),
    appleTouchIconsPrecomposed: links('apple-touch-icon-precomposed').map(toTouchIcon),
    appleMobileWebAppStatusBarStyle: meta('apple-mobile-web-app-status-bar-style'),
  };
};
