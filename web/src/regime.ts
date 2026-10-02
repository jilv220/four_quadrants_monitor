import { Schema as S } from "effect";

// Wire format of GET /api/regime — mirrors src/regime/snapshot.ts in the
// Worker. Decoding it with Schema means a contract drift fails loudly in
// FailedFetchRegime instead of rendering NaNs.

export const Quadrant = S.Literals([
  "Goldilocks",
  "Overheating",
  "Stagflation",
  "Recession",
]);
export type Quadrant = typeof Quadrant.Type;

export const RegimePoint = S.Struct({
  date: S.String,
  growthYoY: S.Number,
  inflationYoY: S.Number,
  growthNews: S.Number,
  inflationNews: S.Number,
  quadrant: Quadrant,
});
export type RegimePoint = typeof RegimePoint.Type;

export const RegimeSnapshot = S.Struct({
  computedAt: S.String,
  sources: S.Struct({ growth: S.String, inflation: S.String }),
  current: RegimePoint,
  history: S.Array(RegimePoint),
});
export type RegimeSnapshot = typeof RegimeSnapshot.Type;

// FORMATTING

/** `2026-04-01` -> `Q2 2026` */
export const quarterLabel = (date: string): string =>
  `Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1} ${date.slice(0, 4)}`;

/** 0.0380 -> `3.80%` */
export const percent = (x: number): string => `${(x * 100).toFixed(2)}%`;

/** 0.0134 -> `+1.34 pp` (U+2212 minus for negatives) */
export const pp = (x: number): string =>
  `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)} pp`;

// QUADRANT METADATA

export const quadrantInfo: Record<
  Quadrant,
  {
    readonly blurb: string;
    readonly badge: string;
    readonly fill: string;
    readonly dot: string;
    readonly stroke: string;
  }
> = {
  Goldilocks: {
    blurb: "Growth accelerating, inflation cooling",
    badge: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200",
    fill: "fill-emerald-50 dark:fill-emerald-950/60",
    dot: "fill-emerald-600 dark:fill-emerald-400",
    stroke: "stroke-emerald-600 dark:stroke-emerald-400",
  },
  Overheating: {
    blurb: "Growth accelerating, inflation heating up",
    badge: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200",
    fill: "fill-amber-50 dark:fill-amber-950/60",
    dot: "fill-amber-600 dark:fill-amber-400",
    stroke: "stroke-amber-600 dark:stroke-amber-400",
  },
  Stagflation: {
    blurb: "Growth slowing, inflation heating up",
    badge: "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200",
    fill: "fill-rose-50 dark:fill-rose-950/60",
    dot: "fill-rose-600 dark:fill-rose-400",
    stroke: "stroke-rose-600 dark:stroke-rose-400",
  },
  Recession: {
    blurb: "Growth slowing, inflation cooling",
    badge: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200",
    fill: "fill-sky-50 dark:fill-sky-950/60",
    dot: "fill-sky-600 dark:fill-sky-400",
    stroke: "stroke-sky-600 dark:stroke-sky-400",
  },
};
