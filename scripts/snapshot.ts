// Print the current growth × inflation regime from live FRED data.
//   pnpm snapshot
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { computeSnapshot } from "../src/regime/fred.ts";

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const pp = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}pp`;

const program = Effect.gen(function* () {
  const { current, history, sources } = yield* computeSnapshot();
  console.log(`Regime (quarter starting ${current.date}): ${current.quadrant}`);
  console.log(
    `  growth    ${sources.growth.padEnd(9)} YoY ${pct(current.growthYoY).padStart(7)}  news ${pp(current.growthNews)}`,
  );
  console.log(
    `  inflation ${sources.inflation.padEnd(9)} YoY ${pct(current.inflationYoY).padStart(7)}  news ${pp(current.inflationNews)}`,
  );
  console.log("\nLast 8 quarters:");
  for (const p of history.slice(-8)) {
    console.log(
      `  ${p.date}  ${p.quadrant.padEnd(11)}  growth ${pp(p.growthNews).padStart(8)}  inflation ${pp(p.inflationNews).padStart(8)}`,
    );
  }
});

Effect.runPromise(program.pipe(Effect.provide(FetchHttpClient.layer)));
