import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { Bucket } from "./bucket.ts";
import { computeSnapshot } from "./regime/fred.ts";

/** Mondays 12:00 UTC — after the prior week's US data releases. */
export const REFRESH_CRON = "0 12 * * 1";

export const LATEST_KEY = "snapshots/latest.json";
export const datedKey = (iso: string) => `snapshots/${iso.slice(0, 10)}.json`;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // Public, read-only data: let the future Foldkit UI (or anyone) read it.
  "access-control-allow-origin": "*",
};

export default Cloudflare.Worker(
  "Worker",
  { main: import.meta.url },
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(Bucket);

    /** Recompute from FRED and store as both `latest` and a dated copy. */
    const refresh = Effect.gen(function* () {
      const snapshot = yield* computeSnapshot();
      const body = JSON.stringify(snapshot);
      const options = { httpMetadata: { contentType: JSON_HEADERS["content-type"] } };
      yield* bucket.put(datedKey(snapshot.computedAt), body, options);
      yield* bucket.put(LATEST_KEY, body, options);
      yield* Effect.log(
        `regime ${snapshot.current.quadrant} for quarter ${snapshot.current.date}`,
      );
      return body;
    }).pipe(Effect.provide(FetchHttpClient.layer));

    yield* Cloudflare.Workers.cron(REFRESH_CRON, () => refresh);

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const { pathname } = new URL(request.url, "http://localhost");

        if (request.method === "GET" && pathname === "/api/regime") {
          const object = yield* bucket.get(LATEST_KEY);
          // First request after a fresh deploy: compute instead of 404-ing
          // until the first Monday cron fires.
          const body = object === null ? yield* refresh : yield* object.text();
          return HttpServerResponse.text(body, { headers: JSON_HEADERS });
        }

        return HttpServerResponse.text("Not found", { status: 404 });
      }).pipe(
        Effect.catch((error) =>
          Effect.gen(function* () {
            yield* Effect.logError(error);
            return HttpServerResponse.text("Failed to load regime snapshot", {
              status: 502,
            });
          }),
        ),
      ),
    };
  }).pipe(
    Effect.provide([
      Cloudflare.R2.ReadWriteBucketBinding,
      Cloudflare.Workers.CronEventSourceLive,
    ]),
  ),
);
