import { classify, type Quadrant } from "./quadrant.ts";
import { fillMonthlyGaps, toQuarterly, yoy, yoyDiff, type Series } from "./series.ts";

/**
 * Growth and inflation "news" follow the "change" measure from AQR's
 * "Inflation Redux?" (2026, p. 5): the year-on-year rate minus the same
 * year-on-year rate one year earlier. A positive value means growth
 * (or inflation) is accelerating relative to a random-walk expectation.
 *
 * Both legs are compared at quarterly frequency, as in the paper: real GDP is
 * natively quarterly and monthly CPI is averaged into quarters.
 */
export interface RegimePoint {
  /** Quarter start date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly growthYoY: number;
  readonly inflationYoY: number;
  readonly growthNews: number;
  readonly inflationNews: number;
  readonly quadrant: Quadrant;
}

export interface RegimeSnapshot {
  readonly computedAt: string;
  readonly sources: { readonly growth: string; readonly inflation: string };
  /** Latest quarter for which both legs are available. */
  readonly current: RegimePoint;
  /** Oldest first. */
  readonly history: ReadonlyArray<RegimePoint>;
}

export const SOURCES = {
  growth: "GDPC1",
  inflation: "CPIAUCSL",
} as const;

export const buildHistory = (
  realGdpQuarterly: Series,
  cpiMonthly: Series,
): ReadonlyArray<RegimePoint> => {
  const growthYoY = yoy(realGdpQuarterly);
  const inflationYoY = yoy(toQuarterly(fillMonthlyGaps(cpiMonthly)));
  const growthNews = new Map(yoyDiff(growthYoY).map((o) => [o.date, o.value]));
  const inflationNews = new Map(yoyDiff(inflationYoY).map((o) => [o.date, o.value]));
  const gYoY = new Map(growthYoY.map((o) => [o.date, o.value]));
  const iYoY = new Map(inflationYoY.map((o) => [o.date, o.value]));

  return [...growthNews.keys()]
    .filter((date) => inflationNews.has(date))
    .sort()
    .map((date) => {
      const g = growthNews.get(date)!;
      const i = inflationNews.get(date)!;
      return {
        date,
        growthYoY: gYoY.get(date)!,
        inflationYoY: iYoY.get(date)!,
        growthNews: g,
        inflationNews: i,
        quadrant: classify(g, i),
      };
    });
};

export class InsufficientData extends Error {
  readonly _tag = "InsufficientData";
}

export const buildSnapshot = (
  realGdpQuarterly: Series,
  cpiMonthly: Series,
  now: Date,
): RegimeSnapshot => {
  const history = buildHistory(realGdpQuarterly, cpiMonthly);
  const current = history.at(-1);
  if (current === undefined) {
    throw new InsufficientData(
      "Need at least two years of overlapping GDP and CPI data",
    );
  }
  return {
    computedAt: now.toISOString(),
    sources: SOURCES,
    current,
    history,
  };
};
