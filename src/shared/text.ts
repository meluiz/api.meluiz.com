const BRAND_SEPARATOR = /\s+[|–—·•:>-]+\s+/;
const MAX_BRAND_SUFFIX_LENGTH = 30;

/* ///////////////////////////////////////////////// */

const diceCoefficient = (left: string[], right: string[]) => {
  const leftTokens = new Set(left);
  const rightTokens = new Set(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return (2 * intersection) / (leftTokens.size + rightTokens.size);
};

const topFrequency = (items: string[]) => {
  const frequencies = new Map<string, number>();

  let highest = 0;

  for (const item of items) {
    const next = (frequencies.get(item) ?? 0) + 1;
    frequencies.set(item, next);

    if (next > highest) {
      highest = next;
    }
  }

  return highest;
};

/* ///////////////////////////////////////////////// */

export const normalizeText = (value: string) => {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
};

export const stripBrandSuffix = (value: string) => {
  const segments = value
    .split(BRAND_SEPARATOR)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length < 2) {
    return value;
  }

  const first = segments[0] ?? '';
  const last = segments[segments.length - 1] ?? '';

  return last.length <= MAX_BRAND_SUFFIX_LENGTH && last.length < first.length
    ? segments.slice(0, -1).join(' ')
    : value;
};

export const textSimilarity = (left: string, right: string) => {
  const raw = diceCoefficient(getTokensOf(left), getTokensOf(right));
  const stripped = diceCoefficient(
    getTokensOf(stripBrandSuffix(left)),
    getTokensOf(stripBrandSuffix(right)),
  );

  return Math.max(raw, stripped);
};

export const repetitionRatio = (value: string) => {
  const words = getTokensOf(value);

  if (words.length < 5) {
    return 0;
  }

  const bigrams = words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`);
  const unigramFrequency = topFrequency(words);
  const bigramFrequency = topFrequency(bigrams);

  if (unigramFrequency < 3 && bigramFrequency < 2) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(unigramFrequency / words.length, (bigramFrequency * 2) / words.length),
  );
};

export const isKeywordStuffed = (value: string) => {
  const length = getTokensOf(value).length;

  if (length < 5) {
    return false;
  }

  const threshold = length <= 8 ? 0.34 : length <= 20 ? 0.25 : 0.2;

  return repetitionRatio(value) >= threshold;
};

export const getWordsOf = (value: string) => {
  return normalizeText(value).split(/\s+/).filter(Boolean);
};

export const getTokensOf = (value: string) => {
  return getWordsOf(value).filter((token) => token.length > 2);
};

export const hasComparableTokens = (value: string) => {
  return getTokensOf(value).length > 0;
};
