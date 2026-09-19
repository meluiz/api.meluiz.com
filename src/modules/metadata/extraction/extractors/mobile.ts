import type { HTMLElement } from 'node-html-parser';
import type { Mobile, TouchIcon } from '../../types';
import type { ExtractorContext } from '../context';

export const extractMobile = (ctx: ExtractorContext): Mobile => {
  const { attribute, links, meta, resolve } = ctx;

  // Icons with a missing or invalid href are kept on purpose: the analyzer
  // charges them as broken declarations in the favicon check.
  const toTouchIcon = (element: HTMLElement): TouchIcon => ({
    sizes: attribute(element, 'sizes'),
    href: resolve(attribute(element, 'href')),
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
