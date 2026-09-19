/** Public thresholds; also exposed to clients so they can explain a grade. */
export const ANALYSIS_LIMITS = {
  title: {
    minimum: 30,
    maximum: 60,
  },
  description: {
    minimum: 70,
    maximum: 160,
  },
  url: {
    maximum: 100,
  },
  queryParameters: {
    maximum: 3,
  },
  socialImage: {
    minimumWidth: 1200,
    minimumHeight: 630,
  },
} as const;
