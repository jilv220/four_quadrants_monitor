/**
 * A single dated observation. `date` is ISO `YYYY-MM-DD` and marks the start
 * of the period (FRED convention: 2026-04-01 is Q2 2026 / April 2026).
 */
export interface Observation {
  readonly date: string;
  readonly value: number;
}

export type Series = ReadonlyArray<Observation>;

/**
 * Parse FRED's `fredgraph.csv` download format:
 *
 *   observation_date,CPIAUCSL
 *   2026-07-01,332.813
 *
 * Missing values (`.` or empty) are dropped.
 */
export const parseFredCsv = (csv: string): Series =>
  csv
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const [date, raw] = line.split(",");
      const value = Number(raw);
      return date && raw && raw !== "." && Number.isFinite(value)
        ? [{ date, value }]
        : [];
    });

/** Same calendar day one year earlier, e.g. `2026-04-01` -> `2025-04-01`. */
export const yearEarlier = (date: string): string =>
  `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;

/**
 * For each observation that has a counterpart exactly one year earlier,
 * combine the two. Alignment is by calendar date, not array index, so gaps
 * in the data can never silently shift the comparison window.
 */
const overYear = (
  series: Series,
  f: (now: number, yearAgo: number) => number,
): Series => {
  const byDate = new Map(series.map((o) => [o.date, o.value]));
  return series.flatMap((o) => {
    const prev = byDate.get(yearEarlier(o.date));
    return prev === undefined ? [] : [{ date: o.date, value: f(o.value, prev) }];
  });
};

/** Year-on-year growth rate of a level series, as a decimal (0.03 = 3%). */
export const yoy = (levels: Series): Series =>
  overYear(levels, (now, prev) => now / prev - 1);

/** Year-on-year difference of a rate series, in the rate's units. */
export const yoyDiff = (rates: Series): Series =>
  overYear(rates, (now, prev) => now - prev);

const addMonths = (date: string, n: number): string => {
  const total = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
};

/**
 * Fill isolated single-month gaps in a monthly level series with the
 * geometric mean of the neighbouring months. Needed because some prints were
 * never published (e.g. October 2025 CPI, skipped during the US government
 * shutdown) and a single hole would otherwise void that quarter — and, via
 * the year-over-year comparisons, the same quarter in the following two years.
 * Longer gaps are left alone.
 */
export const fillMonthlyGaps = (monthly: Series): Series =>
  monthly.flatMap((o, i) => {
    const next = monthly[i + 1];
    const missing = addMonths(o.date, 1);
    return next !== undefined && next.date === addMonths(o.date, 2)
      ? [o, { date: missing, value: Math.sqrt(o.value * next.value) }]
      : [o];
  });

const quarterStart = (date: string): string => {
  const month = Number(date.slice(5, 7));
  const qMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${date.slice(0, 4)}-${String(qMonth).padStart(2, "0")}-01`;
};

/**
 * Average a monthly series into calendar quarters (dated at quarter start,
 * matching FRED's quarterly GDP). Incomplete quarters are dropped so a
 * partially reported quarter never masquerades as a full one.
 */
export const toQuarterly = (monthly: Series): Series => {
  const buckets = new Map<string, Array<number>>();
  for (const o of monthly) {
    const q = quarterStart(o.date);
    buckets.set(q, [...(buckets.get(q) ?? []), o.value]);
  }
  return [...buckets]
    .filter(([, values]) => values.length === 3)
    .map(([date, values]) => ({
      date,
      value: values.reduce((a, b) => a + b, 0) / values.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};
