import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import { parseFredCsv } from "./series.ts";
import { buildSnapshot, SOURCES } from "./snapshot.ts";

/**
 * FRED's public graph CSV endpoint — no API key required.
 * `cosd` (chart observation start date) trims the payload.
 */
export const fredCsvUrl = (seriesId: string, start: string) =>
  `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}&cosd=${start}`;

export const fetchFredSeries = Effect.fn("fetchFredSeries")(function* (
  seriesId: string,
  start = "1990-01-01",
) {
  const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const response = yield* client.get(fredCsvUrl(seriesId, start));
  return parseFredCsv(yield* response.text);
});

/** Fetch both legs from FRED and compute the current regime snapshot. */
export const computeSnapshot = Effect.fn("computeSnapshot")(function* (
  start = "1990-01-01",
) {
  const [gdp, cpi] = yield* Effect.all(
    [fetchFredSeries(SOURCES.growth, start), fetchFredSeries(SOURCES.inflation, start)],
    { concurrency: 2 },
  );
  return yield* Effect.try(() => buildSnapshot(gdp, cpi, new Date()));
});
