import type { DetectedLanguage } from '../../schemas';

import { getWordsOf } from '@/shared/text';

/* ///////////////////////////////////////////////// */

const MINIMUM_WORDS = 20;
const MINIMUM_MATCHES = 2;
const MAXIMUM_CONFIDENCE = 0.95;

/**
 * Frequent function words unique to one language. Words shared by Portuguese and
 * Spanish ("que", "para", "por", "como", "de") are left out on purpose: they
 * match both languages and only produce ties. Words are compared after accent
 * stripping, so "não" is listed as "nao".
 */
const LANGUAGE_WORDS: Record<DetectedLanguage['code'], ReadonlySet<string>> = {
  en: new Set([
    'and',
    'are',
    'for',
    'from',
    'how',
    'is',
    'of',
    'that',
    'the',
    'this',
    'to',
    'with',
    'you',
    'your',
  ]),
  es: new Set([
    'al',
    'con',
    'del',
    'el',
    'en',
    'es',
    'la',
    'las',
    'los',
    'muy',
    'pero',
    'su',
    'un',
    'una',
    'y',
  ]),
  pt: new Set([
    'ao',
    'com',
    'da',
    'das',
    'do',
    'dos',
    'e',
    'em',
    'isso',
    'nao',
    'os',
    'pela',
    'pelo',
    'sao',
    'um',
    'uma',
    'voce',
  ]),
};

/* ///////////////////////////////////////////////// */

/** Guess the language of visible text; `undefined` when the evidence is weak. */
export const detectLanguage = (text: string): DetectedLanguage | undefined => {
  // Every word counts here: the most telling function words ("de", "el", "e")
  // are shorter than the three-letter minimum used for similarity tokens
  const words = getWordsOf(text);

  if (words.length < MINIMUM_WORDS) {
    return undefined;
  }

  const ranked = (Object.keys(LANGUAGE_WORDS) as Array<DetectedLanguage['code']>)
    .map((code) => ({
      code,
      matches: words.filter((word) => LANGUAGE_WORDS[code].has(word)).length,
    }))
    .sort((left, right) => right.matches - left.matches);

  const [best, second] = ranked;

  if (!best || best.matches < MINIMUM_MATCHES || best.matches === second?.matches) {
    return undefined;
  }

  return {
    code: best.code,
    confidence: Math.min(
      MAXIMUM_CONFIDENCE,
      best.matches / Math.max(4, best.matches + (second?.matches ?? 0)),
    ),
  };
};
