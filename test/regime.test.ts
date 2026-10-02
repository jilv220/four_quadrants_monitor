import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { computeSnapshot } from "../src/regime/fred.ts";
import { classify } from "../src/regime/quadrant.ts";
import {
  fillMonthlyGaps,
  parseFredCsv,
  toQuarterly,
  yoy,
  yoyDiff,
  type Series,
} from "../src/regime/series.ts";
import { buildHistory, buildSnapshot } from "../src/regime/snapshot.ts";

/** Quarterly level series growing at the given annual rate in each year. */
const quarterlyLevels = (startYear: number, annualRates: Array<number>): Series => {
  const out: Array<{ date: string; value: number }> = [];
  let level = 100;
  annualRates.forEach((rate, i) => {
    for (let q = 0; q < 4; q++) {
      out.push({ date: `${startYear + i}-${String(q * 3 + 1).padStart(2, "0")}-01`, value: level });
      level *= (1 + rate) ** 0.25;
    }
  });
  return out;
};

/** Monthly level series growing at the given annual rate in each year. */
const monthlyLevels = (startYear: number, annualRates: Array<number>): Series => {
  const out: Array<{ date: string; value: number }> = [];
  let level = 100;
  annualRates.forEach((rate, i) => {
    for (let m = 1; m <= 12; m++) {
      out.push({ date: `${startYear + i}-${String(m).padStart(2, "0")}-01`, value: level });
      level *= (1 + rate) ** (1 / 12);
    }
  });
  return out;
};

describe("parseFredCsv", () => {
  it("parses rows and drops missing values", () => {
    const csv = "observation_date,CPIAUCSL\n2026-06-01,332.568\n2026-07-01,.\n2026-08-01,334.131\n";
    expect(parseFredCsv(csv)).toEqual([
      { date: "2026-06-01", value: 332.568 },
      { date: "2026-08-01", value: 334.131 },
    ]);
  });
});

describe("yoy / yoyDiff", () => {
  it("aligns by calendar date, not index", () => {
    // 2025-04-01 is missing: 2026-04-01 must not be compared against anything.
    const levels: Series = [
      { date: "2025-01-01", value: 100 },
      { date: "2026-01-01", value: 110 },
      { date: "2026-04-01", value: 120 },
    ];
    const rates = yoy(levels);
    expect(rates).toHaveLength(1);
    expect(rates[0]!.date).toBe("2026-01-01");
    expect(rates[0]!.value).toBeCloseTo(0.1);
  });

  it("yoyDiff measures acceleration", () => {
    const rates: Series = [
      { date: "2025-01-01", value: 0.02 },
      { date: "2026-01-01", value: 0.035 },
    ];
    expect(yoyDiff(rates)[0]!.value).toBeCloseTo(0.015);
  });
});

describe("toQuarterly", () => {
  it("averages complete quarters and drops partial ones", () => {
    const monthly: Series = [
      { date: "2026-01-01", value: 1 },
      { date: "2026-02-01", value: 2 },
      { date: "2026-03-01", value: 3 },
      { date: "2026-04-01", value: 10 },
    ];
    expect(toQuarterly(monthly)).toEqual([{ date: "2026-01-01", value: 2 }]);
  });
});

describe("fillMonthlyGaps", () => {
  it("fills a single missing month with the geometric mean", () => {
    const filled = fillMonthlyGaps([
      { date: "2025-09-01", value: 100 },
      { date: "2025-11-01", value: 121 },
    ]);
    expect(filled).toEqual([
      { date: "2025-09-01", value: 100 },
      { date: "2025-10-01", value: 110 },
      { date: "2025-11-01", value: 121 },
    ]);
  });

  it("fills across a year boundary", () => {
    const filled = fillMonthlyGaps([
      { date: "2025-11-01", value: 4 },
      { date: "2026-01-01", value: 9 },
    ]);
    expect(filled[1]).toEqual({ date: "2025-12-01", value: 6 });
  });

  it("leaves longer gaps alone", () => {
    const series: Series = [
      { date: "2025-08-01", value: 1 },
      { date: "2025-11-01", value: 2 },
    ];
    expect(fillMonthlyGaps(series)).toEqual(series);
  });
});

describe("classify", () => {
  it.each([
    [1, -1, "Goldilocks"],
    [1, 1, "Overheating"],
    [-1, 1, "Stagflation"],
    [-1, -1, "Recession"],
  ] as const)("growth %d, inflation %d -> %s", (g, i, expected) => {
    expect(classify(g, i)).toBe(expected);
  });
});

describe("buildSnapshot", () => {
  it("classifies accelerating inflation with slowing growth as Stagflation", () => {
    // Growth slows 3% -> 1%, inflation speeds up 2% -> 5%.
    const gdp = quarterlyLevels(2020, [0.03, 0.03, 0.01]);
    const cpi = monthlyLevels(2020, [0.02, 0.02, 0.05]);
    const snapshot = buildSnapshot(gdp, cpi, new Date("2026-10-02T00:00:00Z"));
    expect(snapshot.current.date).toBe("2022-10-01");
    expect(snapshot.current.quadrant).toBe("Stagflation");
    expect(snapshot.current.growthNews).toBeLessThan(0);
    expect(snapshot.current.inflationNews).toBeGreaterThan(0);
  });

  it("starts history once two years of overlap exist", () => {
    const gdp = quarterlyLevels(2020, [0.02, 0.02, 0.02]);
    const cpi = monthlyLevels(2020, [0.02, 0.02, 0.02]);
    const history = buildHistory(gdp, cpi);
    // YoY needs 1 year, news needs another: 2022 quarters only.
    expect(history.map((p) => p.date)).toEqual([
      "2022-01-01",
      "2022-04-01",
      "2022-07-01",
      "2022-10-01",
    ]);
  });

  it("throws on insufficient data", () => {
    expect(() => buildSnapshot([], [], new Date())).toThrow(/two years/);
  });
});

describe("computeSnapshot", () => {
  const toCsv = (id: string, series: Series) =>
    [`observation_date,${id}`, ...series.map((o) => `${o.date},${o.value}`)].join("\n");

  const fakeFred = (bodies: Record<string, string>) =>
    HttpClient.make((request, url) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(bodies[url.searchParams.get("id") ?? ""] ?? "", {
            status: url.searchParams.get("id")! in bodies ? 200 : 404,
          }),
        ),
      ),
    );

  it.effect("fetches both series from FRED and builds a snapshot", () =>
    Effect.gen(function* () {
      const snapshot = yield* computeSnapshot();
      expect(snapshot.sources).toEqual({ growth: "GDPC1", inflation: "CPIAUCSL" });
      expect(snapshot.current.quadrant).toBe("Overheating");
    }).pipe(
      Effect.provideService(
        HttpClient.HttpClient,
        fakeFred({
          GDPC1: toCsv("GDPC1", quarterlyLevels(2020, [0.01, 0.01, 0.03])),
          CPIAUCSL: toCsv("CPIAUCSL", monthlyLevels(2020, [0.02, 0.02, 0.04])),
        }),
      ),
    ),
  );

  it.effect("fails when FRED returns a non-2xx status", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(computeSnapshot());
      expect(result._tag).toBe("Failure");
    }).pipe(Effect.provideService(HttpClient.HttpClient, fakeFred({}))),
  );
});
